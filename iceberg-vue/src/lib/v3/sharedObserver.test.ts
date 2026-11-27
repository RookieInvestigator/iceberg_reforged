import { describe, expect, it, vi } from 'vitest'
import { _observerPoolSize, observeShared } from './sharedObserver'

describe('v3/sharedObserver', () => {
  it('相同配置共享一个 IntersectionObserver，全部解除后清理池', () => {
    const observe = vi.fn()
    const unobserve = vi.fn()
    const disconnect = vi.fn()
    let calls = 0

    const MockIO = vi.fn(function (this: any) {
      calls++
      this.observe = observe
      this.unobserve = unobserve
      this.disconnect = disconnect
    }) as unknown as typeof IntersectionObserver

    const orig = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = MockIO
    try {
      const a = document.createElement('div')
      const b = document.createElement('div')
      const c = document.createElement('div')

      const stopA = observeShared(a, () => {}, { rootMargin: '-10% 0px', threshold: 0 })
      const stopB = observeShared(b, () => {}, { rootMargin: '-10% 0px', threshold: 0 })
      const stopC = observeShared(c, () => {}, { rootMargin: '0px', threshold: 0 })

      expect(calls).toBe(2)
      expect(_observerPoolSize()).toBe(2)
      expect(observe).toHaveBeenCalledTimes(3)

      stopA()
      expect(disconnect).not.toHaveBeenCalled()
      stopB()
      expect(disconnect).toHaveBeenCalledTimes(1)
      expect(_observerPoolSize()).toBe(1)

      stopC()
      expect(disconnect).toHaveBeenCalledTimes(2)
      expect(_observerPoolSize()).toBe(0)
    } finally {
      globalThis.IntersectionObserver = orig
    }
  })
})
