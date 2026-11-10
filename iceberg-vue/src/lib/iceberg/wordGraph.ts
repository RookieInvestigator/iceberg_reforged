// 词条星图：相似度边 + 自写力导向布局。
//
// 为什么不用 d3-force：项目没有 d3 依赖（package.json 里只有 three / fuse / tween 等），
// 为一张图引入整个 d3 家族不划算。这张图只需要「斥力 + 弹簧 + 向心」三股力，
// 自己写反而更好控 —— 节点 1461 个，必须能按帧推进而不是一口气算完。
//
// 边的来源：同分类 / 共标签的词条之间连一条线。手工关联（related.csv）只有 67 行，
// 撑不起一张图；相似度才是这张图的骨架，与 lib/iceberg/useRelatedIndex.ts 同一套思路
// （那里给每条词条找 2 条「相关推荐」，这里取 top-N 当边）。
import { mulberry32 } from '../iceberg3d/prng'

export interface GraphSourceItem {
  id: string
  title: string
  category: string
  categories?: string[]
  tags?: string[]
  tier?: string
}

export interface GraphNode {
  id: string
  title: string
  category: string
  tier: string
  color: string
  x: number
  y: number
  vx: number
  vy: number
  /** 连边数；决定点的大小 */
  degree: number
}

export interface GraphEdge {
  a: number
  b: number
  /** 相似度权重（越大关系越近） */
  w: number
}

export interface WordGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  index: Map<string, number>
}

export interface BuildGraphOptions {
  /** 每个词条最多连几条边 */
  maxNeighbors?: number
  /** 节点配色（按分类取色） */
  colorOf?: (item: GraphSourceItem) => string
  /** 初始布局的随机种子（固定 → 每次打开图形一致） */
  seed?: number
}

const MAX_NEIGHBORS = 6
const SCORE_MAIN_CATEGORY = 3
const SCORE_EXTRA_CATEGORY = 2
const SCORE_SHARED_TAG = 2
/** 标题共现的加分上限（只给已是候选的词条加分，不单独当候选来源） */
const SCORE_SHARED_BIGRAM = 1
const BIGRAM_BONUS_CAP = 3
const BIGRAM_CANDIDATE_CAP = 24
const MIN_SCORE = 2

