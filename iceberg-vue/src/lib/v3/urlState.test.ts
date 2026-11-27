import { describe, expect, it } from 'vitest'
import { readV3UrlState, writeV3UrlParams } from './urlState'

describe('v3/urlState', () => {
  it('默认态不产生多余查询参数，保留既有非筛选参数', () => {
    const qs = new URLSearchParams('?trail=abcd1234')
    writeV3UrlParams(qs, {
      q: '',
      cats: [],
      tags: [],
      hCats: [],
      hTags: [],
      sp: 'all',
      fav: false,
      tm: 'OR',
      sm: 'full',
      fm: 'fuzzy',
      sort: 'default',
      scatter: false,
    })
    expect(qs.toString()).toBe('trail=abcd1234')
  })

  it('筛选与视图状态可无损往返序列化并校验合法集合', () => {
    const qs = new URLSearchParams()
    writeV3UrlParams(qs, {
      q: '克苏鲁',
      cats: ['民俗', '悬疑'],
      tags: ['🔥'],
      hCats: ['谣言'],
      hTags: ['💀'],
      sp: 'isNew',
      fav: true,
      tm: 'AND',
      sm: 'title',
      fm: 'exact',
      sort: 'title-asc',
      scatter: true,
    })

    const parsed = readV3UrlState(
      `?${qs.toString()}`,
      new Set(['民俗', '悬疑', '谣言']),
      new Set(['🔥', '💀']),
    )

    expect(parsed).toEqual({
      q: '克苏鲁',
      cats: ['民俗', '悬疑'],
      tags: ['🔥'],
      hCats: ['谣言'],
      hTags: ['💀'],
      sp: 'isNew',
      fav: true,
      tm: 'AND',
      sm: 'title',
      fm: 'exact',
      sort: 'title-asc',
      scatter: true,
    })

    const filtered = readV3UrlState(
      '?cat=民俗,不存在&sp=invalid&sort=bogus',
      new Set(['民俗']),
    )
    expect(filtered.cats).toEqual(['民俗'])
    expect(filtered.sp).toBeUndefined()
    expect(filtered.sort).toBeUndefined()
  })
})
