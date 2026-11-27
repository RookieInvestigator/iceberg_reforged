// 词条星图：多维语义关联（地名 / 时间 / 核心名词 / 多分类 / 标签 / 手工关联）+ 无限卷轴星座排布。
import { mulberry32 } from '../iceberg3d/prng'
import type { EntityRecord } from './appendix'
import { extractEntryEntities, timeParentPeriod } from './entityExtract'

export interface GraphSourceItem {
  id: string
  title: string
  category: string
  categories?: string[]
  tags?: string[]
  tier?: string
  desc?: string
}

export type EdgeReasonKind = 'explicit' | 'place' | 'time' | 'noun' | 'platform' | 'category' | 'tag' | 'title'

export interface EdgeReason {
  kind: EdgeReasonKind
  label: string
}

export type StarClass = 'primary' | 'sub' | 'wanderer'

export interface GraphNode {
  id: string
  title: string
  category: string
  categories: string[]
  tier: string
  tags: string[]
  places: string[]
  times: string[]
  nouns: string[]
  platforms: string[]
  color: string
  x: number
  y: number
  vx: number
  vy: number
  /** 连边数；决定星等与亮度 */
  degree: number
  /** 词条星等分类：一等主星(primary)、二等副星(sub)、三等游离星(wanderer) */
  starClass: StarClass
  /** 关联星标显示上限（随连通强弱在 4~12 间渐变分布） */
  maxLinks: number
}

export interface GraphEdge {
  a: number
  b: number
  /** 相似度权重（越大关系越近） */
  w: number
  /** 是否来自手工关联表 related.csv */
  explicit?: boolean
  /** 首个共同标签（兼容旧接口） */
  sharedTag?: string
  /** 语义关联依据列表（按贡献降序，供星图聚焦丝线与浮动详情卡展示） */
  reasons?: EdgeReason[]
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
  /** 手工关联表（related.csv 双向索引） */
  explicitRelated?: Map<string, string[]>
  /** 抽取实体副表（entities.csv 解析结果） */
  entitiesMap?: Map<string, EntityRecord>
}

const MAX_NEIGHBORS = 12
const SCORE_EXPLICIT = 26
const BIGRAM_BONUS_CAP = 3
const MIN_SCORE = 2.4

function bigrams(title: string): Set<string> {
  const s = title.replace(/[\s·・「」『』“”"'()（）【】\[\]，,。.!！?？:：;；\-—…~]/g, '')
  const out = new Set<string>()
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2))
  return out
}

