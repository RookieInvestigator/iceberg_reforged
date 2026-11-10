import { describe, expect, it } from 'vitest'
import { matchesFilter, type FilterSnapshot } from './filterMatch'
import type { RenderItem } from '../injectionKeys'

/**
 * 筛选判定门禁（./filterMatch.ts）。重点钉住「各维度是 AND」：
 * 历史实现在标签分支提前 return，标签一开搜索就整段失效。
 */

function item(over: Partial<RenderItem> = {}): RenderItem {
  return {
    id: 'a1',
    title: '词条',
    category: '都市传说',
    tags: [],
    desc: '',
    link: '',
    modifiedAt: 1000,
    related: [],
    categoryColor: '#fff',
    emojis: [],
    tier: 'Tier 1',
    ...over,
  }
}

function snap(over: Partial<FilterSnapshot> = {}): FilterSnapshot {
  return {
    spl: 'all',
    favF: false,
    favSet: new Set<string>(),
    hCats: [],
    hTags: [],
    cats: [],
    tags: [],
    tagMode: 'OR',
    resultSet: null,
    newCutoff: 500,
    ...over,
  }
}

describe('matchesFilter', () => {
  it('无筛选时全部命中', () => {
    expect(matchesFilter(item(), snap())).toBe(true)
  })

  it('搜索与标签同时生效时必须两者都满足（标签开启不再吞掉搜索）', () => {
    const tagged = item({ emojis: ['📜'] })
    expect(matchesFilter(tagged, snap({ tags: ['📜'], resultSet: new Set(['a1']) }))).toBe(true)
    // 旧实现：标签命中就 return true，这条会错误地通过
    expect(matchesFilter(tagged, snap({ tags: ['📜'], resultSet: new Set(['other']) }))).toBe(false)
  })

  it('标签 OR / AND 两种模式', () => {
    const it2 = item({ emojis: ['📜', '🌏'] })
    expect(matchesFilter(it2, snap({ tags: ['📜', '🧪'], tagMode: 'OR' }))).toBe(true)
    expect(matchesFilter(it2, snap({ tags: ['📜', '🧪'], tagMode: 'AND' }))).toBe(false)
    expect(matchesFilter(it2, snap({ tags: ['📜', '🌏'], tagMode: 'AND' }))).toBe(true)
  })

  it('隐藏分类优先于选中分类', () => {
    expect(matchesFilter(item({ category: '民俗' }), snap({ cats: ['民俗'] }))).toBe(true)
    expect(matchesFilter(item({ category: '民俗' }), snap({ cats: ['民俗'], hCats: ['民俗'] }))).toBe(false)
  })

  it('副分类也参与分类命中（叠加 OR）', () => {
    const it2 = item({ category: '民俗', categories: ['民俗', '艺术'] })
    expect(matchesFilter(it2, snap({ cats: ['艺术'] }))).toBe(true)
  })

  it('特殊档：有链接 / 有正文 / 最近更新 / 无链接无正文', () => {
    const rich = item({ link: 'https://x.test', desc: '正文', modifiedAt: 900 })
    const bare = item({ link: '', desc: '', modifiedAt: 100 })
    expect(matchesFilter(rich, snap({ spl: 'hasLink' }))).toBe(true)
    expect(matchesFilter(bare, snap({ spl: 'hasLink' }))).toBe(false)
    expect(matchesFilter(rich, snap({ spl: 'hasDesc' }))).toBe(true)
    expect(matchesFilter(bare, snap({ spl: 'hasDesc' }))).toBe(false)
    expect(matchesFilter(rich, snap({ spl: 'isNew' }))).toBe(true)
    expect(matchesFilter(bare, snap({ spl: 'isNew' }))).toBe(false)
    expect(matchesFilter(bare, snap({ spl: 'noLinkNoDesc' }))).toBe(true)
    expect(matchesFilter(rich, snap({ spl: 'noLinkNoDesc' }))).toBe(false)
  })

  it('收藏筛选只看集合，收藏 + 搜索同时生效（AND）', () => {
    const fav = new Set(['a1'])
    expect(matchesFilter(item(), snap({ favF: true, favSet: fav }))).toBe(true)
    expect(matchesFilter(item({ id: 'b2' }), snap({ favF: true, favSet: fav }))).toBe(false)
    expect(matchesFilter(item(), snap({ favF: true, favSet: fav, resultSet: new Set(['b2']) }))).toBe(false)
  })
})
