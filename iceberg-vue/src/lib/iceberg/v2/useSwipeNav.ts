// 移动端详情页左右滑动切换相邻词条。
//
// 语义与键盘 ←/→ 一致：向右滑 = 上一条（prev），向左滑 = 下一条（next）。
//
// 实现要点（都是实测踩过的）：
// - 监听器以 **passive** 注册：本手势从不 preventDefault，声明 passive 后浏览器不必等
//   主线程即可滚动/合成，避免 "touchmove handler delayed" 警告；
// - 跟手位移直接写 element.style，并按 rAF 每帧最多写一次 —— 不经过 Vue 响应式，
//   长列表/评论区繁忙时也不会掉帧；
// - 容器用 touch-action: pan-y：横向手势交给我们，纵向滚动归浏览器，
//   同时挡掉 Chrome 的「横滑前进/后退」导航手势（那条会冒出箭头的系统 UI）。
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** 触发切换所需的最小横向位移（px） */
const MIN_DX = 56
/** 触发切换所需的最小横向位移占比（相对容器宽度） */
const MIN_DX_RATIO = 0.18
/** 快速轻扫：位移不必达阈值，但必须在很短时间内完成 */
const FLICK_DX = 30
const FLICK_MS = 260
/** 横向位移要明显大于纵向，避免斜向拖动误触 */
const AXIS_RATIO = 1.5
/** 轴锁定的最小移动量：低于它还在「点按」范畴 */
const AXIS_LOCK_PX = 8
/** 到达队列边界时的阻尼系数（拖不动但有一点跟随感） */
const EDGE_DAMP = 0.22
/** 松手回弹时长；reduced-motion 下归零 */
const SPRING_MS = 220

export interface SwipeInput {
  /** 横向位移（正 = 向右） */
  dx: number
  /** 纵向位移绝对值 */
  dy: number
  /** 手势所在容器宽度（用于按比例定阈值） */
  width: number
  /** 手势耗时（毫秒） */
  durationMs: number
}

/** 纯函数：判定这次横滑是否构成切换，以及切到哪个方向。 */
export function resolveSwipe({ dx, dy, width, durationMs }: SwipeInput): 'prev' | 'next' | null {
  const absDx = Math.abs(dx)
  if (absDx <= AXIS_LOCK_PX) return null
  if (absDx <= dy * AXIS_RATIO) return null
  const threshold = Math.max(MIN_DX, width * MIN_DX_RATIO)
  const passedDistance = absDx >= threshold
  const passedFlick = absDx >= FLICK_DX && durationMs <= FLICK_MS
  if (!passedDistance && !passedFlick) return null
  return dx > 0 ? 'prev' : 'next'
}

export interface UseSwipeNavOptions {
  /** 向右滑（回看上一条）；没有上一条时传 null，手势只做回弹 */
  prevId: () => string | null
  /** 向左滑（看下一条）；没有下一条时传 null */
  nextId: () => string | null
  onNavigate: (id: string) => void
  /** 右滑时淡入的边缘提示（左边缘的 ›）；不传则不显示 */
  prevHint?: Ref<HTMLElement | null>
  /** 左滑时淡入的边缘提示（右边缘的 ‹）；不传则不显示 */
  nextHint?: Ref<HTMLElement | null>
}

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 左右滑动切换词条。把返回的 `swipeEl` 绑到容器上即可，挂载/卸载由内部负责。
 */
