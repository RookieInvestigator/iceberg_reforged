import { describe, expect, it } from 'vitest'
import { buildNavIndex } from './wallState'

const ORDER = ['a', 'b', 'c', 'd', 'e']

describe('buildNavIndex（可见文档序位置索引）', () => {
  it('无过滤：全量序 + 连续位置', () => {
    const idx = buildNavIndex(ORDER, null)
    expect(idx.length).toBe(5)
    expect(idx.order).toEqual(ORDER)
    expect(idx.map.get('c')).toBe(2)
  })

  it('hide 模式：仅可见 id 进索引，位置连续', () => {
    const idx = buildNavIndex(ORDER, new Set(['b', 'd', 'e']))
    expect(idx.order).toEqual(['b', 'd', 'e'])
    expect(idx.map.get('b')).toBe(0)
    expect(idx.map.get('d')).toBe(1)
    expect(idx.map.get('a')).toBeUndefined()
    expect(idx.length).toBe(3)
  })

  it('全空结果：length 0，所有查找 undefined', () => {
    const idx = buildNavIndex(ORDER, new Set())
    expect(idx.length).toBe(0)
    expect(idx.order).toEqual([])
    expect(idx.map.get('a')).toBeUndefined()
  })

  it('空文档序：空索引（分片挂载早期/数据缺位防御）', () => {
    const idx = buildNavIndex([], null)
    expect(idx.length).toBe(0)
    expect(idx.map.size).toBe(0)
  })
})