function categoriesOf(item: GraphSourceItem): string[] {
  const raw = item.categories && item.categories.length ? item.categories : [item.category]
  const out: string[] = []
  for (const c of raw) {
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** 从 Tier 字符串提取数值深度（'Tier 1' -> 1 .. 'Tier 8' -> 8，缺失返回 9） */
export function tierNumber(tier: string | undefined): number {
  if (!tier) return 9
  const m = /(\d+)/.exec(tier)
  return m ? Number(m[1]) : 9
}

function firstSharedTag(a: string[], b: string[]): string | undefined {
  if (!a.length || !b.length) return undefined
  const bSet = new Set(b)
  for (const t of a) {
    if (bSet.has(t)) return t
  }
  return undefined
}

function addPosting(map: Map<string, number[]>, key: string, idx: number) {
  const list = map.get(key)
  if (list) list.push(idx)
  else map.set(key, [idx])
}

/**
 * 建图：节点 = 词条，边 = 手工关联 + IDF 加权多维语义相似度（地名 / 时间 / 核心名词 / 多分类 / 标签 / 标题互涉 / 层级）。
 * 纯函数，无副作用，可单测。
 */
export function buildGraph(items: GraphSourceItem[], options: BuildGraphOptions = {}): WordGraph {
  const maxNeighbors = options.maxNeighbors ?? MAX_NEIGHBORS
  const seed = options.seed ?? 20260707
  const n = items.length

  const itemEntities: EntityRecord[] = items.map((it) => {
    const rec = options.entitiesMap?.get(it.id)
    if (rec && (rec.places.length || rec.times.length || rec.nouns.length || rec.platforms.length || !it.desc)) {
      return rec
    }
    if (it.desc) return extractEntryEntities(it.title, it.desc)
    return rec ?? { places: [], times: [], nouns: [], platforms: [] }
  })

  const nodes: GraphNode[] = items.map((it, i) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    categories: categoriesOf(it),
    tier: it.tier || '',
    tags: [...(it.tags || [])],
    places: [...itemEntities[i]!.places],
    times: [...itemEntities[i]!.times],
    nouns: [...itemEntities[i]!.nouns],
    platforms: [...itemEntities[i]!.platforms],
    color: options.colorOf ? options.colorOf(it) : '#ffffff',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: 0,
    starClass: 'wanderer',
    maxLinks: 4,
  }))
  const index = new Map<string, number>()
  items.forEach((it, i) => index.set(it.id, i))

  const catIdx = new Map<string, number[]>()
  const tagIdx = new Map<string, number[]>()
  const placeIdx = new Map<string, number[]>()
  const timeIdx = new Map<string, number[]>()
  const decadeIdx = new Map<string, number[]>()
  const nounIdx = new Map<string, number[]>()
  const platformIdx = new Map<string, number[]>()
  const bigramIdx = new Map<string, number[]>()

  const itemBigrams = items.map((it) => bigrams(it.title))
  const itemDecades: string[][] = itemEntities.map((ent) => {
    const decs = new Set<string>()
    for (const t of ent.times) {
      const parent = timeParentPeriod(t)
      if (parent && !ent.times.includes(parent)) decs.add(parent)
    }
    return [...decs]
  })

  items.forEach((it, i) => {
    for (const cat of nodes[i]!.categories) addPosting(catIdx, cat, i)
    for (const tag of it.tags || []) addPosting(tagIdx, tag, i)
    const ent = itemEntities[i]!
    for (const p of ent.places) addPosting(placeIdx, p, i)
    for (const tm of ent.times) addPosting(timeIdx, tm, i)
    for (const dec of itemDecades[i]!) addPosting(decadeIdx, dec, i)
    for (const nn of ent.nouns) addPosting(nounIdx, nn, i)
    for (const pf of ent.platforms) addPosting(platformIdx, pf, i)
    for (const bg of itemBigrams[i]!) addPosting(bigramIdx, bg, i)
  })

  const idfScale = Math.max(6, n)
  const idf = (df: number) => Math.min(4.8, Math.log(1 + idfScale / Math.max(1, df)))
  // 大语料下对超高频泛词（如「中国」「互联网」「现代」或百条大类）施加特异性衰减，避免无关词条因泛标签强行相连
  const specificity = (df: number) => (n <= 24 ? 1 : Math.max(0.32, 1 - (df / n) * 4.2))

  interface PairAccum {
    score: number
    hasRichSignal: boolean
    catHits: number
    bigramHits: number
    placeHits: number
    timeHits: number
    nounHits: number
    platformHits: number
    tagHits: number
    titleHits: number
    reasons: Array<{ kind: EdgeReasonKind; label: string; weight: number }>
  }

  const touchPair = (buf: Map<number, PairAccum>, j: number): PairAccum => {
    let acc = buf.get(j)
    if (!acc) {
      acc = {
        score: 0,
        hasRichSignal: false,
        catHits: 0,
        bigramHits: 0,
        placeHits: 0,
        timeHits: 0,
        nounHits: 0,
        platformHits: 0,
        tagHits: 0,
        titleHits: 0,
        reasons: [],
      }
      buf.set(j, acc)
    }
    return acc
  }

  const edgeMap = new Map<string, { w: number; reasons: EdgeReason[] }>()
  const explicitKeys = new Set<string>()
  const pairBuf = new Map<number, PairAccum>()
  const nodeTiers = nodes.map((nd) => tierNumber(nd.tier))

  for (let i = 0; i < n; i++) {
    pairBuf.clear()
    const item = items[i]!
    const nodeA = nodes[i]!
    const entA = itemEntities[i]!

    // 1) 多分类（主分类 + categories.csv 副分类；大语料下按分类大小调节基权，副分类跨界命中更具区分度）
    for (const cat of nodeA.categories) {
      const list = catIdx.get(cat)
      if (!list) continue
      const catWBase = idf(list.length)
      const catSpec = n <= 24 ? 1 : Math.max(0.45, Math.min(1, 0.35 + catWBase / 4.2))
      for (const j of list) {
        if (j === i) continue
        const nodeB = nodes[j]!
        const isAMain = cat === nodeA.category
        const isBMain = cat === nodeB.category
        const rawW =
          isAMain && isBMain
            ? 2.05 + catWBase * 0.48
            : isAMain || isBMain
              ? 1.75 + catWBase * 0.45
              : 1.45 + catWBase * 0.42
        const w = n <= 24 ? rawW : rawW * catSpec
        const acc = touchPair(pairBuf, j)
        acc.catHits++
        acc.score += w
        if (!isAMain || !isBMain) acc.hasRichSignal = true
        acc.reasons.push({ kind: 'category', label: cat.split(/[・·]/)[0] || cat, weight: w })
      }
    }
    for (const [, acc] of pairBuf) {
      if (acc.catHits >= 2) {
        acc.score += 2.3
        acc.hasRichSignal = true
      }
    }

    // 2) 抽取地名（罕见具体地名权重高，广域国家词抑制泛连）
    for (const p of entA.places) {
      const list = placeIdx.get(p)
      if (!list) continue
      const spec = specificity(list.length)
      const base = (1.6 + idf(list.length) * 1.25) * spec
      for (const j of list) {
        if (j === i) continue
        const acc = touchPair(pairBuf, j)
        const factor = acc.placeHits === 0 ? 1 : acc.placeHits === 1 ? 0.68 : 0.45
        const w = base * factor
        acc.placeHits++
        acc.score += w
        if (spec >= 0.52 || acc.placeHits >= 2) acc.hasRichSignal = true
        acc.reasons.push({ kind: 'place', label: p, weight: w })
      }
    }

    // 3) 抽取时间（精确年份 / 细粒度朝代 + 上位年代软关联）
    const matchedTimeExact = new Set<number>()
    for (const tm of entA.times) {
      const list = timeIdx.get(tm)
      if (!list) continue
      const spec = specificity(list.length)
      const w = (1.35 + idf(list.length) * 1.05) * spec
      for (const j of list) {
        if (j === i) continue
        matchedTimeExact.add(j)
        const acc = touchPair(pairBuf, j)
        const factor = acc.timeHits === 0 ? 1 : 0.65
        acc.timeHits++
        acc.score += w * factor
        if (spec >= 0.5) acc.hasRichSignal = true
        acc.reasons.push({ kind: 'time', label: tm, weight: w * factor })
      }
    }
    for (const dec of itemDecades[i]!) {
      const list = [...(timeIdx.get(dec) || []), ...(decadeIdx.get(dec) || [])]
      if (!list.length) continue
      const spec = specificity(list.length)
      const w = (0.95 + idf(list.length) * 0.52) * spec
      for (const j of list) {
        if (j === i || matchedTimeExact.has(j)) continue
        matchedTimeExact.add(j)
        const acc = touchPair(pairBuf, j)
        acc.timeHits++
        acc.score += w
        if (spec >= 0.5) acc.hasRichSignal = true
        acc.reasons.push({ kind: 'time', label: dec, weight: w })
      }
    }

    // 4) 抽取同义聚类核心名词 / 书目 / 概念（罕见概念强连接，叠加递减防单维刷分）
    for (const nn of entA.nouns) {
      const list = nounIdx.get(nn)
      if (!list) continue
      const spec = specificity(list.length)
      const base = (1.2 + idf(list.length) * 1.08) * spec
      for (const j of list) {
        if (j === i) continue
        const acc = touchPair(pairBuf, j)
        const factor = acc.nounHits === 0 ? 1 : acc.nounHits === 1 ? 0.78 : acc.nounHits === 2 ? 0.55 : 0.35
        const w = base * factor
        acc.nounHits++
        acc.score += w
        if (spec >= 0.48 || acc.nounHits >= 2) acc.hasRichSignal = true
        acc.reasons.push({ kind: 'noun', label: nn, weight: w })
      }
    }

    // 4b) 发布 / 流传平台（天涯、贴吧、微博…）—— 单列维度，权重高于普通名词：
    //     同一平台流传的词条在溯源上关系更紧，是星图里比普通概念共现更强的一档信号。
    for (const pf of entA.platforms) {
      const list = platformIdx.get(pf)
      if (!list) continue
      const spec = specificity(list.length)
      // 基础权重约为名词的 1.1 倍（名词 1.2 + idf*1.08，这里 1.35 + idf*1.2）
      const base = (1.35 + idf(list.length) * 1.2) * Math.max(0.55, spec)
      for (const j of list) {
        if (j === i) continue
        const acc = touchPair(pairBuf, j)
        const factor = acc.platformHits === 0 ? 1 : acc.platformHits === 1 ? 0.8 : 0.62
        const w = base * factor
        acc.platformHits++
        acc.score += w
        acc.hasRichSignal = true
        acc.reasons.push({ kind: 'platform', label: pf, weight: w })
      }
    }

    // 5) 共同标签
    for (const tag of item.tags || []) {
      const list = tagIdx.get(tag)
      if (!list) continue
      const spec = specificity(list.length)
      const w = (n <= 24 ? 2.0 + idf(list.length) * 0.75 : (1.7 + idf(list.length) * 0.85) * spec)
      for (const j of list) {
        if (j === i) continue
        const acc = touchPair(pairBuf, j)
        acc.tagHits++
        acc.score += w
        acc.hasRichSignal = true
        acc.reasons.push({ kind: 'tag', label: tag, weight: w })
      }
    }

    // 6) 标题二元组重合（过滤高频泛词二元组，避免噪音）
    const maxBgDf = Math.max(10, Math.floor(n * 0.06))
    for (const bg of itemBigrams[i]!) {
      const list = bigramIdx.get(bg)
      if (!list || list.length > maxBgDf) continue
      for (const j of list) {
        if (j === i) continue
        const acc = touchPair(pairBuf, j)
        if (acc.bigramHits >= BIGRAM_BONUS_CAP) continue
        acc.bigramHits++
        acc.titleHits++
        const w = 0.95
        acc.score += w
        acc.hasRichSignal = true
        if (acc.bigramHits === 1) acc.reasons.push({ kind: 'title', label: bg, weight: 1.15 })
      }
    }

    // 7) 文本互涉（A 描述中直接出现 B 标题）
    if (item.desc && item.desc.length >= 6) {
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const bTitle = items[j]!.title.trim()
        if (bTitle.length < 3 || bTitle.length > 18) continue
        if (item.desc.includes(bTitle)) {
          const acc = touchPair(pairBuf, j)
          acc.titleHits++
          acc.score += 5.4
          acc.hasRichSignal = true
          acc.reasons.push({ kind: 'title', label: bTitle, weight: 5.4 })
        }
      }
    }

    // 8) 跨维度语义共振奖励（同时命中 地名 / 时间 / 名词 / 多分类 / 标签 / 互涉 中多个独立维度）+ 层级贴近
    const ta = nodeTiers[i]!
    for (const [j, acc] of pairBuf) {
      const activeAxes =
        (acc.placeHits > 0 ? 1 : 0) +
        (acc.timeHits > 0 ? 1 : 0) +
        (acc.nounHits > 0 ? 1 : 0) +
        (acc.platformHits > 0 ? 1 : 0) +
        (acc.tagHits > 0 ? 1 : 0) +
        (acc.titleHits > 0 ? 1 : 0) +
        (acc.catHits > 0 ? 1 : 0)
      if (activeAxes >= 3) acc.score += 2.35
      else if (activeAxes === 2 && (acc.placeHits > 0 || acc.timeHits > 0 || acc.nounHits > 0 || acc.platformHits > 0)) acc.score += 1.05

      const tierDiff = Math.abs(ta - nodeTiers[j]!)
      if (tierDiff === 0) acc.score += 0.42
      else if (tierDiff === 1) acc.score += 0.22
    }

    const candidates = [...pairBuf.entries()]
      .filter(([, acc]) => acc.score >= MIN_SCORE)
      .sort((x, y) => y[1].score - x[1].score)

    // 存在高质量语义关联时，剔除仅靠单一同类泛化撑起的弱候选边
    const richCount = candidates.filter(([, acc]) => acc.hasRichSignal && acc.score >= 3.4).length
    const filtered = richCount >= 2
      ? candidates.filter(([, acc]) => acc.hasRichSignal)
      : candidates

    for (const [j, acc] of filtered.slice(0, maxNeighbors)) {
      const a = Math.min(i, j)
      const b = Math.max(i, j)
      const key = `${a}:${b}`
      const seenReason = new Set<string>()
      const reasons: EdgeReason[] = acc.reasons
        .sort((r1, r2) => r2.weight - r1.weight)
        .filter((r) => {
          const rk = `${r.kind}:${r.label}`
          if (seenReason.has(rk)) return false
          seenReason.add(rk)
          return true
        })
        .slice(0, 3)
        .map(({ kind, label }) => ({ kind, label }))
      const prev = edgeMap.get(key)
      if (!prev || acc.score > prev.w) {
        edgeMap.set(key, { w: acc.score, reasons })
      }
    }

    // 手工精选关联必保留且权重置顶
    if (options.explicitRelated) {
      for (const targetId of options.explicitRelated.get(item.id) || []) {
        const j = index.get(targetId)
        if (j === undefined || j === i) continue
        const a = Math.min(i, j)
        const b = Math.max(i, j)
        const key = `${a}:${b}`
        explicitKeys.add(key)
        const prev = edgeMap.get(key)
        const reasons: EdgeReason[] = [
          { kind: 'explicit' as const, label: '手工关联' },
          ...(prev?.reasons || []).filter((r) => r.kind !== 'explicit'),
        ].slice(0, 3)
        edgeMap.set(key, {
          w: Math.max(prev?.w ?? 0, SCORE_EXPLICIT),
          reasons,
        })
      }
    }
  }

  const weightSum = new Float64Array(n)
  const edges: GraphEdge[] = []
  for (const [key, meta] of edgeMap) {
    const [aStr, bStr] = key.split(':')
    const a = Number(aStr)
    const b = Number(bStr)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const explicit = explicitKeys.has(key)
    const sharedTag = firstSharedTag(nodes[a]!.tags, nodes[b]!.tags)
    edges.push({
      a,
      b,
      w: meta.w,
      ...(explicit ? { explicit: true } : {}),
      ...(sharedTag ? { sharedTag } : {}),
      reasons: meta.reasons,
    })
    nodes[a]!.degree++
    nodes[b]!.degree++
    weightSum[a]! += meta.w
    weightSum[b]! += meta.w
  }

  // 按关联数与综合边权将词条分为三等：一等主星 / 二等副星 / 三等游离星
  // 关联星标上限不设死板三档，而在 4~12 之间随连通强弱与星等自然分布
  if (n > 0) {
    const order = Array.from({ length: n }, (_, idx) => idx)
    order.sort((a, b) => {
      const dd = nodes[b]!.degree - nodes[a]!.degree
      if (dd !== 0) return dd
      const dw = weightSum[b]! - weightSum[a]!
      if (Math.abs(dw) > 1e-6) return dw
      return a - b
    })

    let primaryCount: number
    let subCount: number
    if (n < 6) {
      primaryCount = 1
      subCount = n - 1
    } else if (n < 18) {
      const k = Math.max(1, Math.round(n / 6))
      primaryCount = Math.min(n, Math.max(1, Math.round(k * 1.5)))
      subCount = Math.max(0, n - primaryCount)
    } else {
      const targetK = Math.min(64, Math.max(4, Math.round(n / 24)))
      primaryCount = Math.min(n, Math.max(targetK, Math.round(targetK * 1.5)))
      subCount = Math.min(n - primaryCount, Math.round(targetK * 5))
    }

    const wandererTotal = Math.max(1, order.length - primaryCount - subCount)
    for (let rank = 0; rank < order.length; rank++) {
      const idx = order[rank]!
      const node = nodes[idx]!
      const jitter = ((((idx * 2654435761) >>> 0) % 100) / 100 - 0.5) * 0.9
      if (rank < primaryCount) {
        node.starClass = 'primary'
        const frac = primaryCount <= 1 ? 1 : 1 - rank / (primaryCount - 1)
        node.maxLinks = Math.max(8, Math.min(12, Math.round(8.5 + frac * 3.5 + jitter)))
      } else if (rank < primaryCount + subCount) {
        node.starClass = 'sub'
        const subRank = rank - primaryCount
        const frac = subCount <= 1 ? 0.5 : 1 - subRank / (subCount - 1)
        node.maxLinks = Math.max(5, Math.min(11, Math.round(5.6 + frac * 4.8 + jitter)))
      } else {
        node.starClass = 'wanderer'
        const wRank = rank - primaryCount - subCount
        const frac = wandererTotal <= 1 ? 0.5 : 1 - wRank / (wandererTotal - 1)
        node.maxLinks = Math.max(4, Math.min(8, Math.round(4 + frac * 3.4 + jitter)))
      }
    }
  }

  seedInitialPositions(nodes, items, seed)

  return { nodes, edges, index }
}

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
    const radius = 150 + 520 * Math.sqrt(rank / total)
    node.x = Math.cos(angle) * radius + (rand() - 0.5) * 40
    node.y = Math.sin(angle) * radius + (rand() - 0.5) * 40
  }
}

