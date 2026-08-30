/**
 * 轻量补间层（替代 GSAP）—— 仅覆盖本项目实际用到的 4 个 API。
 *
 * 背景：GSAP 在生产构建里占 70KB / **27.4KB gzip**，而 `iceberg3d` 只用到
 * `to` / `fromTo` / `killTweensOf` / `isTweening` 四个方法和 4 条缓动曲线，
 * 没有时间轴、插件、SVG、ScrollTrigger。改用 `@tweenjs/tween.js`（3.6KB gzip）后
 * `/3d` 路由省约 23.8KB gzip。
 *
 * 语义对齐 GSAP（调用侧心智无需改变）：
 *  - `duration` / `delay` 用**秒**（tween.js 原生是毫秒，这里统一换算）
 *  - `killTweensOf()` **不触发** onComplete（与 GSAP 一致）
 *  - `to()` 不自动 kill 同目标上的旧 tween（GSAP 3 默认 `overwrite: false`），
 *    需要覆盖时调用侧显式先 kill —— 现有调用点本来就是这么写的
 *
 * 缓动映射（GSAP 命名 → 曲线）：power1=二次 / power2=三次 / power3=四次 / power4=五次。
 * `back.out(1.4)` 单独实现：tween.js 的 `Back.Out` 固定 overshoot = 1.70158，
 * 与 GSAP 的 1.4 不同，为保持视觉一致这里手写。
 */
import { Easing, Group, Tween } from '@tweenjs/tween.js'

/** tween.js 未导出该类型名，这里本地声明 */
type EaseFn = (amount: number) => number

/** Back.Out 公式，overshoot 可调（tween.js 内置固定为 1.70158） */
function backOut(s: number): EaseFn {
  return (amount: number) => {
    if (amount === 0) return 0
    const t = amount - 1
    return t * t * ((s + 1) * t + s) + 1
  }
}

const EASES: Record<string, EaseFn> = {
  none: Easing.Linear.None,
  linear: Easing.Linear.None,
  'power1.out': Easing.Quadratic.Out,
  'power1.in': Easing.Quadratic.In,
  'power1.inOut': Easing.Quadratic.InOut,
  'power2.out': Easing.Cubic.Out,
  'power2.in': Easing.Cubic.In,
  'power2.inOut': Easing.Cubic.InOut,
  'power3.out': Easing.Quartic.Out,
  'power3.in': Easing.Quartic.In,
  'power3.inOut': Easing.Quartic.InOut,
  'back.out': backOut(1.70158),
  'back.out(1.4)': backOut(1.4),
  'back.in': Easing.Back.In,
  'back.inOut': Easing.Back.InOut,
}

function resolveEase(name: string): EaseFn {
  const fn = EASES[name]
  if (fn) return fn
  // 未登记的缓动名：退化为 power1.out（接近 GSAP 找不到缓动时的默认行为），
  // 开发期告警，避免静默走错曲线
  if (import.meta.env.DEV) console.warn(`[tween] 未登记的缓动 "${name}"，回退 power1.out`)
  return Easing.Quadratic.Out
}

export interface TweenVars {
  /** 时长（秒） */
  duration?: number
  /** 延迟（秒） */
  delay?: number
  /** 缓动名，见 EASES */
  ease?: string
  onUpdate?: () => void
  onComplete?: () => void
  /** 其余键视为要补间的数值属性 */
  [prop: string]: unknown
}

const RESERVED = new Set(['duration', 'delay', 'ease', 'onUpdate', 'onComplete'])

function pickProps(vars: TweenVars): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(vars)) {
    if (!RESERVED.has(k) && typeof v === 'number') out[k] = v
  }
  return out
}

const group = new Group()

/** 目标对象 → 其上运行中的 tween 集合（供 killTweensOf / isTweening 查询） */
const registry = new Map<object, Set<Tween<any>>>()

let rafId = 0

function tick(time: number) {
  rafId = requestAnimationFrame(tick)
  group.update(time)
  if (registry.size === 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

/** 有 tween 在跑才维持 rAF 循环，空闲自动停（等同 GSAP 自有 ticker 的懒启动行为） */
function ensureLoop() {
  if (rafId) return
  rafId = requestAnimationFrame(tick)
}

function track(target: object, tween: Tween<any>) {
  let set = registry.get(target)
  if (!set) {
    set = new Set()
    registry.set(target, set)
  }
  set.add(tween)
}

function untrack(target: object, tween: Tween<any>) {
  const set = registry.get(target)
  if (!set) return
  set.delete(tween)
  if (set.size === 0) registry.delete(target)
}

/**
 * 补间到目标值（`gsap.to` 语义）。**不会**自动 kill 同目标上的旧 tween，
 * 需要覆盖时请在调用侧先 `killTweensOf(target)`。
 */
export function to(target: object, vars: TweenVars): void {
  const durationMs = (vars.duration ?? 0.5) * 1000
  const delayMs = (vars.delay ?? 0) * 1000
  const onUpdate = vars.onUpdate
  const onComplete = vars.onComplete

  const tween = new Tween<any>(target as any)
  tween.to(pickProps(vars), durationMs)
  tween.easing(resolveEase(vars.ease ?? 'power1.out'))
  if (delayMs > 0) tween.delay(delayMs)
  if (onUpdate) tween.onUpdate(() => onUpdate())
  tween.onComplete(() => {
    untrack(target, tween)
    group.remove(tween)
    onComplete?.()
  })

  track(target, tween)
  group.add(tween)
  tween.start()
  ensureLoop()
}

/** 立即写入 from 的初值，再补间到 to（`gsap.fromTo` 语义） */
export function fromTo(target: object, fromVars: TweenVars, toVars: TweenVars): void {
  Object.assign(target, pickProps(fromVars))
  to(target, toVars)
}

/**
 * 停止目标上的全部 tween。与 GSAP 一致：**不触发** onComplete。
 */
export function killTweensOf(target: object): void {
  const set = registry.get(target)
  if (!set) return
  for (const t of [...set]) {
    t.stop()
    group.remove(t)
  }
  registry.delete(target)
}

/** 目标上是否有正在运行的 tween（`gsap.isTweening` 语义） */
export function isTweening(target: object): boolean {
  const set = registry.get(target)
  if (!set) return false
  for (const t of set) if (t.isPlaying()) return true
  return false
}

/** 停止全部 tween 并释放循环（引擎 dispose 时调用） */
export function killAllTweens(): void {
  for (const set of registry.values()) {
    for (const t of set) {
      t.stop()
      group.remove(t)
    }
  }
  registry.clear()
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

/** 测试用：当前登记中的目标数 / 缓动表 */
export function __testing() {
  return { registry, EASES, group }
}
