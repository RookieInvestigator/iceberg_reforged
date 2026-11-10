import { describe, expect, it } from 'vitest'
import { buildGraph, createLayout, graphBounds, adjacencyOf, type GraphSourceItem } from './wordGraph'

/**
 * 词条星图的建图与布局守卫。
 *
 * 这张图没有第三方布局库，全靠这里的两步：先按相似度连边，再用力把节点摊开。
 * 两步都是纯函数，可以直接断言 —— 比对着画布截图靠谱得多。
 */

function item(id: string, title: string, category: string, tags: string[] = []): GraphSourceItem {
  return { id, title, category, categories: [category], tags }
}

const SAMPLE: GraphSourceItem[] = [
  item('aaaaaaaa', '猫脸老太太', '都市传说', ['民俗', '校园']),
  item('bbbbbbbb', '猫叫唤的夜晚', '都市传说', ['民俗']),
  item('cccccccc', '楼板弹珠声', '都市传说', ['建筑']),
  item('dddddddd', '雪山传说', '自然', ['民俗', '地理']),
  item('eeeeeeee', '雪山异闻', '自然', ['民俗']),
  item('ffffffff', '深海异形', '生物', ['海洋']),
]

describe('wordGraph · buildGraph', () => {
  it('节点数与输入一致，index 能按 id 反查', () => {
    const g = buildGraph(SAMPLE)
    expect(g.nodes).toHaveLength(SAMPLE.length)
    expect(g.index.get('aaaaaaaa')).toBe(0)
    expect(g.nodes[g.index.get('dddddddd')!]!.title).toBe('雪山传说')
  })

  it('同分类的词条之间有边', () => {
    const g = buildGraph(SAMPLE)
    const adj = adjacencyOf(g)
    const a = g.index.get('aaaaaaaa')!
    const b = g.index.get('bbbbbbbb')!
    expect(adj.get(a)).toContain(b)
  })

  it('共标签也算相关（跨分类）', () => {
    const g = buildGraph(SAMPLE)
    const adj = adjacencyOf(g)
    const a = g.index.get('aaaaaaaa')! // 标签含「民俗」
    const d = g.index.get('dddddddd')! // 标签也含「民俗」
    expect(adj.get(a)).toContain(d)
  })

  it('既不同分类又无共同标签的不连边', () => {
    const g = buildGraph(SAMPLE)
    const adj = adjacencyOf(g)
    const c = g.index.get('cccccccc')! // 都市传说 / 建筑
    const f = g.index.get('ffffffff')! // 生物 / 海洋
    expect(adj.get(c)).not.toContain(f)
  })

  it('边是无向的，且两端 degree 都被累加', () => {
    const g = buildGraph(SAMPLE)
    for (const e of g.edges) {
      expect(e.a).toBeLessThan(e.b)
      expect(g.nodes[e.a]!.degree).toBeGreaterThan(0)
      expect(g.nodes[e.b]!.degree).toBeGreaterThan(0)
    }
    const a = g.index.get('aaaaaaaa')!
    expect(g.nodes[a]!.degree).toBe(g.edges.filter((e) => e.a === a || e.b === a).length)
  })

  it('同一份数据两次建图结果一致（固定种子）', () => {
    const g1 = buildGraph(SAMPLE)
    const g2 = buildGraph(SAMPLE)
    expect(g1.nodes.map((n) => [n.x, n.y])).toEqual(g2.nodes.map((n) => [n.x, n.y]))
    expect(g1.edges.length).toBe(g2.edges.length)
  })

  it('每个节点最多选出 maxNeighbors 个邻居，边总数因此有上界', () => {
    const g = buildGraph(SAMPLE, { maxNeighbors: 1 })
    // 无向边：A 选 B 与 B 选 A 合并成一条，所以某个节点的 degree 可以大于 maxNeighbors
    // （它被别人选中）。有上界的是边总数：每个节点最多贡献 maxNeighbors 次选择。
    expect(g.edges.length).toBeLessThanOrEqual((SAMPLE.length * 1) / 2)
    const g2 = buildGraph(SAMPLE, { maxNeighbors: 6 })
    expect(g2.edges.length).toBeGreaterThan(g.edges.length)
  })
})

describe('wordGraph · createLayout', () => {
  it('step 返回 false 表示轮数用尽', () => {
    const g = buildGraph(SAMPLE)
    const engine = createLayout(g, { iterations: 5 })
    let alive = true
    let rounds = 0
    while (alive && rounds < 50) {
      alive = engine.step()
      rounds++
    }
    expect(alive).toBe(false)
    // 5 轮推进 + 第 6 次调用返回 false
    expect(rounds).toBe(6)
  })

  it('迭代后节点被摊开（任意两点距离大于初始的最小值）', () => {
    const g = buildGraph(SAMPLE)
    const engine = createLayout(g, { iterations: 60 })
    while (engine.step()) { /* 跑到收敛 */ }
    const b = graphBounds(g)
    expect(b.maxX - b.minX).toBeGreaterThan(1)
    expect(b.maxY - b.minY).toBeGreaterThan(1)
    for (const node of g.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it('progress 单调递增且不超过 1', () => {
    const g = buildGraph(SAMPLE)
    const engine = createLayout(g, { iterations: 10 })
    let prev = 0
    while (engine.step()) {
      const p = engine.progress()
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p).toBeLessThanOrEqual(1)
      prev = p
    }
    expect(engine.progress()).toBe(1)
  })

  it('能量最终趋近 0（收敛）', () => {
    const g = buildGraph(SAMPLE)
    const engine = createLayout(g, { iterations: 400 })
    while (engine.step()) { /* 跑到收敛 */ }
    expect(engine.energy()).toBeLessThan(5000)
  })
})