// ── 力导向 ──────────────────────────────────────────────────

export interface LayoutOptions {
  repulsion?: number
  linkDistance?: number
  linkStrength?: number
  centerPull?: number
  damping?: number
  iterations?: number
}

export interface LayoutEngine {
  step(): boolean
  progress(): number
  energy(): number
}

const DEFAULTS: Required<LayoutOptions> = {
  repulsion: 2400,
  linkDistance: 74,
  linkStrength: 0.03,
  centerPull: 0.01,
  damping: 0.86,
  iterations: 260,
}

const CELL = 110

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

export function rankNodesByDegree(graph: WordGraph): number[] {
  const order = graph.nodes.map((_, i) => i)
  order.sort((a, b) => graph.nodes[b]!.degree - graph.nodes[a]!.degree)
  return order
}

export interface CategoryStat {
  category: string
  color: string
  count: number
}

export function categoryDistribution(graph: WordGraph): CategoryStat[] {
  const map = new Map<string, CategoryStat>()
  for (const node of graph.nodes) {
    const existing = map.get(node.category)
    if (existing) existing.count++
    else map.set(node.category, { category: node.category, color: node.color, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export function boundsOfIndices(
  graph: WordGraph,
  indices: Iterable<number>,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  for (const idx of indices) {
    const node = graph.nodes[idx]
    if (!node) continue
    found = true
    if (node.x < minX) minX = node.x
    if (node.x > maxX) maxX = node.x
    if (node.y < minY) minY = node.y
    if (node.y > maxY) maxY = node.y
  }
  return found ? { minX, minY, maxX, maxY } : null
}

// ══════════════════════════════════════════════════════════════════════
//  SVG 冰山剪影几何排布（取自 public/assets/iceberg.svg 175×172 多边形）
// ══════════════════════════════════════════════════════════════════════

export const ICEBERG_SVG_WIDTH = 175
export const ICEBERG_SVG_HEIGHT = 172
export const ICEBERG_WATERLINE_Y = 43.15
const ICEBERG_WORLD_SCALE = 5.0

/** public/assets/iceberg.svg 主体轮廓顶点（顺时针） */
export const ICEBERG_SILHOUETTE_POLY: ReadonlyArray<readonly [number, number]> = [
  [159.82, 50.81],
  [146, 106.87],
  [120.89, 130.47],
  [105.44, 171.19],
  [46.88, 138.64],
  [35.41, 101.19],
  [18.76, 86.55],
  [13.1, 50.81],
  [0, 43.15],
  [21.25, 43.15],
  [56.25, 20.94],
  [66.46, 28.6],
  [100, 0],
  [153.57, 43.15],
  [175, 43.15],
]

/** public/assets/iceberg.svg 水上阳面双棱面 */
export const ICEBERG_FACET_POLYS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [56.25, 30.87],
    [37.5, 43.15],
    [52.74, 43.15],
  ],
  [
    [100, 10.47],
    [62.5, 43.15],
    [118.75, 43.15],
    [116.18, 30.34],
    [97.07, 24.86],
  ],
]

/** 扫描线法求多边形在给定 y 处的水平区间列表 [xStart, xEnd] */
export function polygonSpansAtY(
  poly: ReadonlyArray<readonly [number, number]>,
  y: number,
): Array<[number, number]> {
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!
    const [x2, y2] = poly[(i + 1) % poly.length]!
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
  }
  xs.sort((a, b) => a - b)
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < xs.length; i += 2) {
    out.push([xs[i]!, xs[i + 1]!])
  }
  return out
}

function generateGridSlots(
  poly: ReadonlyArray<readonly [number, number]>,
  yMin: number,
  yMax: number,
  step: number,
  inset: number,
): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number }> = []
  for (let y = yMin + step * 0.5; y <= yMax - step * 0.25; y += step) {
    const spans = polygonSpansAtY(poly, y)
    for (const [x1, x2] of spans) {
      const lx = x1 + inset
      const rx = x2 - inset
      const spanW = rx - lx
      if (spanW < step * 0.6) continue
      const count = Math.max(1, Math.floor(spanW / step))
      const pad = (spanW - count * step) / 2
      for (let k = 0; k < count; k++) {
        slots.push({ x: lx + pad + (k + 0.5) * step, y })
      }
    }
  }
  return slots
}

/** 二分寻找恰好容纳 needed 个方块、同时贴满剪影的网格步长 */
function fitSlotsInBand(
  poly: ReadonlyArray<readonly [number, number]>,
  yMin: number,
  yMax: number,
  needed: number,
  inset: number,
): { slots: Array<{ x: number; y: number }>; step: number } {
  if (needed <= 0) return { slots: [], step: 4 }
  let lo = 0.8
  let hi = 24
  let bestSlots = generateGridSlots(poly, yMin, yMax, lo, inset)
  let bestStep = lo
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2
    const cand = generateGridSlots(poly, yMin, yMax, mid, inset)
    if (cand.length >= needed) {
      bestSlots = cand
      bestStep = mid
      lo = mid
    } else {
      hi = mid
    }
  }
  return { slots: bestSlots, step: bestStep }
}

/** 若格位多于词条数，按均匀步幅抽样，保证方块铺满整座剪影而不集中在顶半截 */
function sampleUniformSlots(slots: Array<{ x: number; y: number }>, count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return []
  if (slots.length <= count) return slots.slice(0, count)
  const out: Array<{ x: number; y: number }> = []
  const ratio = slots.length / count
  for (let i = 0; i < count; i++) {
    const idx = Math.min(slots.length - 1, Math.floor(i * ratio + ratio * 0.35))
    out.push(slots[idx]!)
  }
  return out
}

export interface IcebergTileSlot {
  x: number
  y: number
  size: number
}

export interface IcebergTierBand {
  tier: string
  yMin: number
  yMax: number
  count: number
}

export interface ConstellationEdge {
  a: number
  b: number
  explicit: boolean
  tierGap: number
}

