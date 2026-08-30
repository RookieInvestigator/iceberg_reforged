import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromTo, isTweening, killAllTweens, killTweensOf, to, __testing } from './tween'

/**
 * 补间层语义守卫（GSAP → @tweenjs/tween.js 替换后新增）。
 *
 * 这里锁的都是「换库后最容易静默走样」的语义：
 *  - duration/delay 用秒而非毫秒（tween.js 原生是 ms）
 *  - killTweensOf 不触发 onComplete（GSAP 语义；若误触发会让聚焦环在退出时被重新点亮）
 *  - isTweening 在完成后回到 false（engine 的渲染循环据此决定是否接管聚焦环坐标）
 *  - back.out(1.4) 的 overshoot 是 1.4 而非 tween.js 内置的 1.70158
 */
describe('tween 层', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    killAllTweens()
  })

  afterEach(() => {
    killAllTweens()
    vi.useRealTimers()
  })

  // 注意：rAF 按 ~16ms 一帧推进，advanceTimersByTime(500) 的实际末帧约 496ms，
  // 因此进度断言用区间而非精确值（若 duration 误按毫秒实现，这里会直接跑到终值 10）
  it('duration 以秒为单位（linear 下走到一半约为中值）', () => {
    const obj = { x: 0 }
    to(obj, { x: 10, duration: 1, ease: 'none' })
    vi.advanceTimersByTime(500)
    expect(obj.x).toBeGreaterThan(4.4)
    expect(obj.x).toBeLessThan(5.6)
  })

  it('完成后落到终值并触发 onComplete（仅一次）', () => {
    const obj = { x: 0 }
    const onComplete = vi.fn()
    to(obj, { x: 10, duration: 0.5, ease: 'none', onComplete })
    vi.advanceTimersByTime(600)
    expect(obj.x).toBeCloseTo(10, 5)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('onUpdate 在过程中被调用', () => {
    const obj = { x: 0 }
    const onUpdate = vi.fn()
    to(obj, { x: 10, duration: 0.5, ease: 'none', onUpdate })
    vi.advanceTimersByTime(200)
    expect(onUpdate).toHaveBeenCalled()
    expect(obj.x).toBeGreaterThan(0)
  })

  it('killTweensOf 停止补间且【不】触发 onComplete（GSAP 语义）', () => {
    const obj = { x: 0 }
    const onComplete = vi.fn()
    to(obj, { x: 10, duration: 0.5, ease: 'none', onComplete })
    vi.advanceTimersByTime(200)
    const mid = obj.x
    expect(mid).toBeGreaterThan(0)

    killTweensOf(obj)
    vi.advanceTimersByTime(800)

    expect(onComplete).not.toHaveBeenCalled()
    expect(obj.x).toBe(mid) // 停在原地，不再前进
  })

  it('isTweening 反映运行状态，完成后回到 false', () => {
    const obj = { x: 0 }
    expect(isTweening(obj)).toBe(false)
    to(obj, { x: 10, duration: 0.5, ease: 'none' })
    expect(isTweening(obj)).toBe(true)
    vi.advanceTimersByTime(600)
    expect(isTweening(obj)).toBe(false)
  })

  it('killTweensOf 后 isTweening 立即为 false', () => {
    const obj = { x: 0 }
    to(obj, { x: 10, duration: 0.5, ease: 'none' })
    expect(isTweening(obj)).toBe(true)
    killTweensOf(obj)
    expect(isTweening(obj)).toBe(false)
  })

  it('fromTo 立即写入初值，再补间到目标', () => {
    const obj = { x: 0 }
    fromTo(obj, { x: -20 }, { x: 10, duration: 1, ease: 'none' })
    expect(obj.x).toBe(-20) // 同步写入
    vi.advanceTimersByTime(500)
    expect(obj.x).toBeGreaterThan(-5.7)
    expect(obj.x).toBeLessThan(-4.3)
    vi.advanceTimersByTime(600)
    expect(obj.x).toBeCloseTo(10, 5)
  })

  it('to 不自动 kill 同目标上的旧补间（GSAP 3 默认 overwrite:false）', () => {
    const obj = { x: 0 }
    to(obj, { x: 10, duration: 1, ease: 'none' })
    to(obj, { x: 100, duration: 1, ease: 'none' })
    // 两个 tween 并存（调用侧需要覆盖时自己先 killTweensOf）
    expect(__testing().registry.get(obj)?.size).toBe(2)
  })

  it('delay 以秒为单位', () => {
    const obj = { x: 0 }
    to(obj, { x: 10, duration: 0.5, delay: 0.5, ease: 'none' })
    vi.advanceTimersByTime(300)
    expect(obj.x).toBe(0) // 仍在延迟中
    vi.advanceTimersByTime(800)
    expect(obj.x).toBeCloseTo(10, 5)
  })

  it('killAllTweens 清空全部目标', () => {
    const a = { x: 0 }
    const b = { y: 0 }
    to(a, { x: 1, duration: 1, ease: 'none' })
    to(b, { y: 1, duration: 1, ease: 'none' })
    expect(__testing().registry.size).toBe(2)
    killAllTweens()
    expect(__testing().registry.size).toBe(0)
    expect(isTweening(a)).toBe(false)
    expect(isTweening(b)).toBe(false)
  })
})

describe('缓动映射', () => {
  const { EASES } = __testing()

  it('power1/2/3 对应二次/三次/四次（与 GSAP 命名一致）', () => {
    // power2 = 三次：t=0.5 时 ease.out = 1-(1-0.5)^3 = 0.875
    expect(EASES['power2.out'](0.5)).toBeCloseTo(0.875, 5)
    // power1 = 二次：t=0.5 时 = 1-(0.5)^2 = 0.75
    expect(EASES['power1.out'](0.5)).toBeCloseTo(0.75, 5)
    // power3 = 四次：t=0.5 时 = 1-(0.5)^4 = 0.9375
    expect(EASES['power3.out'](0.5)).toBeCloseTo(0.9375, 5)
  })

  it('back.out(1.4) 会过冲且过冲量对应 s=1.4（非 tween.js 内置的 1.70158）', () => {
    let peak = 0
    for (let i = 0; i <= 100; i++) peak = Math.max(peak, EASES['back.out(1.4)'](i / 100))
    expect(peak).toBeGreaterThan(1) // 过冲
    // 锚点：s=1.4 时 t=0.6 → 1.0704；tween.js 内置 s=1.70158 时同点位为 1.0994。
    // 两者差 0.029，足以断言没有被回退成内置值
    expect(EASES['back.out(1.4)'](0.6)).toBeCloseTo(1.0704, 4)
    expect(EASES['back.out(1.4)'](0.6)).not.toBeCloseTo(EASES['back.out'](0.6), 3)
  })

  it('端点值稳定（0 → 0，1 → 1）', () => {
    for (const name of Object.keys(EASES)) {
      expect(EASES[name](0), name).toBeCloseTo(0, 5)
      expect(EASES[name](1), name).toBeCloseTo(1, 5)
    }
  })
})
