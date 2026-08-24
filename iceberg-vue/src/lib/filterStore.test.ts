import { describe, expect, it } from 'vitest'
import { hasActiveFilter, type ActiveFilterSnapshot } from './filterStore'

const base: ActiveFilterSnapshot = {
  query: '', cats: [], tags: [], hCats: [], hTags: [], spl: 'all', favF: false,
}

describe('hasActiveFilter（单一判定源）', () => {
  it('空态（默认值）= false', () => {
    expect(hasActiveFilter(base)).toBe(false)
  })

  it('任一维度生效即 true', () => {
    expect(hasActiveFilter({ ...base, query: '公交车' })).toBe(true)
    expect(hasActiveFilter({ ...base, cats: ['分类A'] })).toBe(true)
    expect(hasActiveFilter({ ...base, tags: ['👻'] })).toBe(true)
    expect(hasActiveFilter({ ...base, hCats: ['分类B'] })).toBe(true)
    expect(hasActiveFilter({ ...base, hTags: ['🔥'] })).toBe(true)
    expect(hasActiveFilter({ ...base, spl: 'hasLink' })).toBe(true)
    expect(hasActiveFilter({ ...base, favF: true })).toBe(true)
  })

  it('specialFilter 的 all 与 favF=false 不误判', () => {
    expect(hasActiveFilter({ ...base, spl: 'all', favF: false })).toBe(false)
  })
})