export interface IcebergLayoutResult {
  positions: IcebergTileSlot[]
  waterlineY: number
  tierBands: IcebergTierBand[]
  constellationEdges: ConstellationEdge[]
  polyWorld: Array<[number, number]>
  facetPolysWorld: Array<Array<[number, number]>>
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

function svgToWorldX(sx: number): number {
  return (sx - ICEBERG_SVG_WIDTH / 2) * ICEBERG_WORLD_SCALE
}

function svgToWorldY(sy: number): number {
  return (sy - ICEBERG_SVG_HEIGHT / 2) * ICEBERG_WORLD_SCALE
}

/** 将点 (x, y) 严格夹紧在冰山多边形在 y 处的水平跨度内 */
function clampToPolySpan(
  poly: ReadonlyArray<readonly [number, number]>,
  x: number,
  y: number,
  preferredInset: number,
): number {
  const spans = polygonSpansAtY(poly, y)
  if (!spans.length) return ICEBERG_SVG_WIDTH / 2
  let bestSpan = spans[0]!
  let bestDist = Infinity
  for (const s of spans) {
    const mid = (s[0] + s[1]) / 2
    const d = x >= s[0] && x <= s[1] ? 0 : Math.abs(x - mid)
    if (d < bestDist) {
      bestDist = d
      bestSpan = s
    }
  }
  const w = bestSpan[1] - bestSpan[0]
  const inset = Math.min(preferredInset, w * 0.24)
  const lo = bestSpan[0] + inset
  const hi = bestSpan[1] - inset
  if (lo >= hi) return (bestSpan[0] + bestSpan[1]) / 2
  return Math.max(lo, Math.min(hi, x))
}

/** 按水平跨度权重在 [yMin, yMax] 内采样 y，确保狭窄峰顶仍有合理密度的亮星 */
function sampleYInBand(
  poly: ReadonlyArray<readonly [number, number]>,
  yMin: number,
  yMax: number,
  u: number,
): number {
  const SLICES = 20
  const spanStep = (yMax - yMin) / SLICES
  if (spanStep <= 0.01) return (yMin + yMax) / 2
  const weights: number[] = []
  let total = 0
  for (let s = 0; s < SLICES; s++) {
    const ym = yMin + (s + 0.5) * spanStep
    const spans = polygonSpansAtY(poly, ym)
    let w = 0
    for (const [x1, x2] of spans) w += Math.max(0, x2 - x1)
    // 开 0.65 次方：既反映轮廓宽窄，又不至于让主峰尖端完全空掉
    const weighted = Math.pow(Math.max(0.5, w), 0.65)
    weights.push(weighted)
    total += weighted
  }
  let target = Math.max(0, Math.min(0.999999, u)) * total
  for (let s = 0; s < SLICES; s++) {
    const w = weights[s]!
    if (target <= w || s === SLICES - 1) {
      const frac = w > 0 ? target / w : 0.5
      return yMin + (s + frac) * spanStep
    }
    target -= w
  }
  return (yMin + yMax) / 2
}

/**
 * 将全量词条按 Tier 分层以天文星图（Constellation）方式分布于 public/assets/iceberg.svg 轮廓内：
 * - 非行列网格：利用准随机采样 + 同域吸引力 + 局部斥力松弛，形成有机星群与星桥骨架；
 * - Tier 1 严格位于海平面之上双峰；Tier 2..8 逐层深潜至水下冰山基座。
 */
export function computeIcebergLayout(graph: WordGraph): IcebergLayoutResult {
  const n = graph.nodes.length
  const positions: IcebergTileSlot[] = new Array(n)
  const polyWorld: Array<[number, number]> = ICEBERG_SILHOUETTE_POLY.map(([x, y]) => [svgToWorldX(x), svgToWorldY(y)])
  const facetPolysWorld: Array<Array<[number, number]>> = ICEBERG_FACET_POLYS.map((fp) =>
    fp.map(([x, y]) => [svgToWorldX(x), svgToWorldY(y)]),
  )

  if (n === 0) {
    return {
      positions: [],
      waterlineY: svgToWorldY(ICEBERG_WATERLINE_Y),
      tierBands: [],
      constellationEdges: [],
      polyWorld,
      facetPolysWorld,
      bounds: {
        minX: svgToWorldX(0) - 48,
        maxX: svgToWorldX(ICEBERG_SVG_WIDTH) + 96,
        minY: svgToWorldY(0) - 24,
        maxY: svgToWorldY(ICEBERG_SVG_HEIGHT) + 24,
      },
    }
  }

  const rand = mulberry32(20260719)
  const catStats = categoryDistribution(graph)
  const catRank = new Map<string, number>()
  catStats.forEach((s, idx) => catRank.set(s.category, idx))
  const catTotal = Math.max(1, catStats.length)

  const hasExplicitTiers = graph.nodes.some((nd) => tierNumber(nd.tier) < 9)
  const tierBuckets = new Map<number, number[]>()

  if (hasExplicitTiers) {
    for (let i = 0; i < n; i++) {
      const t = tierNumber(graph.nodes[i]!.tier)
      const list = tierBuckets.get(t)
      if (list) list.push(i)
      else tierBuckets.set(t, [i])
    }
  } else {
    const ranked = rankNodesByDegree(graph)
    const split = Math.max(1, Math.round(n * 0.14))
    tierBuckets.set(1, ranked.slice(0, split))
    if (split < ranked.length) tierBuckets.set(2, ranked.slice(split))
  }

  // 为每个节点计算严格非重叠的 SVG 垂直深度带 [bandMinY, bandMaxY]
  const nodeBandMin = new Float64Array(n)
  const nodeBandMax = new Float64Array(n)
  const nodeTierOrder = new Int32Array(n)

  const aboveIndices = tierBuckets.get(1) ?? []
  for (const idx of aboveIndices) {
    nodeBandMin[idx] = 3.2
    nodeBandMax[idx] = ICEBERG_WATERLINE_Y - 1.6
    nodeTierOrder[idx] = 1
  }

  const subTiers = [...tierBuckets.keys()].filter((t) => t > 1).sort((a, b) => a - b)
  if (subTiers.length > 0) {
    const subTop = ICEBERG_WATERLINE_Y + 1.8
    const subBottom = 168.4
    const totalSpan = subBottom - subTop
    const gap = Math.min(1.2, totalSpan / (subTiers.length * 6))
    const usableSpan = Math.max(10, totalSpan - gap * (subTiers.length - 1))

    // 以 sqrt(count) + 最小带高分配水下层带，兼顾视觉比例与稀疏深层空间
    const rawWeights = subTiers.map((t) => Math.max(1.8, Math.sqrt((tierBuckets.get(t) ?? []).length)))
    const wSum = rawWeights.reduce((acc, v) => acc + v, 0)
    let cursor = subTop
    for (let b = 0; b < subTiers.length; b++) {
      const t = subTiers[b]!
      const h = (rawWeights[b]! / wSum) * usableSpan
      const y0 = cursor
      const y1 = b === subTiers.length - 1 ? subBottom : cursor + h
      for (const idx of tierBuckets.get(t) ?? []) {
        nodeBandMin[idx] = y0
        nodeBandMax[idx] = y1
        nodeTierOrder[idx] = t
      }
      cursor = y1 + gap
    }
  }

  // 在各自的 SVG 多边形条带内以蓝噪 + 区域星座密度初始化星位，铺满双峰与水下全轮廓
  const sx = new Float64Array(n)
  const sy = new Float64Array(n)
  const PHI = 0.6180339887498949

  // 为每个分类分配相对稳定的水平星座区位（均匀散布 0.08..0.92，避免全部挤向中轴）
  const catZone = new Map<string, number>()
  catStats.forEach((s, idx) => {
    catZone.set(s.category, ((idx * PHI + 0.17) % 1) * 0.84 + 0.08)
  })

  const orderedForSeed = graph.nodes.map((_, i) => i).sort((a, b) => {
    const ta = nodeTierOrder[a]!
    const tb = nodeTierOrder[b]!
    if (ta !== tb) return ta - tb
    return graph.nodes[b]!.degree - graph.nodes[a]!.degree
  })

  for (let rank = 0; rank < orderedForSeed.length; rank++) {
    const idx = orderedForSeed[rank]!
    const node = graph.nodes[idx]!
    const y0 = nodeBandMin[idx]!
    const y1 = nodeBandMax[idx]!

    const hubBias =
      node.degree >= 9 && nodeTierOrder[idx] === 1 && rank < 10
        ? rand() * 0.55
        : (rank * PHI + rand() * 0.35) % 1
    const y = sampleYInBand(ICEBERG_SILHOUETTE_POLY, y0, y1, hubBias)
    const spans = polygonSpansAtY(ICEBERG_SILHOUETTE_POLY, y)

    const zoneU = catZone.get(node.category) ?? 0.5
    // 为双峰区间选跨度：左峰约占 ~34%，右主峰约占 ~66%，让左峰也闪耀饱满
    let chosen = spans[0] ?? [60, 115]
    if (spans.length > 1) {
      const leftW = spans[0]![1] - spans[0]![0]
      const rightW = spans[spans.length - 1]![1] - spans[spans.length - 1]![0]
      const leftRatio = Math.max(0.28, Math.min(0.45, leftW / Math.max(1, leftW + rightW)))
      chosen = zoneU < leftRatio || rand() < 0.32 ? spans[0]! : spans[spans.length - 1]!
    }
    const w = chosen[1] - chosen[0]
    const inset = Math.min(1.05, w * 0.16)
    const lx = chosen[0] + inset
    const rx = chosen[1] - inset
    const spanLen = Math.max(0.2, rx - lx)
    // 70% 均匀蓝噪覆盖全轮廓 + 30% 星座扇区微偏置（绝不向中心坍缩）
    const quasiU = ((rank * 0.7548776662466927 + rand() * 0.28) % 1)
    const localU = Math.max(0.02, Math.min(0.98, quasiU * 0.72 + zoneU * 0.28))

    sy[idx] = y
    sx[idx] = lx + spanLen * localU
  }

  // 局部均匀斥力松弛（仅消除粘连重叠并保持全轮廓饱满，不全局向心坍缩）
  const CELL_SVG = 4.5
  const grid = new Map<number, number[]>()
  const cellKey = (x: number, y: number) => ((Math.floor(x / CELL_SVG) + 256) << 10) | (Math.floor(y / CELL_SVG) + 256)
  const minSep = n > 200 ? 3.25 : 5.4

  for (let pass = 0; pass < 14; pass++) {
    grid.clear()
    for (let i = 0; i < n; i++) {
      const key = cellKey(sx[i]!, sy[i]!)
      const bucket = grid.get(key)
      if (bucket) bucket.push(i)
      else grid.set(key, [i])
    }

    const dxArr = new Float64Array(n)
    const dyArr = new Float64Array(n)

    for (let i = 0; i < n; i++) {
      const cx = Math.floor(sx[i]! / CELL_SVG) + 256
      const cy = Math.floor(sy[i]! / CELL_SVG) + 256
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(((cx + ox) << 10) | (cy + oy))
          if (!bucket) continue
          for (const j of bucket) {
            if (j <= i) continue
            let dx = sx[i]! - sx[j]!
            let dy = sy[i]! - sy[j]!
            let d = Math.hypot(dx, dy)
            if (d < 0.001) {
              const ang = (i * 1.7 + j * 2.3) % (Math.PI * 2)
              dx = Math.cos(ang) * 0.1
              dy = Math.sin(ang) * 0.1
              d = 0.1
            }
            if (d < minSep) {
              const push = ((minSep - d) / minSep) * 0.56
              const ux = (dx / d) * push
              const uy = (dy / d) * push
              dxArr[i]! += ux
              dyArr[i]! += uy
              dxArr[j]! -= ux
              dyArr[j]! -= uy
            }
          }
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const nextY = Math.max(nodeBandMin[i]!, Math.min(nodeBandMax[i]!, sy[i]! + dyArr[i]!))
      const nextX = clampToPolySpan(ICEBERG_SILHOUETTE_POLY, sx[i]! + dxArr[i]!, nextY, 1.05)
      sy[i] = nextY
      sx[i] = nextX
    }
  }

  for (let i = 0; i < n; i++) {
    const deg = graph.nodes[i]!.degree
    // 恒星视星等尺寸差异：小星辰轻盈通透，枢纽亮星突出（世界坐标单位）
    const starSize = 6.2 + Math.min(8.8, Math.sqrt(deg) * 2.15)
    positions[i] = {
      x: svgToWorldX(sx[i]!),
      y: svgToWorldY(sy[i]!),
      size: starSize,
    }
  }

  // 精选冰山星座骨架连线（仅挑短距强关联线，每星最多 3 条，总上限 420 条，清透不糊）
  const edgeCandidates: Array<{ a: number; b: number; explicit: boolean; tierGap: number; score: number }> = []
  for (const e of graph.edges) {
    const pa = positions[e.a]!
    const pb = positions[e.b]!
    const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y)
    const tierGap = Math.abs(nodeTierOrder[e.a]! - nodeTierOrder[e.b]!)
    if (!e.explicit && dist > 260) continue
    if (!e.explicit && tierGap > 2) continue
    const score = (e.explicit ? 100 : 0) + e.w * 4 - dist * 0.045 - tierGap * 6
    edgeCandidates.push({ a: e.a, b: e.b, explicit: Boolean(e.explicit), tierGap, score })
  }
  edgeCandidates.sort((x, y) => y.score - x.score)