/** 标题二元组：汉字两字一组，中文标题里共现率比单字高得多 */
function bigrams(title: string): Set<string> {
  const s = title.replace(/[\s·・「」『』“”"'()（）【】\[\]，,。.!！?？:：;；\-—…~]/g, '')
  const out = new Set<string>()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  return out
}

function categoriesOf(item: GraphSourceItem): string[] {
  const list = item.categories && item.categories.length ? item.categories : [item.category]
  return list.filter((c) => !!c)
}

/**
 * 建图：节点 = 词条，边 = 相似度。
 * 纯函数，无副作用，可单测。
 */
export function buildGraph(items: GraphSourceItem[], options: BuildGraphOptions = {}): WordGraph {
  const maxNeighbors = options.maxNeighbors ?? MAX_NEIGHBORS
  const seed = options.seed ?? 20260707
  const n = items.length

  const nodes: GraphNode[] = items.map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    tier: it.tier || '',
    color: options.colorOf ? options.colorOf(it) : '#ffffff',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: 0,
  }))
  const index = new Map<string, number>()
  items.forEach((it, i) => index.set(it.id, i))

  // ── 倒排索引：候选只来自「同分类」与「共标签」 ──
  const catIdx = new Map<string, number[]>()
  const tagIdx = new Map<string, number[]>()
  const itemBigrams = items.map((it) => bigrams(it.title))

  items.forEach((it, i) => {
    for (const cat of categoriesOf(it)) {
      const list = catIdx.get(cat)
      if (list) list.push(i)
      else catIdx.set(cat, [i])
    }
    for (const tag of it.tags || []) {
      const list = tagIdx.get(tag)
      if (list) list.push(i)
      else tagIdx.set(tag, [i])
    }
  })

  // ── 逐点打分 → top-N ──
  const edgeMap = new Map<string, number>()
  const scoreBuf = new Map<number, number>()

  for (let i = 0; i < n; i++) {
    scoreBuf.clear()
    const item = items[i]!
    const ownCats = new Set(categoriesOf(item))

    for (const cat of ownCats) {
      const list = catIdx.get(cat)
      if (!list) continue
      const w = cat === item.category ? SCORE_MAIN_CATEGORY : SCORE_EXTRA_CATEGORY
      for (const j of list) {
        if (j === i) continue
        scoreBuf.set(j, (scoreBuf.get(j) || 0) + w)
      }
    }
    for (const tag of item.tags || []) {
      const list = tagIdx.get(tag)
      if (!list) continue
      for (const j of list) {
        if (j === i) continue
        scoreBuf.set(j, (scoreBuf.get(j) || 0) + SCORE_SHARED_TAG)
      }
    }

    // 标题共现只给当前分数最高的候选加分：它的作用是「把同题材的拉近」，
    // 不适合当候选来源（中文二元组太泛，会把整张图连成一团）
    if (scoreBuf.size > 0) {
      const ranked = [...scoreBuf.entries()].sort((x, y) => y[1] - x[1]).slice(0, BIGRAM_CANDIDATE_CAP)
      const mine = itemBigrams[i]!
      for (const [j, score] of ranked) {
        const other = itemBigrams[j]!
        if (!other) continue
        let shared = 0
        for (const g of mine) {
          if (other.has(g)) {
            shared++
            if (shared >= BIGRAM_BONUS_CAP) break
          }
        }
        if (shared > 0) scoreBuf.set(j, score + shared * SCORE_SHARED_BIGRAM)
      }
    }

    const ranked = [...scoreBuf.entries()]
      .filter(([, score]) => score >= MIN_SCORE)
      .sort((x, y) => y[1] - x[1])
      .slice(0, maxNeighbors)

    for (const [j, score] of ranked) {
      const a = Math.min(i, j)
      const b = Math.max(i, j)
      const key = `${a}:${b}`
      const prev = edgeMap.get(key)
      if (prev === undefined || score > prev) edgeMap.set(key, score)
    }
  }

  const edges: GraphEdge[] = []
  for (const [key, w] of edgeMap) {
    const [aStr, bStr] = key.split(':')
    const a = Number(aStr)
    const b = Number(bStr)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    edges.push({ a, b, w })
    nodes[a]!.degree++
    nodes[b]!.degree++
  }

  seedInitialPositions(nodes, items, seed)

  return { nodes, edges, index }
}

/**
 * 初始位置：按分类分扇区撒点。
 * 同分类的词条天然聚在一起，力导向只要几轮就能把它们分开 —— 随机撒点则要几百轮，
 * 而每轮都要占用一帧。
 */
function seedInitialPositions(nodes: GraphNode[], items: GraphSourceItem[], seed: number) {
  const rand = mulberry32(seed)
  const catOrder: string[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!seen.has(it.category)) {
      seen.add(it.category)
      catOrder.push(it.category)
    }
  }
  const catCount = Math.max(1, catOrder.length)
  const rankInCat = new Map<string, number>()
  const catTotal = new Map<string, number>()
  for (const it of items) catTotal.set(it.category, (catTotal.get(it.category) || 0) + 1)

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const catIdx = catOrder.indexOf(node.category)
    const rank = rankInCat.get(node.category) || 0
    rankInCat.set(node.category, rank + 1)
    const total = catTotal.get(node.category) || 1

    const base = (catIdx / catCount) * Math.PI * 2
    const jitter = (rand() - 0.5) * 0.55
    const angle = base + jitter
    // 扇区内按 sqrt 均匀铺开，避免中心堆成一团
    const radius = 150 + 520 * Math.sqrt(rank / total)
    node.x = Math.cos(angle) * radius + (rand() - 0.5) * 40
    node.y = Math.sin(angle) * radius + (rand() - 0.5) * 40
  }
}

// ── 力导向 ──────────────────────────────────────────────────

export interface LayoutOptions {
  /** 斥力强度；越大节点摊得越开 */
  repulsion?: number
  /** 弹簧的静止长度 */
  linkDistance?: number
  /** 弹簧强度 */
  linkStrength?: number
  /** 向心力（往中心收） */
  centerPull?: number
  /** 速度阻尼 */
  damping?: number
  /** 总迭代轮数 */
  iterations?: number
}

export interface LayoutEngine {
  /** 推进一轮；返回 false 表示已到轮数上限 */
  step(): boolean
  /** 0~1 的进度 */
  progress(): number
  /** 当前动能（趋近 0 表示收敛） */
  energy(): number
}

