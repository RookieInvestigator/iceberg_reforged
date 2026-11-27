import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  createLayout,
  graphBounds,
  adjacencyOf,
  rankNodesByDegree,
  categoryDistribution,
  boundsOfIndices,
  ICEBERG_SILHOUETTE_POLY,
  polygonSpansAtY,
  computeIcebergLayout,
  computeConstellationsLayout,
  computeFlowchartLayout,
  SKY_HALF_W,
  SKY_PERIOD_W,
  wrapCoord,
  wrapDelta,
  type GraphSourceItem,
} from './wordGraph'

/**
 * 词条星图的建图与布局守卫。
 *
 * 这张图没有第三方布局库，全靠这里的纯函数计算：相似度连边、力导向星团、
 * SVG 冰山剪影分层方块排布与焦点箭头流程图。
 */

function item(
  id: string,
  title: string,
  category: string,
  tags: string[] = [],
  tier = 'Tier 3',
  extra?: Partial<GraphSourceItem>,
): GraphSourceItem {
  return { id, title, category, categories: [category], tags, tier, ...extra }
}

const SAMPLE: GraphSourceItem[] = [
  item('aaaaaaaa', '猫脸老太太', '都市传说', ['民俗', '校园'], 'Tier 1'),
  item('bbbbbbbb', '猫叫唤的夜晚', '都市传说', ['民俗'], 'Tier 3'),
  item('cccccccc', '楼板弹珠声', '都市传说', ['建筑'], 'Tier 2'),
  item('dddddddd', '雪山传说', '自然', ['民俗', '地理'], 'Tier 4'),
  item('eeeeeeee', '雪山异闻', '自然', ['民俗'], 'Tier 6'),
  item('ffffffff', '深海异形', '生物', ['海洋'], 'Tier 8'),
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

  it('地名、年代、核心名词实体与多分类共同驱动跨分类语义连边并附带 reasons', () => {
    const richSample: GraphSourceItem[] = [
      item('11111111', '哈尔滨夜猫传闻', '都市传说', [], 'Tier 2', {
        categories: ['都市传说', '灵异事件'],
        desc: '1995年流传于哈尔滨的猫脸奇闻',
      }),
      item('22222222', '松花江旧影档案', '历史档案', [], 'Tier 3', {
        categories: ['历史档案', '灵异事件'],
        desc: '上世纪90年代记录在哈尔滨的报纸档案，提及《山海经》',
      }),
      item('33333333', '纯科学孤立词条', '科学', [], 'Tier 6', {
        desc: '一段与上面无关的物理学描述',
      }),
    ]
    const g = buildGraph(richSample)
    const adj = adjacencyOf(g)
    const a = g.index.get('11111111')!
    const b = g.index.get('22222222')!
    const c = g.index.get('33333333')!

    expect(adj.get(a)).toContain(b)
    expect(adj.get(a)).not.toContain(c)
    const edge = g.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))
    expect(edge).toBeDefined()
    expect(edge!.reasons?.some((r) => r.kind === 'place' && r.label === '哈尔滨')).toBe(true)
    expect(edge!.reasons?.some((r) => r.kind === 'time' && r.label === '1990年代')).toBe(true)
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
    expect(g.edges.length).toBeLessThanOrEqual((SAMPLE.length * 1) / 2)
    const g2 = buildGraph(SAMPLE, { maxNeighbors: 6 })
    expect(g2.edges.length).toBeGreaterThan(g.edges.length)
  })

  it('explicitRelated 强制连边并标注 explicit 标记', () => {
    const explicit = new Map<string, string[]>([['cccccccc', ['ffffffff']]])
    const g = buildGraph(SAMPLE, { explicitRelated: explicit })
    const c = g.index.get('cccccccc')!
    const f = g.index.get('ffffffff')!
    const edge = g.edges.find((e) => (e.a === c && e.b === f) || (e.a === f && e.b === c))
    expect(edge).toBeDefined()
    expect(edge?.explicit).toBe(true)
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

  it('rankNodesByDegree 与 categoryDistribution 返回正确排序与子集包围盒', () => {
    const g = buildGraph(SAMPLE)
    const ranked = rankNodesByDegree(g)
    expect(ranked).toHaveLength(SAMPLE.length)
    expect(g.nodes[ranked[0]!]!.degree).toBeGreaterThanOrEqual(g.nodes[ranked[ranked.length - 1]!]!.degree)

    const dist = categoryDistribution(g)
    expect(dist[0]?.category).toBe('都市传说')
    expect(dist[0]?.count).toBe(3)

    expect(boundsOfIndices(g, [])).toBeNull()
    const sub = boundsOfIndices(g, [0, 1])
    expect(sub).not.toBeNull()
    expect(sub!.maxX).toBeGreaterThanOrEqual(sub!.minX)
  })
})

