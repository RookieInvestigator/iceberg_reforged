import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storedAtom, flushPersistedWrites, cancelPersistedWrites } from './settingsStore'

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
})

describe('storedAtom 持久化写入节流', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    flushPersistedWrites()
    vi.useRealTimers()
  })

  it('set 后防抖期内不立即写盘；防抖到期才写入', () => {
    const a = storedAtom('test-write', 'md')
    a.set('xl')
    expect(localStorage.getItem('test-write')).toBeNull()
    vi.advanceTimersByTime(499)
    expect(localStorage.getItem('test-write')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(JSON.parse(localStorage.getItem('test-write')!)).toBe('xl')
  })

  it('防抖期内连续 set：只写最后一次（latest-wins，单次写盘）', () => {
    const a = storedAtom('test-latest', 'md')
    a.set('sm')
    a.set('lg')
    vi.advanceTimersByTime(250)
    a.set('xl')
    vi.advanceTimersByTime(499)
    expect(localStorage.getItem('test-latest')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(JSON.parse(localStorage.getItem('test-latest')!)).toBe('xl')
  })

  it('flushPersistedWrites：立即落盘未写入值并清空待写队列', () => {
    const a = storedAtom('test-flush', 'md')
    a.set('lg')
    flushPersistedWrites()
    expect(JSON.parse(localStorage.getItem('test-flush')!)).toBe('lg')
    // 队列已清空：推进计时器不应再次写入
    vi.advanceTimersByTime(600)
  })

  it('cancelPersistedWrites：丢弃待写入，后续不再落盘', () => {
    const a = storedAtom('test-cancel', 'md')
    a.set('xl')
    cancelPersistedWrites()
    vi.advanceTimersByTime(600)
    expect(localStorage.getItem('test-cancel')).toBeNull()
  })

  it('pagehide：自动 flush 未落盘的最后值', () => {
    const a = storedAtom('test-hide', 'md')
    a.set('lg')
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem('test-hide')!)).toBe('lg')
  })

  it('visibilitychange：自动 flush（隐藏前后事件都可能预示页面退出）', () => {
    const a = storedAtom('test-vis', 'md')
    a.set('xl')
    window.dispatchEvent(new Event('visibilitychange'))
    expect(JSON.parse(localStorage.getItem('test-vis')!)).toBe('xl')
  })
})