const DEFAULTS: Required<LayoutOptions> = {
  repulsion: 2400,
  linkDistance: 74,
  linkStrength: 0.03,
  centerPull: 0.010,
  damping: 0.86,
  iterations: 260,
}

/** 斥力用的网格边长：略大于弹簧静止长度，够用且省算力 */
const CELL = 110

/**
 * 力导向引擎：一次 step() 是一轮迭代（约 2 万次运算，1ms 内）。
 * 调用方按帧推进，节点位置逐帧收敛 —— 画布上能看到图形「长出来」，
 * 也不会在首屏阻塞主线程（主图建 1461 个 DOM 节点曾造成 400ms+ 的单帧）。
 */
export function createLayout(graph: WordGraph, options: LayoutOptions = {}): LayoutEngine {
  const opt = { ...DEFAULTS, ...options }
  const { nodes, edges } = graph
  const n = nodes.length
  let iter = 0

  const grid = new Map<number, number[]>()
  const cellOf = (x: number, y: number) => ((Math.floor(x / CELL) + 512) << 10) | (Math.floor(y / CELL) + 512)

  function rebuildGrid() {
    grid.clear()
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!
      const key = cellOf(node.x, node.y)
      const list = grid.get(key)
      if (list) list.push(i)
      else grid.set(key, [i])
    }
  }

  function step(): boolean {
    if (iter >= opt.iterations) return false
    iter++
    rebuildGrid()

    // 斥力：只与 3×3 邻域里的节点比较
    for (let i = 0; i < n; i++) {
      const a = nodes[i]!
      const cx = Math.floor(a.x / CELL) + 512
      const cy = Math.floor(a.y / CELL) + 512
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const list = grid.get(((cx + ox) << 10) | (cy + oy))
          if (!list) continue
          for (const j of list) {
            if (j <= i) continue
            const b = nodes[j]!
            const dx = a.x - b.x
            const dy = a.y - b.y
            const d2 = dx * dx + dy * dy + 0.5
            const d = Math.sqrt(d2)
            let f = opt.repulsion / d2
            if (f > 40) f = 40
            const fx = (dx / d) * f
            const fy = (dy / d) * f
            a.vx += fx
            a.vy += fy
            b.vx -= fx
            b.vy -= fy
          }
        }
      }
    }

    // 弹簧：边把相近的词条拉到一起
    for (const edge of edges) {
      const a = nodes[edge.a]!
      const b = nodes[edge.b]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = opt.linkStrength * (d - opt.linkDistance)
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // 向心 + 积分
    let energy = 0
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!
      node.vx -= node.x * opt.centerPull
      node.vy -= node.y * opt.centerPull
      const sp = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
      if (sp > 26) {
        node.vx = (node.vx / sp) * 26
        node.vy = (node.vy / sp) * 26
      }
      node.x += node.vx
      node.y += node.vy
      node.vx *= opt.damping
      node.vy *= opt.damping
      energy += Math.abs(node.vx) + Math.abs(node.vy)
    }
    return true
  }

  return {
    step,
    progress: () => Math.min(1, iter / opt.iterations),
    energy: () => {
      let e = 0
      for (const node of nodes) e += Math.abs(node.vx) + Math.abs(node.vy)
      return e
    },
  }
}

/**
 * 邻接表：节点下标 → 邻居下标（按相似度权重降序）。
 * 词条弹窗里的「关联词条」直接用它 —— 图上挨着的词条，在关系上也近。
 */
export function adjacencyOf(graph: WordGraph): Map<number, number[]> {
  const adj = new Map<number, number[]>()
  for (const node of graph.nodes) adj.set(graph.index.get(node.id)!, [])
  const pairs: Array<[number, number, number]> = graph.edges.map((e) => [e.a, e.b, e.w])
  pairs.sort((x, y) => y[2] - x[2])
  for (const [a, b] of pairs) {
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }
  return adj
}

/** 全部节点的包围盒（用于「缩放到刚好装下」） */
export function graphBounds(graph: WordGraph): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of graph.nodes) {
    if (node.x < minX) minX = node.x
    if (node.x > maxX) maxX = node.x
    if (node.y < minY) minY = node.y
    if (node.y > maxY) maxY = node.y
  }
  if (!Number.isFinite(minX)) return { minX: -100, minY: -100, maxX: 100, maxY: 100 }
  return { minX, minY, maxX, maxY }
}