  const constellationEdges: ConstellationEdge[] = []
  const usedCount = new Uint8Array(n)
  for (const c of edgeCandidates) {
    if (constellationEdges.length >= 420) break
    if (!c.explicit && (usedCount[c.a]! >= 3 || usedCount[c.b]! >= 3)) continue
    usedCount[c.a]!++
    usedCount[c.b]!++
    constellationEdges.push({ a: c.a, b: c.b, explicit: c.explicit, tierGap: c.tierGap })
  }

  // 统计每个层级的实际世界 Y 带，便于右侧绘制极简深度标尺
  const bandMap = new Map<string, { yMin: number; yMax: number; count: number; order: number }>()
  for (let i = 0; i < n; i++) {
    const node = graph.nodes[i]!
    const pos = positions[i]!
    const label = node.tier || `Tier ${tierNumber(node.tier)}`
    const half = pos.size * 0.5
    const cur = bandMap.get(label)
    if (cur) {
      cur.yMin = Math.min(cur.yMin, pos.y - half)
      cur.yMax = Math.max(cur.yMax, pos.y + half)
      cur.count++
    } else {
      bandMap.set(label, {
        yMin: pos.y - half,
        yMax: pos.y + half,
        count: 1,
        order: tierNumber(node.tier),
      })
    }
  }
  const tierBands: IcebergTierBand[] = [...bandMap.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([tier, b]) => ({ tier, yMin: b.yMin, yMax: b.yMax, count: b.count }))

  return {
    positions,
    waterlineY: svgToWorldY(ICEBERG_WATERLINE_Y),
    tierBands,
    constellationEdges,
    polyWorld,
    facetPolysWorld,
    bounds: {
      minX: svgToWorldX(0) - 52,
      maxX: svgToWorldX(ICEBERG_SVG_WIDTH) + 96,
      minY: svgToWorldY(0) - 24,
      maxY: svgToWorldY(ICEBERG_SVG_HEIGHT) + 24,
    },
  }
}

// ══════════════════════════════════════════════════════════════════════
//  焦点轨道弧流向图布局（点击星点后迅速展开：前导渊源 ──▶ 焦点星锚 ──▶ 深潜延伸）
// ══════════════════════════════════════════════════════════════════════

export type FlowReasonType = 'explicit' | 'tag' | 'category'

export interface FlowBlockNode {
  idx: number
  role: 'in' | 'center' | 'out'
  x: number
  y: number
  w: number
  h: number
  /** 流向连线精准锚点（center 为左右边缘，in/out 为靠近中心一侧的菱形星锚） */
  anchorX: number
  anchorY: number
  weight: number
  explicit: boolean
  sharedTag?: string
  reasonType: FlowReasonType
}

export interface FlowArrowEdge {
  fromIdx: number
  toIdx: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  explicit: boolean
  sharedTag?: string
  reasonType: FlowReasonType
}