export function useSwipeNav(opts: UseSwipeNavOptions) {
  const swipeEl = ref<HTMLElement | null>(null)

  let startX = 0
  let startY = 0
  let startAt = 0
  let axis: 'none' | 'horizontal' | 'vertical' = 'none'
  let dx = 0
  let dy = 0
  let width = 0
  let raf = 0
  let pendingDx = 0
  let attached: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let hasTarget = true
  let canceled = false

  /** 容器宽度缓存：手势开始时量尺寸会触发强制布局，改为挂载/尺寸变化时量一次 */
  const measureWidth = () => {
    width = attached?.getBoundingClientRect().width || window.innerWidth
  }

  /** 边缘箭头：透明度 = 拖动进度（边界方向只给 35%，暗示「到头了」） */
  const setHint = (hint: Ref<HTMLElement | null> | undefined, progress: number) => {
    const el = hint?.value
    if (!el) return
    el.style.opacity = progress > 0 ? String(Math.min(1, progress)) : '0'
  }

  const writeTransform = () => {
    raf = 0
    const el = attached
    if (!el) return
    el.style.transition = 'none'
    el.style.transform = pendingDx === 0 ? '' : `translateX(${pendingDx}px)`
    const threshold = Math.max(MIN_DX, width * MIN_DX_RATIO)
    const progress = Math.min(1, Math.abs(pendingDx) / threshold)
    const weight = hasTarget ? progress : progress * 0.35
    if (dx > 0) {
      setHint(opts.prevHint, weight)
      setHint(opts.nextHint, 0)
    } else {
      setHint(opts.nextHint, weight)
      setHint(opts.prevHint, 0)
    }
  }

  const schedule = (value: number) => {
    pendingDx = value
    if (!raf) raf = requestAnimationFrame(writeTransform)
  }

  const clearTransform = () => {
    const el = attached
    if (!el) return
    el.style.willChange = ''
    const spring = prefersReducedMotion() ? 0 : SPRING_MS
    el.style.transition = spring ? `transform ${spring}ms var(--ease-out, ease-out)` : 'none'
    el.style.transform = ''
    setHint(opts.prevHint, 0)
    setHint(opts.nextHint, 0)
  }

  function reset() {
    axis = 'none'
    dx = 0
    dy = 0
    pendingDx = 0
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function onTouchstart(e: TouchEvent) {
    // 新手势从干净状态开始：上一条手势若被打断，残留 translateX 会让内容整块左移被裁（实测症状）
    clearTransform()
    canceled = false
    if (e.touches.length !== 1 || !attached) {
      reset()
      return
    }
    const touch = e.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    startAt = performance.now()
    axis = 'none'
    dx = 0
    dy = 0
    pendingDx = 0
    hasTarget = true
    setHint(opts.prevHint, 0)
    setHint(opts.nextHint, 0)
    // 宽度用缓存的（见 measureWidth）：这里绝不量尺寸，避免 touchstart 强制布局
    if (!width) measureWidth()
    attached.style.willChange = 'transform'
  }

  function onTouchmove(e: TouchEvent) {
    // 多指/掌触：本条手势作废并立即复位，不能停在半个位移上
    if (e.touches.length !== 1) {
      canceled = true
      reset()
      clearTransform()
      return
    }
    const touch = e.touches[0]
    dx = touch.clientX - startX
    dy = Math.abs(touch.clientY - startY)
    if (axis === 'none') {
      if (Math.abs(dx) < AXIS_LOCK_PX && dy < AXIS_LOCK_PX) return
      axis = Math.abs(dx) > dy * AXIS_RATIO ? 'horizontal' : 'vertical'
    }
    if (axis !== 'horizontal') return
    hasTarget = !!(dx > 0 ? opts.prevId() : opts.nextId())
    schedule(hasTarget ? dx : dx * EDGE_DAMP)
  }

  function onTouchend() {
    if (canceled) {
      canceled = false
      reset()
      clearTransform()
      return
    }
    if (axis !== 'horizontal') {
      reset()
      clearTransform()
      return
    }
    const direction = resolveSwipe({ dx, dy, width, durationMs: performance.now() - startAt })
    const id = direction === 'prev' ? opts.prevId() : direction === 'next' ? opts.nextId() : null
    reset()
    clearTransform()
    if (id) opts.onNavigate(id)
  }

  function onTouchcancel() {
    reset()
    clearTransform()
  }

  function attach() {
    const el = swipeEl.value
    if (!el || attached === el) return
    detach()
    attached = el
    measureWidth()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measureWidth)
      resizeObserver.observe(el)
    }
    const passive: AddEventListenerOptions = { passive: true }
    el.addEventListener('touchstart', onTouchstart, passive)
    el.addEventListener('touchmove', onTouchmove, passive)
    el.addEventListener('touchend', onTouchend, passive)
    el.addEventListener('touchcancel', onTouchcancel, passive)
  }

  function detach() {
    if (!attached) return
    clearTransform()
    attached.removeEventListener('touchstart', onTouchstart)
    attached.removeEventListener('touchmove', onTouchmove)
    attached.removeEventListener('touchend', onTouchend)
    attached.removeEventListener('touchcancel', onTouchcancel)
    resizeObserver?.disconnect()
    resizeObserver = null
    attached.style.willChange = ''
    attached = null
    reset()
  }

  watch(swipeEl, (el) => {
    if (el) attach()
    else detach()
  })
  onMounted(() => {
    if (swipeEl.value) attach()
  })
  onBeforeUnmount(detach)

  return { swipeEl }
}
