import { describe, expect, it } from 'vitest'
import { normalizeTags } from './tags'
import { handbookLink } from './handbook'

describe('normalizeTags', () => {
  it('数组过滤空值并转字符串', () => {
    expect(normalizeTags(['a', '', 'b'])).toEqual(['a', 'b'])
  })
  it('JSON 字符串解析', () => {
    expect(normalizeTags('["a","b"]')).toEqual(['a', 'b'])
  })
  it('分隔符切分（半角/全角逗号/竖线）', () => {
    expect(normalizeTags('a，b|c')).toEqual(['a', 'b', 'c'])
  })
  it('空值与非字符串返回空数组', () => {
    expect(normalizeTags(undefined)).toEqual([])
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags(42)).toEqual([])
    expect(normalizeTags('   ')).toEqual([])
  })
})

describe('handbookLink', () => {
  it('构造术语表深链，from 可选', () => {
    expect(handbookLink('criteria', '都市传说')).toEqual({
      path: '/handbook',
      query: { tab: 'criteria', term: '都市传说' },
    })
    expect(handbookLink('criteria', '都市传说', '/v2').query).toMatchObject({ from: '/v2' })
  })
})
