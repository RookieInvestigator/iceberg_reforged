import { describe, expect, it } from 'vitest'
import { compilePredicates, computeFilter, type V3FilterSnapshot } from './filter'
import type { V3Item } from './keys'

function makeItem(over: Partial<V3Item> = {}): V3Item {
  return {
    id: 'a1',
    title: '测试词条',
    category: '都市传说',
    tags: [],
    desc: '',
    link: '',
    modifiedAt: 1000,
    related: [],
    categoryColor: '#fff',
    emojis: [],
    tier: 'Tier 1',
    tierIndex: 0,
    ...over,
  }
}

function makeSnap(over: Partial<V3FilterSnapshot> = {}): V3FilterSnapshot {
  return {
    query: '',
    resultSet: null,
    cats: [],
    tags: [],
    tagMode: 'OR',
    hCats: [],
    hTags: [],
    spl: 'all',
    favF: false,
    favSet: new Set<string>(),
    newCutoff: 500,
    ...over,
  }
}

describe('v3/filter', () => {
  it('无任何条件时返回 null visible/matched 并保持原顺序', () => {
    const items = [makeItem({ id: 'a1' }), makeItem({ id: 'b2' })]
    const res = computeFilter(items, compilePredicates(makeSnap()), 'hide')
    expect(res.visible).toBeNull()
    expect(res.matched).toBeNull()
    expect(res.total).toBe(2)
    expect(res.visibleOrder).toEqual(['a1', 'b2'])
  })

  it('noLinkNoDesc 与 V2 同口径（既无链接也无正文，而非缺其一）', () => {
    const bare = makeItem({ id: 'bare', link: '', desc: '' })
    const linkOnly = makeItem({ id: 'link', link: 'https://x.test', desc: '' })
    const descOnly = makeItem({ id: 'desc', link: '', desc: '正文' })
    const both = makeItem({ id: 'both', link: 'https://x.test', desc: '正文' })

    const res = computeFilter(
      [bare, linkOnly, descOnly, both],
      compilePredicates(makeSnap({ spl: 'noLinkNoDesc' })),
      'hide',
    )
    expect([...(res.matched ?? [])]).toEqual(['bare'])
  })

  it('标签大小写不敏感 AND/OR，且与搜索 resultSet 严格 AND', () => {
    const t1 = makeItem({ id: 't1', emojis: ['📜', '🌏'] })
    const t2 = makeItem({ id: 't2', emojis: ['📜'] })

    const orRes = computeFilter(
      [t1, t2],
      compilePredicates(makeSnap({ tags: ['📜', '🌏'], tagMode: 'or' })),
      'hide',
    )
    expect([...(orRes.matched ?? [])]).toEqual(['t1', 't2'])

    const andRes = computeFilter(
      [t1, t2],
      compilePredicates(makeSnap({ tags: ['📜', '🌏'], tagMode: 'and' })),
      'hide',
    )
    expect([...(andRes.matched ?? [])]).toEqual(['t1'])

    const mixedRes = computeFilter(
      [t1, t2],
      compilePredicates(makeSnap({ tags: ['📜'], resultSet: new Set(['t2']) })),
      'hide',
    )
    expect([...(mixedRes.matched ?? [])]).toEqual(['t2'])
  })

  it('隐藏分类优先于选中分类，支持多分类叠加', () => {
    const multi = makeItem({ id: 'm1', category: '民俗', categories: ['民俗', '艺术'] })
    const res1 = computeFilter([multi], compilePredicates(makeSnap({ cats: ['艺术'] })), 'hide')
    expect(res1.total).toBe(1)

    const res2 = computeFilter(
      [multi],
      compilePredicates(makeSnap({ cats: ['艺术'], hCats: ['民俗'] })),
      'hide',
    )
    expect(res2.total).toBe(0)
  })

  it('dim 模式下 visible 为 null 但 matched 与 total 精确反映命中', () => {
    const items = [makeItem({ id: 'a1', category: '民俗' }), makeItem({ id: 'b2', category: '历史' })]
    const res = computeFilter(items, compilePredicates(makeSnap({ cats: ['民俗'] })), 'dim')
    expect(res.visible).toBeNull()
    expect([...(res.matched ?? [])]).toEqual(['a1'])
    expect(res.total).toBe(1)
  })
})
