import { beforeEach, describe, expect, it } from 'vitest'
import { storedAtom } from './settingsStore'

describe('storedAtom', () => {
  beforeEach(() => localStorage.clear())

  it('无持久化值时返回 fallback', () => {
    const a = storedAtom('test-fallback', 'md')
    expect(a.get()).toBe('md')
  })

  it('从 localStorage 恢复持久化值', () => {
    localStorage.setItem('test-persist', JSON.stringify('lg'))
    const a = storedAtom('test-persist', 'md')
    expect(a.get()).toBe('lg')
  })

  it('损坏 JSON 静默回退 fallback', () => {
    localStorage.setItem('test-bad', '{oops')
    const a = storedAtom('test-bad', 3)
    expect(a.get()).toBe(3)
  })

  it('类型不匹配的值回退 fallback（对象替字符串）', () => {
    localStorage.setItem('test-type', JSON.stringify({ a: 1 }))
    const a = storedAtom('test-type', 'md')
    expect(a.get()).toBe('md')
  })

  it('数组持久化：元素类型与 fallback 首元素不一致时回退（P1-21 防崩溃）', () => {
    localStorage.setItem('test-arr', JSON.stringify([123]))
    const a = storedAtom('test-arr', ['x'] as string[])
    expect(a.get()).toEqual(['x'])
  })

  it('数组持久化：元素类型一致则恢复', () => {
    localStorage.setItem('test-arr-ok', JSON.stringify(['x']))
    const a = storedAtom('test-arr-ok', [] as string[])
    expect(a.get()).toEqual(['x'])
  })

  it('set 时写入 localStorage', () => {
    const a = storedAtom('test-write', 'md')
    a.set('xl')
    expect(JSON.parse(localStorage.getItem('test-write')!)).toBe('xl')
  })
})