export interface FlowchartLayoutResult {
  centerIdx: number
  center: FlowBlockNode
  inNodes: FlowBlockNode[]
  outNodes: FlowBlockNode[]
  edges: FlowArrowEdge[]
  /** 迷你冰山背景星点（严格排除 center / in / out 避免巨大遮挡方块） */
  radarNodes: Array<{ idx: number; x: number; y: number; size: number }>
  radarPoly: Array<[number, number]>
  radarFacetPolys: Array<Array<[number, number]>>
  radarWaterlineY: number
  radarBeacon: { x: number; y: number } | null
  hasRadar: boolean
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface FlowchartLayoutOptions {
  maxIn?: number
  maxOut?: number
  showMiniRadar?: boolean
  compact?: boolean
  icebergScene?: IcebergLayoutResult | null
}

export function computeFlowchartLayout(
  graph: WordGraph,
  centerIdx: number,
  adj: Map<number, number[]>,
  options: FlowchartLayoutOptions = {},
): FlowchartLayoutResult {
  const compact = Boolean(options.compact)
  const maxIn = options.maxIn ?? (compact ? 3 : 5)
  const maxOut = options.maxOut ?? (compact ? 4 : 6)
  const showRadar = Boolean(options.showMiniRadar && !compact && options.icebergScene)

  const edgeMeta = new Map<number, GraphEdge>()
  for (const e of graph.edges) {
    if (e.a === centerIdx) edgeMeta.set(e.b, e)
    else if (e.b === centerIdx) edgeMeta.set(e.a, e)
  }

  const centerNode = graph.nodes[centerIdx]!
  const centerTier = tierNumber(centerNode.tier)
  const neighbors = adj.get(centerIdx) ?? []

  interface Candidate {
    idx: number
    weight: number
    explicit: boolean
    sharedTag?: string
    reasonType: FlowReasonType
    tierDiff: number
  }

  const upstreamPool: Candidate[] = []
  const downstreamPool: Candidate[] = []
  const neutralPool: Candidate[] = []

  for (const nbIdx of neighbors) {
    if (nbIdx === centerIdx) continue
    const nb = graph.nodes[nbIdx]
    if (!nb) continue
    const e = edgeMeta.get(nbIdx)
    const explicit = Boolean(e?.explicit)
    const sharedTag = e?.sharedTag ?? firstSharedTag(centerNode.tags, nb.tags)
    const reasonType: FlowReasonType = explicit ? 'explicit' : sharedTag ? 'tag' : 'category'
    const tierDiff = tierNumber(nb.tier) - centerTier
    const cand: Candidate = {
      idx: nbIdx,
      weight: e?.w ?? 2,
      explicit,
      sharedTag,
      reasonType,
      tierDiff,
    }
    if (tierDiff < 0) upstreamPool.push(cand)
    else if (tierDiff > 0) downstreamPool.push(cand)
    else neutralPool.push(cand)
  }

  const byPriority = (x: Candidate, y: Candidate) => {
    if (x.explicit !== y.explicit) return x.explicit ? -1 : 1
    return y.weight - x.weight
  }
  upstreamPool.sort(byPriority)
  downstreamPool.sort(byPriority)
  neutralPool.sort(byPriority)

  const pickedIn = upstreamPool.slice(0, maxIn)
  const pickedOut = downstreamPool.slice(0, maxOut)

  for (const cand of neutralPool) {
    if (pickedIn.length >= maxIn && pickedOut.length >= maxOut) break
    if (pickedIn.length <= pickedOut.length && pickedIn.length < maxIn) {
      pickedIn.push(cand)
    } else if (pickedOut.length < maxOut) {
      pickedOut.push(cand)
    } else if (pickedIn.length < maxIn) {
      pickedIn.push(cand)
    }
  }

  const flowCx = showRadar ? -82 : 0
  const centerW = compact ? 156 : 224
  const centerH = compact ? 54 : 66
  const sideW = compact ? 136 : 204
  const sideH = compact ? 36 : 40
  const colOffset = compact ? 196 : 318

  const center: FlowBlockNode = {
    idx: centerIdx,
    role: 'center',
    x: flowCx,
    y: 0,
    w: centerW,
    h: centerH,
    anchorX: flowCx,
    anchorY: 0,
    weight: 99,
    explicit: false,
    reasonType: 'category',
  }

  const layoutArc = (list: Candidate[], side: 'in' | 'out'): FlowBlockNode[] => {
    const count = list.length
    if (!count) return []
    const stepY = count <= 3 ? 68 : count === 4 ? 60 : count === 5 ? 52 : 46
    const totalH = (count - 1) * stepY
    return list.map((c, k) => {
      const y = -totalH / 2 + k * stepY
      const normY = totalH > 0 ? y / (totalH / 2) : 0
      // 柔和的括号式轨道孤度：(  ◈  )，极简现代星图结构
      const arcCurve = normY * normY * 28
      const x = side === 'in' ? flowCx - colOffset + arcCurve : flowCx + colOffset - arcCurve
      const anchorX = side === 'in' ? x + sideW / 2 : x - sideW / 2
      return {
        idx: c.idx,
        role: side,
        x,
        y,
        w: sideW,
        h: sideH,
        anchorX,
        anchorY: y,
        weight: c.weight,
        explicit: c.explicit,
        sharedTag: c.sharedTag,
        reasonType: c.reasonType,
      }
    })
  }

  const inNodes = layoutArc(pickedIn, 'in')
  const outNodes = layoutArc(pickedOut, 'out')

  const edges: FlowArrowEdge[] = [
    ...inNodes.map((src) => ({
      fromIdx: src.idx,
      toIdx: centerIdx,
      fromX: src.anchorX,
      fromY: src.anchorY,
      toX: center.x - center.w / 2,
      toY: center.y,
      explicit: src.explicit,
      sharedTag: src.sharedTag,
      reasonType: src.reasonType,
    })),
    ...outNodes.map((dst) => ({
      fromIdx: centerIdx,
      toIdx: dst.idx,
      fromX: center.x + center.w / 2,
      fromY: center.y,
      toX: dst.anchorX,
      toY: dst.anchorY,
      explicit: dst.explicit,
      sharedTag: dst.sharedTag,
      reasonType: dst.reasonType,
    })),
  ]

  // 右侧迷你冰山深度定位雷达（严格排除 flowIdxSet 节点，杜绝巨型色块遮挡）
  const flowIdxSet = new Set<number>([
    centerIdx,
    ...inNodes.map((b) => b.idx),
    ...outNodes.map((b) => b.idx),
  ])
  const radarNodes: Array<{ idx: number; x: number; y: number; size: number }> = []
  let radarPoly: Array<[number, number]> = []
  let radarFacetPolys: Array<Array<[number, number]>> = []
  let radarWaterlineY = 0
  let radarBeacon: { x: number; y: number } | null = null

  if (showRadar && options.icebergScene) {
    const scene = options.icebergScene
    const rScale = 0.24
    const rCx = flowCx + colOffset + sideW / 2 + 165
    const rCy = 0
    for (let i = 0; i < graph.nodes.length; i++) {
      if (flowIdxSet.has(i)) continue
      const p = scene.positions[i]
      if (!p) continue
      radarNodes.push({
        idx: i,
        x: rCx + p.x * rScale,
        y: rCy + p.y * rScale,
        size: 1.8,
      })
    }
    radarPoly = scene.polyWorld.map(([px, py]) => [rCx + px * rScale, rCy + py * rScale])
    radarFacetPolys = scene.facetPolysWorld.map((fp) => fp.map(([px, py]) => [rCx + px * rScale, rCy + py * rScale]))
    radarWaterlineY = rCy + scene.waterlineY * rScale
    const cp = scene.positions[centerIdx]
    if (cp) radarBeacon = { x: rCx + cp.x * rScale, y: rCy + cp.y * rScale }
  }

  const maxRows = Math.max(inNodes.length, outNodes.length, 1)
  const stepEstimate = maxRows <= 3 ? 68 : maxRows === 4 ? 60 : maxRows === 5 ? 52 : 46
  const flowHalfH = Math.max(126, ((maxRows - 1) * stepEstimate) / 2 + 54)
  const minX = flowCx - colOffset - sideW / 2 - 26
  const maxX = showRadar ? flowCx + colOffset + sideW / 2 + 275 : flowCx + colOffset + sideW / 2 + 26

  return {
    centerIdx,
    center,
    inNodes,
    outNodes,
    edges,
    radarNodes,
    radarPoly,
    radarFacetPolys,
    radarWaterlineY,
    radarBeacon,
    hasRadar: showRadar,
    bounds: {
      minX,
      maxX,
      minY: -flowHalfH,
      maxY: flowHalfH,
    },
  }
}

// ══════════════════════════════════════════════════════════════════════
//  极简深空星座与高斯游离星布局（~60 座 1~2 主星 + 2~8 副星星座 + 广域游离星）
// ══════════════════════════════════════════════════════════════════════

export const SKY_HALF_W = 2800
export const SKY_HALF_H = 1750
export const SKY_PERIOD_W = SKY_HALF_W * 2
export const SKY_PERIOD_H = SKY_HALF_H * 2

/** 环形星域最短有向差值：保证跨无缝卷轴边界的连线永远走最近路径 */
export function wrapDelta(delta: number, period: number): number {
  return delta - Math.round(delta / period) * period
}

/** 将任意宇宙坐标规范映射到核心基本域 [-half, half) */
export function wrapCoord(v: number, half: number, period: number): number {
  const shifted = (v + half) % period
  const wrapped = shifted < 0 ? shifted + period : shifted
  return wrapped - half
}

export interface ConstellationStarSlot {
  x: number
  y: number
  /** 世界尺寸 */
  size: number
  /** 所属星座编号（-1 表示三等游离星） */
  constellationId: number
  /** 星等类别：一等主星 / 二等副星 / 三等游离星 */
  starClass: StarClass
  /** 是否为一等主星（仅主星初始显示名称） */
  isPrimary: boolean
  /** 是否归属星座（主星与副星组成星座，游离星不组成星座） */
  isConstellationMember: boolean
  /** 星等（1 = 主星，2 = 副星，3 = 游离星） */
  magnitude: 1 | 2 | 3
}

export interface ConstellationArc {
  a: number
  b: number
  constellationId: number
  primary: boolean
  explicit: boolean
}

export interface ConstellationGroup {
  id: number
  name: string
  category: string
  color: string
  cx: number
  cy: number
  primaryIndices: number[]
  subIndices: number[]
  anchorIndices: number[]
  memberIndices: number[]
}

export interface ConstellationsLayoutResult {
  positions: ConstellationStarSlot[]
  constellations: ConstellationGroup[]
  arcs: ConstellationArc[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

/**
 * 为 3~10 颗星的星座雕塑舒展的古典天文骨架坐标（开阔几何轮廓 + 丰富留白）：
 * 前 2 点位于视觉主体枢纽供主星落座，后续点顺势向翼展与尾梢铺开。
 */
function buildConstellationArchetype(
  count: number,
  archetype: number,
  radiusScale: number,
  rot: number,
  flipY: number,
  rand: () => number,
): Array<{ lx: number; ly: number }> {
  if (count <= 1) return [{ lx: 0, ly: 0 }]

  let raw: Array<[number, number]>
  switch (archetype % 6) {
    case 0: // Dipper：广角勺斗 + 舒朗弯曲长柄
      raw = [
        [-0.22, -0.06],
        [0.44, 0.24],
        [-0.86, 0.14],
        [-0.56, -0.44],
        [0.14, 0.54],
        [0.92, 0.34],
        [0.84, -0.28],
        [0.24, -0.58],
        [-1.18, 0.42],
        [0.62, -0.78],
      ]
      break
    case 1: // Cygnus：修长十字轴与大翼展
      raw = [
        [0.0, 0.0],
        [0.62, -0.26],
        [-0.92, 0.22],
        [-0.24, -0.74],
        [0.22, 0.72],
        [1.06, -0.46],
        [-0.58, -0.38],
        [0.54, 0.42],
        [-0.14, 1.08],
        [-0.48, 0.76],
      ]
      break
    case 2: // Cassiopeia：疏阔 W/M 折线星带
      raw = [
        [-0.42, 0.36],
        [0.48, 0.4],
        [-0.98, -0.28],
        [0.04, -0.24],
        [0.98, -0.34],
        [-0.18, 0.78],
        [0.34, -0.72],
        [-0.78, 0.66],
        [1.18, 0.12],
        [-1.16, 0.18],
      ]
      break
    case 3: // Orion：斜向双星腰带与宽幅肩足
      raw = [
        [-0.16, -0.06],
        [0.18, 0.06],
        [-0.74, -0.62],
        [0.72, -0.44],
        [-0.62, 0.6],
        [0.78, 0.54],
        [0.02, -0.92],
        [-0.34, 0.88],
        [1.04, -0.14],
        [-1.02, 0.12],
      ]
      break
    case 4: // Lyra：灵动斜棱核心配飘逸远翼
      raw = [
        [-0.32, -0.14],
        [0.26, 0.08],
        [-0.02, -0.56],
        [-0.18, 0.44],
        [0.88, 0.46],
        [-0.86, 0.28],
        [0.54, -0.48],
        [1.14, 0.04],
        [-0.52, -0.74],
        [0.38, 0.86],
      ]
      break
    default: // Corona：优雅弧冠 + 外围护星
      raw = [
        [0.0, -0.34],
        [0.54, -0.22],
        [-0.52, -0.2],
        [-0.92, 0.26],
        [0.94, 0.22],
        [0.14, 0.44],
        [-0.68, -0.64],
        [0.62, -0.68],
        [-0.24, 0.78],
        [1.14, 0.58],
      ]
      break
  }

  const cosR = Math.cos(rot)
  const sinR = Math.sin(rot)
  const pts: Array<{ lx: number; ly: number }> = []
  for (let k = 0; k < count; k++) {
    const [bx, by] = raw[k % raw.length]!
    const jx = (rand() - 0.5) * 0.14
    const jy = (rand() - 0.5) * 0.14
    const ux = (bx + jx) * radiusScale
    const uy = (by * flipY + jy) * radiusScale
    pts.push({
      lx: ux * cosR - uy * sinR,
      ly: ux * sinR + uy * cosR,
    })
  }
  return pts
}

/**
 * 构建极简呼吸感深空星图：
 * - 一等主星（1~2 颗/座）+ 二等副星（2~8 颗/座）构成约 60 座星座；
 * - 关联数较低的三等词条作为游离星（不组成星座，无骨架连线）；
 * - 星座与游离星均呈广泛二维高斯分布，拉大天区留白以提升极简审美。
 */
export function computeConstellationsLayout(
  graph: WordGraph,
  adj: Map<number, number[]>,
): ConstellationsLayoutResult {
  const n = graph.nodes.length
  const bounds = { minX: -SKY_HALF_W, minY: -SKY_HALF_H, maxX: SKY_HALF_W, maxY: SKY_HALF_H }

  if (n === 0) {
    return { positions: [], constellations: [], arcs: [], bounds }
  }

  const rand = mulberry32(20261129)
  const positions: ConstellationStarSlot[] = new Array(n)

  const edgeWeightMap = new Map<string, number>()
  for (const e of graph.edges) {
    edgeWeightMap.set(`${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`, e.w)
  }
  const weightBetween = (a: number, b: number) =>
    edgeWeightMap.get(`${Math.min(a, b)}:${Math.max(a, b)}`) ?? 0

  const pairAffinity = (a: number, b: number): number => {
    const ew = weightBetween(a, b)
    const na = graph.nodes[a]!
    const nb = graph.nodes[b]!
    let s = ew * 1.45
    if (na.category === nb.category) s += 2.6
    for (const c of na.categories) {
      if (c !== na.category && nb.categories.includes(c)) s += 1.6
    }
    for (const p of na.places) if (nb.places.includes(p)) s += 3.6
    for (const nn of na.nouns) if (nb.nouns.includes(nn)) s += 2.8
    for (const tm of na.times) if (nb.times.includes(tm)) s += 2.1
    for (const tg of na.tags) if (nb.tags.includes(tg)) s += 1.8
    return s
  }

  const ranked = rankNodesByDegree(graph)
  const primaries: number[] = []
  const subs: number[] = []
  const wanderers: number[] = []

  for (const idx of ranked) {
    const sc = graph.nodes[idx]!.starClass
    if (sc === 'primary') primaries.push(idx)
    else if (sc === 'sub') subs.push(idx)
    else wanderers.push(idx)
  }

  // 兜底保证小测试集至少有 1 颗主星
  if (primaries.length === 0 && ranked.length > 0) {
    primaries.push(ranked[0]!)
    const posInSub = subs.indexOf(ranked[0]!)
    if (posInSub >= 0) subs.splice(posInSub, 1)
    const posInWan = wanderers.indexOf(ranked[0]!)
    if (posInWan >= 0) wanderers.splice(posInWan, 1)
  }

  // 1. 按 1~2 主星 + 2~8 副星组建约 60 个星座（小样本按规模等比自适应）
  const maxByPrimary = primaries.length
  const minByPrimary = Math.max(1, Math.ceil(primaries.length / 2))
  const maxBySub = subs.length >= 2 ? Math.floor(subs.length / 2) : 1
  const targetK =
    n < 18
      ? Math.max(minByPrimary, Math.min(maxByPrimary, maxBySub, Math.round(n / 6) || 1))
      : Math.max(
          minByPrimary,
          Math.min(maxByPrimary, maxBySub, Math.min(64, Math.max(4, Math.round(n / 24)))),
        )

  const constPrimaries: number[][] = Array.from({ length: targetK }, () => [])
  const constSubs: number[][] = Array.from({ length: targetK }, () => [])
  const nodeConst = new Int32Array(n).fill(-1)

  for (let cid = 0; cid < targetK && cid < primaries.length; cid++) {
    const pIdx = primaries[cid]!
    constPrimaries[cid]!.push(pIdx)
    nodeConst[pIdx] = cid
  }

  // 剩余主星（最多 2 颗/座）配对进语义最亲和的 1-主星星座
  for (let pi = targetK; pi < primaries.length; pi++) {
    const pIdx = primaries[pi]!
    let bestCid = -1
    let bestScore = -Infinity
    for (let cid = 0; cid < targetK; cid++) {
      if (constPrimaries[cid]!.length >= 2) continue
      const lead = constPrimaries[cid]![0]!
      const s = pairAffinity(pIdx, lead)
      if (s > bestScore) {
        bestScore = s
        bestCid = cid
      }
    }
    if (bestCid >= 0) {
      constPrimaries[bestCid]!.push(pIdx)
      nodeConst[pIdx] = bestCid
    } else {
      wanderers.push(pIdx)
    }
  }

  const groupAffinity = (candIdx: number, cid: number): number => {
    let s = 0
    for (const m of constPrimaries[cid]!) s += pairAffinity(candIdx, m) * 1.35
    for (const m of constSubs[cid]!) s += pairAffinity(candIdx, m)
    return s
  }

  // 将副星分配进各星座，严格控制每座 2~8 颗副星
  const assignedSub = new Set<number>()
  for (let round = 0; round < 2; round++) {
    for (let cid = 0; cid < targetK; cid++) {
      if (constSubs[cid]!.length > round) continue
      let bestSub = -1
      let bestScore = -Infinity
      for (const sIdx of subs) {
        if (assignedSub.has(sIdx)) continue
        const s = groupAffinity(sIdx, cid)
        if (s > bestScore) {
          bestScore = s
          bestSub = sIdx
        }
      }
      if (bestSub >= 0) {
        assignedSub.add(bestSub)
        constSubs[cid]!.push(bestSub)
        nodeConst[bestSub] = cid
      }
    }
  }

  for (const sIdx of subs) {
    if (assignedSub.has(sIdx)) continue
    let bestCid = -1
    let bestScore = -Infinity
    for (let cid = 0; cid < targetK; cid++) {
      const curLen = constSubs[cid]!.length
      if (curLen >= 8) continue
      const s = groupAffinity(sIdx, cid) - curLen * 0.65
      if (s > bestScore) {
        bestScore = s
        bestCid = cid
      }
    }
    if (bestCid >= 0) {
      assignedSub.add(sIdx)
      constSubs[bestCid]!.push(sIdx)
      nodeConst[sIdx] = bestCid
    } else {
      // 超出所有星座 8 副星上限的节点自然转入游离星
      wanderers.push(sIdx)
    }
  }

  // 一轮副星对换微调：提升各星座内语义与多维关联纯度
  for (const sIdx of assignedSub) {
    const curCid = nodeConst[sIdx]!
    if (curCid < 0) continue
    const curCoh = groupAffinity(sIdx, curCid)
    const candCids = new Set<number>()
    for (const nb of adj.get(sIdx) ?? []) {
      const nbCid = nodeConst[nb]!
      if (nbCid >= 0 && nbCid !== curCid) candCids.add(nbCid)
    }
    let bestPartner = -1
    let bestGain = 1.6
    for (const cid of candCids) {
      const cohNewI = groupAffinity(sIdx, cid)
      if (cohNewI <= curCoh) continue
      for (const otherSub of constSubs[cid]!) {
        const curCohJ = groupAffinity(otherSub, cid)
        const cohNewJ = groupAffinity(otherSub, curCid)
        const gain =
          cohNewI - pairAffinity(sIdx, otherSub) + (cohNewJ - pairAffinity(sIdx, otherSub)) - curCoh - curCohJ
        if (gain > bestGain) {
          bestGain = gain
          bestPartner = otherSub
        }
      }
    }
    if (bestPartner >= 0) {
      const otherCid = nodeConst[bestPartner]!
      const listA = constSubs[curCid]!
      const listB = constSubs[otherCid]!
      const posA = listA.indexOf(sIdx)
      const posB = listB.indexOf(bestPartner)
      if (posA >= 0 && posB >= 0) {
        listA[posA] = bestPartner
        listB[posB] = sIdx
        nodeConst[sIdx] = otherCid
        nodeConst[bestPartner] = curCid
      }
    }
  }

  const KActive = targetK
  const constDomCat: string[] = new Array(KActive)
  const constColor: string[] = new Array(KActive)
  const constLeadNode: number[] = new Array(KActive)

  for (let cid = 0; cid < KActive; cid++) {
    const members = [...constPrimaries[cid]!, ...constSubs[cid]!]
    constLeadNode[cid] = constPrimaries[cid]![0] ?? members[0]!
    const catVotes = new Map<string, { count: number; color: string }>()
    for (const m of members) {
      const nd = graph.nodes[m]!
      const wVote = nd.starClass === 'primary' ? 2 : 1
      const prev = catVotes.get(nd.category)
      if (prev) prev.count += wVote
      else catVotes.set(nd.category, { count: wVote, color: nd.color })
    }
    let topCat = graph.nodes[constLeadNode[cid]!]!.category
    let topColor = graph.nodes[constLeadNode[cid]!]!.color
    let topCount = -1
    for (const [cat, meta] of catVotes) {
      if (meta.count > topCount) {
        topCount = meta.count
        topCat = cat
        topColor = meta.color
      }
    }
    constDomCat[cid] = topCat
    constColor[cid] = topColor
  }

  // 2. 星座中心用「抖动网格」均匀铺满整个星域。
  //
  // 原来用二维高斯 + 56 轮排斥松弛 + **硬钳制到边界**，结果是：
  // 排斥把星座往外推、钳制又把人挡在边上，最后全堆在四条边，中间空掉一大片
  // （平铺后就是屏幕上那条明显的空带）。改成抖动网格后天然均匀、无空缺、无堆边。
  const padX = Math.min(240, SKY_HALF_W * 0.09)
  const padY = Math.min(200, SKY_HALF_H * 0.115)
  const usableW = (SKY_HALF_W - padX) * 2
  const usableH = (SKY_HALF_H - padY) * 2
  const cols = Math.max(1, Math.round(Math.sqrt((KActive * usableW) / Math.max(1, usableH))))
  const rows = Math.max(1, Math.ceil(KActive / cols))
  const cellW = usableW / cols
  const cellH = usableH / rows

  // 打乱格子顺序：避免「星座编号 ↔ 屏幕位置」强相关
  const cellOrder: number[] = []
  for (let i = 0; i < cols * rows; i++) cellOrder.push(i)
  for (let i = cellOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = cellOrder[i]!
    cellOrder[i] = cellOrder[j]!
    cellOrder[j] = t
  }

  const cxArr = new Float64Array(KActive)
  const cyArr = new Float64Array(KActive)
  for (let cid = 0; cid < KActive; cid++) {
    const cell = cellOrder[cid] ?? cid
    const gx = cell % cols
    const gy = Math.floor(cell / cols)
    // 格内抖动 15%~85%：保持均匀的同时去掉规则网格感
    cxArr[cid] = -SKY_HALF_W + padX + (gx + 0.15 + rand() * 0.7) * cellW
    cyArr[cid] = -SKY_HALF_H + padY + (gy + 0.15 + rand() * 0.7) * cellH
  }

  // 3. 雕塑每座星座内部主星与副星几何骨架并生成欧氏最短骨架连线
  const constellations: ConstellationGroup[] = []
  const arcs: ConstellationArc[] = []
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  const pSize = new Float64Array(n)
  const pMag = new Uint8Array(n)
  const pClass: StarClass[] = new Array(n).fill('wanderer')
  const radiusScale = KActive <= 6 ? 132 : 96

  const constellationStarPoints: Array<{ x: number; y: number }> = []

  for (let cid = 0; cid < KActive; cid++) {
    const primList = constPrimaries[cid]!
    const subList = constSubs[cid]!
    const anchors = [...primList, ...subList]
    const cx = cxArr[cid]!
    const cy = cyArr[cid]!
    const rot = (cid * 1.37 + rand() * 0.85) % (Math.PI * 2)
    const flipY = cid % 2 === 0 ? 1 : -1

    const localPts = buildConstellationArchetype(anchors.length, cid, radiusScale, rot, flipY, rand)
    const minAnchorSep = 32
    for (let pass = 0; pass < 14; pass++) {
      for (let i = 0; i < localPts.length; i++) {
        for (let j = i + 1; j < localPts.length; j++) {
          const a = localPts[i]!
          const b = localPts[j]!
          let dx = a.lx - b.lx
          let dy = a.ly - b.ly
          let d = Math.hypot(dx, dy)
          if (d < 0.01) {
            dx = 1
            dy = 0.5
            d = 1.11
          }
          if (d < minAnchorSep) {
            const push = (minAnchorSep - d) * 0.45
            a.lx += (dx / d) * push
            a.ly += (dy / d) * push
            b.lx -= (dx / d) * push
            b.ly -= (dy / d) * push
          }
        }
      }
    }

    for (let k = 0; k < anchors.length; k++) {
      const idx = anchors[k]!
      const pt = localPts[k]!
      const isPrim = k < primList.length
      const wx = Math.max(-SKY_HALF_W + 32, Math.min(SKY_HALF_W - 32, cx + pt.lx))
      const wy = Math.max(-SKY_HALF_H + 32, Math.min(SKY_HALF_H - 32, cy + pt.ly))
      px[idx] = wx
      py[idx] = wy
      pClass[idx] = isPrim ? 'primary' : 'sub'
      pMag[idx] = isPrim ? 1 : 2
      pSize[idx] = isPrim ? 12.2 : 6.8 + Math.min(2.0, Math.sqrt(graph.nodes[idx]!.degree) * 0.36)
      constellationStarPoints.push({ x: wx, y: wy })
    }

    // 最小生成树串联主星与副星，勾勒极简星座轮廓线
    if (anchors.length >= 2) {
      const inTree = new Set<number>([0])
      const treeEdges: Array<[number, number]> = []
      while (inTree.size < anchors.length) {
        let bestU = 0
        let bestV = 0
        let bestDist = Infinity
        for (const u of inTree) {
          for (let v = 0; v < anchors.length; v++) {
            if (inTree.has(v)) continue
            const iu = anchors[u]!
            const iv = anchors[v]!
            const d = Math.hypot(px[iu]! - px[iv]!, py[iu]! - py[iv]!) - weightBetween(iu, iv) * 1.1
            if (d < bestDist) {
              bestDist = d
              bestU = u
              bestV = v
            }
          }
        }
        inTree.add(bestV)
        treeEdges.push([bestU, bestV])
      }

      const treePairSet = new Set<string>()
      for (const [u, v] of treeEdges) {
        const iu = anchors[u]!
        const iv = anchors[v]!
        treePairSet.add(`${Math.min(u, v)}:${Math.max(u, v)}`)
        arcs.push({
          a: iu,
          b: iv,
          constellationId: cid,
          primary: true,
          explicit: weightBetween(iu, iv) >= SCORE_EXPLICIT,
        })
      }

      // 为星数较多的星座极简闭合 1 条几何边
      if (anchors.length >= 6 && cid % 3 === 1) {
        let closeU = -1
        let closeV = -1
        let bestClose = Infinity
        for (let u = 0; u < anchors.length; u++) {
          for (let v = u + 1; v < anchors.length; v++) {
            if (treePairSet.has(`${u}:${v}`)) continue
            const iu = anchors[u]!
            const iv = anchors[v]!
            const d = Math.hypot(px[iu]! - px[iv]!, py[iu]! - py[iv]!)
            if (d < bestClose) {
              bestClose = d
              closeU = u
              closeV = v
            }
          }
        }
        if (closeU >= 0 && closeV >= 0) {
          const iu = anchors[closeU]!
          const iv = anchors[closeV]!
          arcs.push({
            a: iu,
            b: iv,
            constellationId: cid,
            primary: true,
            explicit: weightBetween(iu, iv) >= SCORE_EXPLICIT,
          })
        }
      }
    }

    const leadNode = graph.nodes[constLeadNode[cid]!]!
    constellations.push({
      id: cid,
      name: leadNode.title,
      category: constDomCat[cid]!,
      color: constColor[cid]!,
      cx,
      cy,
      primaryIndices: primList,
      subIndices: subList,
      anchorIndices: anchors,
      memberIndices: anchors,
    })
  }

  // 4. 三等游离星：**按关系就近聚类**，而不是纯随机洒落。
  //
  // 两条要求必须一起满足：
  //  · 聚类：先算它与每座星座的亲和度，落在亲和度最高那座的外围环带里 ——
  //    「关系近的游离星」自然聚到一起，也不会孤零零飘在无关区域。
  //  · 均匀：星座中心本身已是抖动网格铺满全图，游离星跟着星座走，整体密度才均匀。
  //
  // 关键在**限载**：只按亲和度取最高分时，热门分类的游离星会全挤到同几座星座上，
  // 稳态是「几格密密麻麻、几格几乎空白」（实测 8×5 网格里最多 90 颗 / 最少 3 颗）。
  // 因此按座限流 —— 座被占满后改投次亲和的那座，全满的落回全域均匀撒布。
  //
  // 位置用 wrapCoord 折回基本域（环形星域），**不用硬钳制** ——
  // 钳制会让超出边界的星全部贴边堆积，正是之前「四周密、中间空」的成因之一。
  const wanderPad = 48
  const wandererClearR = 52
  const constRadius = KActive <= 6 ? 132 : 96
  const wanderCount = new Int32Array(Math.max(1, KActive))
  const wanderCap = Math.max(4, Math.ceil((wanderers.length / Math.max(1, KActive)) * 1.35))
  // 派位顺序打乱：限载下先到先得，不能让编号靠前的游离星通吃
  const wanderOrder = wanderers.map((_, i) => i)
  for (let i = wanderOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = wanderOrder[i]!
    wanderOrder[i] = wanderOrder[j]!
    wanderOrder[j] = t
  }

  for (const wi of wanderOrder) {
    const wIdx = wanderers[wi]!
    let bestCid = -1
    let bestScore = -Infinity
    for (let cid = 0; cid < KActive; cid++) {
      if (wanderCount[cid]! >= wanderCap) continue
      const s = groupAffinity(wIdx, cid)
      if (s > bestScore) {
        bestScore = s
        bestCid = cid
      }
    }
    if (bestCid >= 0 && Number.isFinite(bestScore) && bestScore > 0.5) {
      wanderCount[bestCid] = wanderCount[bestCid]! + 1
    } else {
      bestCid = -1
    }

    let tx: number
    let ty: number
    if (bestCid >= 0) {
      // 落在该星座外围环带：内缘贴着星座轮廓，外缘延伸到约 2.6 倍半径
      const ang = rand() * Math.PI * 2
      const inner = constRadius * 1.15
      const rad = inner + rand() * inner * 1.5
      tx = cxArr[bestCid]! + Math.cos(ang) * rad
      ty = cyArr[bestCid]! + Math.sin(ang) * rad * 0.84
    } else {
      // 无关系可依（或该星座已满）：在全域均匀撒（用 rand 而非高斯，避免往中间堆）
      tx = (rand() * 2 - 1) * (SKY_HALF_W - wanderPad)
      ty = (rand() * 2 - 1) * (SKY_HALF_H - wanderPad)
    }
    tx = wrapCoord(tx, SKY_HALF_W, SKY_PERIOD_W)
    ty = wrapCoord(ty, SKY_HALF_H, SKY_PERIOD_H)

    // 推离星座恒星正贴脸的位置（保留轮廓的呼吸带）；同样用环绕而不是钳制
    for (const cp of constellationStarPoints) {
      const dx = tx - cp.x
      const dy = ty - cp.y
      const d = Math.hypot(dx, dy)
      if (d < wandererClearR) {
        const pushAng = d > 0.01 ? Math.atan2(dy, dx) : rand() * Math.PI * 2
        tx = wrapCoord(cp.x + Math.cos(pushAng) * wandererClearR, SKY_HALF_W, SKY_PERIOD_W)
        ty = wrapCoord(cp.y + Math.sin(pushAng) * wandererClearR, SKY_HALF_H, SKY_PERIOD_H)
        break
      }
    }

    nodeConst[wIdx] = -1
    px[wIdx] = tx
    py[wIdx] = ty
    pClass[wIdx] = 'wanderer'
    pMag[wIdx] = 3
    pSize[wIdx] = 3.6
  }

  let realMinX = Infinity
  let realMinY = Infinity
  let realMaxX = -Infinity
  let realMaxY = -Infinity
  for (let i = 0; i < n; i++) {
    const sc = pClass[i]!
    const x = px[i]!
    const y = py[i]!
    if (x < realMinX) realMinX = x
    if (x > realMaxX) realMaxX = x
    if (y < realMinY) realMinY = y
    if (y > realMaxY) realMaxY = y
    positions[i] = {
      x,
      y,
      size: pSize[i]!,
      constellationId: nodeConst[i]!,
      starClass: sc,
      isPrimary: sc === 'primary',
      isConstellationMember: sc !== 'wanderer',
      magnitude: (pMag[i] as 1 | 2 | 3) || 3,
    }
  }

  return {
    positions,
    constellations,
    arcs,
    bounds: {
      minX: Number.isFinite(realMinX) ? realMinX : bounds.minX,
      minY: Number.isFinite(realMinY) ? realMinY : bounds.minY,
      maxX: Number.isFinite(realMaxX) ? realMaxX : bounds.maxX,
      maxY: Number.isFinite(realMaxY) ? realMaxY : bounds.maxY,
    },
  }
}


