import { describe, expect, it } from 'vitest'
import { decodeTrail, encodeTrail, useTrail } from './useTrail'

describe('useTrail', () => {
  it('reset 起点，push 追加，depth 跟随', () => {
    const t = useTrail()
    expect(t.depth.value).toBe(0)
    t.reset({ id: 'aaaaaaaa', title: 'A' })
    expect(t.trail.value.map((n) => n.id)).toEqual(['aaaaaaaa'])
    t.push({ id: 'bbbbbbbb', title: 'B' })
    expect(t.trail.value.map((n) => n.id)).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(t.depth.value).toBe(1)
  })
  it('回到栈中节点则截断（回跳不堆叠）', () => {
    const t = useTrail()
    t.reset({ id: 'aaaaaaaa', title: 'A' })
    t.push({ id: 'bbbbbbbb', title: 'B' })
    t.push({ id: 'cccccccc', title: 'C' })
    t.push({ id: 'aaaaaaaa', title: 'A' })
    expect(t.trail.value.map((n) => n.id)).toEqual(['aaaaaaaa'])
    expect(t.depth.value).toBe(0)
  })
  it('up 上浮一级，surface 清空', () => {
    const t = useTrail()
    t.reset({ id: 'aaaaaaaa', title: 'A' })
    t.push({ id: 'bbbbbbbb', title: 'B' })
    expect(t.up()).toMatchObject({ id: 'aaaaaaaa' })
    expect(t.depth.value).toBe(0)
    t.surface()
    expect(t.trail.value).toEqual([])
    expect(t.up()).toBeNull()
  })
})

describe('trail codec', () => {
  it('编解码往返，非法段丢弃', () => {
    expect(encodeTrail(['aaaaaaaa', 'xyz', 'bbbbbbbb'])).toBe('aaaaaaaa.bbbbbbbb')
    expect(decodeTrail('aaaaaaaa.bbbbbbbb')).toEqual(['aaaaaaaa', 'bbbbbbbb'])
    expect(decodeTrail('nope')).toEqual([])
    expect(decodeTrail(null)).toEqual([])
    expect(decodeTrail(undefined)).toEqual([])
  })
})
