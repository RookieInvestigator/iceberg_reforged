import { describe, expect, it } from 'vitest'
import {
  GRADIENT_EDGE_HOLD,
  GRADIENT_STEPS,
  applyExtraCategories,
  buildCategories,
  extraBadges,
  gradientStops,
  isMultiCategory,
  itemCategories,
  parseExtraCategories,
} from './extraCategories'

const COLORS = { A: '#111111', B: '#222222', C: '#333333' }

describe('parseExtraCategories', () => {
  it('保序去重，空行丢弃', () => {
    const m = parseExtraCategories('item_id,category\n1,A\n1,B\n1,A\n2,\n, C\n3,C\n')
    expect([...m.entries()]).toEqual([
      ['1', ['A', 'B']],
      ['3', ['C']],
    ])
  })

  it('空表只有头时返回空 Map', () => {
    expect(parseExtraCategories('item_id,category\n').size).toBe(0)
  })
})

describe('itemCategories / buildCategories', () => {
  it('无副表回退主分类', () => {
    expect(itemCategories({ category: 'A' })).toEqual(['A'])
    expect(itemCategories({ category: 'A', categories: [] })).toEqual(['A'])
  })

  it('主分类打头，副表去重且不重复主分类', () => {
    expect(buildCategories('A', ['B', 'A', 'B', '', 'C'])).toEqual(['A', 'B', 'C'])
  })

  it('isMultiCategory 只看归一化后长度', () => {
    expect(isMultiCategory({ category: 'A' })).toBe(false)
    expect(isMultiCategory({ category: 'A', categories: ['A', 'B'] })).toBe(true)
  })
})

describe('extraBadges', () => {
  it('排除主分类，未知分类回退 fallback', () => {
    expect(extraBadges({ category: 'A', categories: ['A', 'B', 'Z'] }, COLORS, '#fff')).toEqual([
      { category: 'B', color: '#222222' },
      { category: 'Z', color: '#fff' },
    ])
  })

  it('单分类返回空数组', () => {
    expect(extraBadges({ category: 'A' }, COLORS, '#fff')).toEqual([])
  })
})

/** 色标串 → [{color, pos}]：形如 `#111111 10%, #222222 20%` */
function parseStops(raw: string): Array<{ color: string; pos: number }> {
  return raw.split(', ').map((seg) => {
    const [color, pos] = seg.split(' ')
    return { color, pos: parseFloat(pos) }
  })
}

describe('gradientStops', () => {
  it('单分类返回空串（调用方渲染纯文本）', () => {
    expect(gradientStops(['A'], COLORS, '#fff')).toBe('')
  })

  it('steps < 2 返回空串', () => {
    expect(gradientStops(['A', 'B'], COLORS, '#fff', 1)).toBe('')
  })

  it('色标数 = steps，端点色贴合输入色', () => {
    const s = parseStops(gradientStops(['A', 'B'], COLORS, '#fff'))
    expect(s).toHaveLength(GRADIENT_STEPS)
    expect(s[0].color).toBe('#111111')
    expect(s[s.length - 1].color).toBe('#222222')
  })

  it('两端固有色平台：首末色标各内缩 edgeHold，其余等距', () => {
    const s = parseStops(gradientStops(['A', 'B'], COLORS, '#fff'))
    expect(s[0].pos).toBe(GRADIENT_EDGE_HOLD)
    expect(s[s.length - 1].pos).toBe(100 - GRADIENT_EDGE_HOLD)
    const gap = s[1].pos - s[0].pos
    for (let i = 2; i < s.length; i++) expect(s[i].pos - s[i - 1].pos).toBeCloseTo(gap, 6)
  })

  it('edgeHold = 0 退化为 0%–100% 满幅（旧行为可复现）', () => {
    const s = parseStops(gradientStops(['A', 'B'], COLORS, '#fff', 5, 0))
    expect(s[0].pos).toBe(0)
    expect(s[4].pos).toBe(100)
  })

  it('edgeHold 过大被钳制：平台不吃掉全部渐变区', () => {
    const s = parseStops(gradientStops(['A', 'B'], COLORS, '#fff', 3, 90))
    expect(s[0].pos).toBeLessThan(50)
    expect(s[s.length - 1].pos).toBeGreaterThan(50)
  })

  it('短标题不再逐字跳变：5 步色标互不相同（连续渐变的前提）', () => {
    const s = parseStops(gradientStops(['R', 'B'], { R: '#FF3333', B: '#85D6FF' }, '#fff', 5))
    expect(new Set(s.map((x) => x.color)).size).toBe(5)
    expect(s[2].color).not.toBe(s[0].color)
    expect(s[2].color).not.toBe(s[4].color)
  })

  it('中段不脏：红→浅蓝中间仍是高饱和色（非灰）', () => {
    const mid = parseStops(gradientStops(['R', 'B'], { R: '#FF3333', B: '#85D6FF' }, '#fff', 5))[2].color
    const n = parseInt(mid.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(40)
    expect(r).toBeGreaterThan(150) // 品红方向而非灰
  })

  it('白端继承对方色相：白→红中间是粉色系', () => {
    const mid = parseStops(gradientStops(['W', 'R'], { W: '#FFFFFF', R: '#FF3333' }, '#fff', 5))[2].color
    const n = parseInt(mid.slice(1), 16)
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    expect(r).toBeGreaterThan(200)
    expect(g).toBeGreaterThan(100)
    expect(b).toBeGreaterThan(100)
    expect(r - g).toBeGreaterThan(20)
  })

  it('未知分类回退 fallback', () => {
    const s = parseStops(gradientStops(['A', 'Z'], COLORS, '#FFFFFF'))
    expect(s[s.length - 1].color).toBe('#FFFFFF')
  })
})

type GradItem = { id: string; category: string; categories?: string[]; gradStops?: string }

describe('applyExtraCategories', () => {
  function mkData(): {
    tiers: Record<string, GradItem[]>
    categoryColors: Record<string, string>
    defaultColor: string
  } {
    return {
      tiers: { T1: [{ id: '1', category: 'A' }, { id: '2', category: 'A' }] },
      categoryColors: COLORS,
      defaultColor: '#fff',
    }
  }

  it('副分类挂载 + 渐变命中数上报（单分类不挂 gradStops）', () => {
    const data = mkData()
    const hits = applyExtraCategories(data, new Map([['1', ['B']]]))
    expect(hits).toBe(1)
    expect(data.tiers.T1[0].categories).toEqual(['A', 'B'])
    expect(data.tiers.T1[0].gradStops).toBeTruthy()
    expect(data.tiers.T1[1].categories).toEqual(['A'])
    expect(data.tiers.T1[1].gradStops).toBeUndefined()
  })

  it('未知分类被过滤：不进入 categories，也不触发渐变', () => {
    const data = mkData()
    const hits = applyExtraCategories(data, new Map([['1', ['Z']], ['2', ['A']]]))
    expect(hits).toBe(0)
    expect(data.tiers.T1[0].categories).toEqual(['A'])
  })
})