describe('wordGraph · SVG 冰山剪影与无限卷轴星座布局', () => {
  it('polygonSpansAtY 能识别冰山双峰区间与水下主体区间', () => {
    expect(polygonSpansAtY(ICEBERG_SILHOUETTE_POLY, 25)).toHaveLength(2)
    const belly = polygonSpansAtY(ICEBERG_SILHOUETTE_POLY, 75)
    expect(belly).toHaveLength(1)
    expect(belly[0]![1]).toBeGreaterThan(belly[0]![0])
    expect(polygonSpansAtY(ICEBERG_SILHOUETTE_POLY, -5)).toHaveLength(0)
  })

  it('computeIcebergLayout 将 Tier 1 排在海平面之上、Tier 2+ 逐层排在水下且星点互不重叠', () => {
    const g = buildGraph(SAMPLE)
    const ice = computeIcebergLayout(g)
    expect(ice.positions).toHaveLength(SAMPLE.length)
    expect(ice.constellationEdges.length).toBeGreaterThan(0)

    const t1 = ice.positions[g.index.get('aaaaaaaa')!]!
    const t2 = ice.positions[g.index.get('cccccccc')!]!
    const t8 = ice.positions[g.index.get('ffffffff')!]!

    expect(t1.y).toBeLessThan(ice.waterlineY)
    expect(t2.y).toBeGreaterThan(ice.waterlineY)
    expect(t8.y).toBeGreaterThan(t2.y)

    for (let i = 0; i < ice.positions.length; i++) {
      const a = ice.positions[i]!
      const svgY = a.y / 5 + 86
      const svgX = a.x / 5 + 87.5
      const spans = polygonSpansAtY(ICEBERG_SILHOUETTE_POLY, svgY)
      expect(spans.length).toBeGreaterThan(0)
      expect(spans.some(([x1, x2]) => svgX >= x1 - 0.05 && svgX <= x2 + 0.05)).toBe(true)

      for (let j = i + 1; j < ice.positions.length; j++) {
        const b = ice.positions[j]!
        const dx = Math.abs(a.x - b.x)
        const dy = Math.abs(a.y - b.y)
        expect(dx > 0.1 || dy > 0.1).toBe(true)
      }
    }
  })

  it('computeFlowchartLayout 按浅层前导 → 焦点 → 深潜延伸生成向右流向图，且 radarNodes 不含激活节点', () => {
    const g = buildGraph(SAMPLE)
    const adj = adjacencyOf(g)
    const ice = computeIcebergLayout(g)
    const centerIdx = g.index.get('bbbbbbbb')! // Tier 3，有 Tier 1/2 浅层与 Tier 4/6 深层邻居

    const flow = computeFlowchartLayout(g, centerIdx, adj, {
      showMiniRadar: true,
      icebergScene: ice,
    })

    expect(flow.centerIdx).toBe(centerIdx)
    expect(flow.inNodes.length).toBeGreaterThan(0)
    expect(flow.outNodes.length).toBeGreaterThan(0)
    expect(flow.hasRadar).toBe(true)
    expect(flow.radarBeacon).not.toBeNull()

    const activeSet = new Set([
      flow.centerIdx,
      ...flow.inNodes.map((n) => n.idx),
      ...flow.outNodes.map((n) => n.idx),
    ])
    for (const rn of flow.radarNodes) {
      expect(activeSet.has(rn.idx)).toBe(false)
    }

    for (const edge of flow.edges) {
      expect(edge.fromIdx).not.toBe(edge.toIdx)
      expect(edge.fromX).toBeLessThan(edge.toX)
    }
  })

  it('wrapCoord 与 wrapDelta 保证无限卷轴跨越无缝周期边界时走最短路径', () => {
    const wrapped = wrapCoord(SKY_HALF_W + 40, SKY_HALF_W, SKY_PERIOD_W)
    expect(wrapped).toBe(-SKY_HALF_W + 40)
    const nearLeft = -SKY_HALF_W + 60
    const nearRight = SKY_HALF_W - 40
    expect(wrapDelta(nearLeft - nearRight, SKY_PERIOD_W)).toBe(100)
    expect(wrapDelta(nearRight - nearLeft, SKY_PERIOD_W)).toBe(-100)
  })

  it('computeConstellationsLayout 将词条按关联数分为主星/副星/游离星，组合成 1~2 主星 + 2~8 副星星座并广泛高斯铺展', () => {
    const bigSample: GraphSourceItem[] = []
    const cats = ['都市传说', '民俗', '奇幻', '科学', '网络文化', '地标']
    for (let i = 0; i < 180; i++) {
      bigSample.push(
        item(
          String(i).padStart(8, '0'),
          `星辰词条${i}`,
          cats[i % cats.length]!,
          [`标签${i % 12}`],
          `Tier ${(i % 8) + 1}`,
        ),
      )
    }
    const g = buildGraph(bigSample)
    const adj = adjacencyOf(g)
    const sky = computeConstellationsLayout(g, adj)

    expect(sky.positions).toHaveLength(bigSample.length)
    expect(sky.constellations.length).toBeGreaterThanOrEqual(4)
    expect(sky.arcs.some((a) => a.primary)).toBe(true)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const constMembers = new Set<number>()
    for (const c of sky.constellations) {
      expect(c.primaryIndices.length).toBeGreaterThanOrEqual(1)
      expect(c.primaryIndices.length).toBeLessThanOrEqual(2)
      expect(c.subIndices.length).toBeGreaterThanOrEqual(2)
      expect(c.subIndices.length).toBeLessThanOrEqual(8)
      for (const pIdx of c.primaryIndices) {
        const p = sky.positions[pIdx]!
        expect(p.isPrimary).toBe(true)
        expect(p.starClass).toBe('primary')
        expect(p.isConstellationMember).toBe(true)
      }
      for (const aIdx of c.memberIndices) {
        const p = sky.positions[aIdx]!
        constMembers.add(aIdx)
        expect(p.x).toBeGreaterThanOrEqual(-SKY_HALF_W)
        expect(p.x).toBeLessThan(SKY_HALF_W)
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
    }

    // 确认游离星存在、不组成星座且分布在广域天幕之中
    const wanderers = sky.positions.filter((s) => s.starClass === 'wanderer')
    expect(wanderers.length).toBeGreaterThan(0)
    for (const wSlot of wanderers) {
      expect(wSlot.isPrimary).toBe(false)
      expect(wSlot.isConstellationMember).toBe(false)
      expect(wSlot.constellationId).toBe(-1)
    }
    expect(constMembers.size + wanderers.length).toBe(bigSample.length)

    // 确认广域高斯分布散布范围足够宽广且星座之间存在充裕留白间隔
    expect(maxX - minX).toBeGreaterThan(1400)
    expect(maxY - minY).toBeGreaterThan(700)
    let minCenterDist = Infinity
    for (let i = 0; i < sky.constellations.length; i++) {
      for (let j = i + 1; j < sky.constellations.length; j++) {
        const d = Math.hypot(
          sky.constellations[i]!.cx - sky.constellations[j]!.cx,
          sky.constellations[i]!.cy - sky.constellations[j]!.cy,
        )
        if (d < minCenterDist) minCenterDist = d
      }
    }
    expect(minCenterDist).toBeGreaterThan(280)
  })

  it('词条关联星标上限在 4~12 之间按连通强弱平滑分布（非死板三档）', () => {
    const items: GraphSourceItem[] = []
    for (let i = 0; i < 60; i++) {
      items.push(
        item(String(i).padStart(8, '0'), `星${i}`, '都市传说', i < 20 ? ['核心', '民俗'] : i < 35 ? ['民俗'] : [], 'Tier 3', {
          desc: i < 20 ? '哈尔滨 1990年代 古镇 民俗档案' : i < 40 ? '哈尔滨 1990年代' : '零散记录',
        }),
      )
    }
    const g = buildGraph(items)
    const primaries = g.nodes.filter((n) => n.starClass === 'primary')
    const subs = g.nodes.filter((n) => n.starClass === 'sub')
    const wanderers = g.nodes.filter((n) => n.starClass === 'wanderer')

    expect(primaries.length).toBeGreaterThan(0)
    expect(subs.length).toBeGreaterThan(0)
    expect(wanderers.length).toBeGreaterThan(0)
    const distinctCaps = new Set<number>()
    for (const n of g.nodes) {
      expect(n.maxLinks).toBeGreaterThanOrEqual(4)
      expect(n.maxLinks).toBeLessThanOrEqual(12)
      distinctCaps.add(n.maxLinks)
    }
    // 确认涵盖 4~12 之间多档自然过渡数值，不限于固定 {4,8,12}
    expect(distinctCaps.size).toBeGreaterThanOrEqual(4)
    expect([...distinctCaps].some((v) => v !== 4 && v !== 8 && v !== 12)).toBe(true)
  })
})


