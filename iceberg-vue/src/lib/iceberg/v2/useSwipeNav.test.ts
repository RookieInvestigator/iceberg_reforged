import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { resolveSwipe, useSwipeNav } from './useSwipeNav'

const swipe = (dx: number, dy = 0, width = 400, durationMs = 400) =>
  resolveSwipe({ dx, dy, width, durationMs })

describe('resolveSwipe 手势判定', () => {
  it('向左滑 = 下一条，向右滑 = 上一条', () => {
    expect(swipe(-120)).toBe('next')
    expect(swipe(120)).toBe('prev')
  })

  it('位移太小不算切换（点按/抖动）', () => {
    expect(swipe(-20)).toBeNull()
    expect(swipe(30, 0, 400, 900)).toBeNull()
  })

  it('纵向为主的手势一律不算（正文滚动、下滑关闭）', () => {
    expect(swipe(-100, 90)).toBeNull()
    expect(swipe(100, 200)).toBeNull()
  })

  it('快速轻扫在位移不足阈值时也生效，慢速则必须滑够距离', () => {
    expect(swipe(-40, 0, 1200, 200)).toBe('next')
    expect(swipe(-40, 0, 1200, 700)).toBeNull()
    expect(swipe(-220, 0, 1200, 700)).toBe('next')
  })

  it('阈值随容器宽度放大（宽屏要滑更多）', () => {
    expect(swipe(-80, 0, 300)).toBe('next')
    expect(swipe(-60, 0, 600, 700)).toBeNull()
  })
})

// ── 手势流：挂载一个只带滑动容器的宿主组件，直接派发合成 TouchEvent ──
type FakeTouch = { clientX: number; clientY: number }
type FakeTouchEvent = Event & { touches: FakeTouch[] }

const fire = (el: Element, type: string, touches: FakeTouch[] = []) => {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as FakeTouchEvent
  Object.defineProperty(ev, 'touches', { value: touches })
  el.dispatchEvent(ev)
}

const mountHost = (nav: { prev?: string | null; next?: string | null } = {}) => {
  const onNavigate = vi.fn()
  const Host = defineComponent({
    setup() {
      const { swipeEl } = useSwipeNav({
        prevId: () => (nav.prev === undefined ? 'p1' : nav.prev),
        nextId: () => (nav.next === undefined ? 'n1' : nav.next),
        onNavigate,
      })
      return () => h('div', { ref: swipeEl, class: 'surface' })
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  const el = wrapper.element as HTMLElement
  return { wrapper, el, onNavigate }
}

const gesture = (el: Element, fromX: number, toX: number, y = 300) => {
  fire(el, 'touchstart', [{ clientX: fromX, clientY: y }])
  fire(el, 'touchmove', [{ clientX: (fromX + toX) / 2, clientY: y }])
  fire(el, 'touchmove', [{ clientX: toX, clientY: y }])
}

const tick = () => new Promise((r) => setTimeout(r, 30))

describe('useSwipeNav 手势流', () => {
  beforeEach(() => {
    // jsdom/happy-dom 下容器没有布局，给一个确定宽度
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 400, height: 600, top: 0, left: 0, right: 400, bottom: 600, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('向左滑导航到下一条', async () => {
    const { el, onNavigate } = mountHost()
    gesture(el, 300, 120)
    fire(el, 'touchend')
    expect(onNavigate).toHaveBeenCalledWith('n1')
  })

  it('向右滑导航到上一条', async () => {
    const { el, onNavigate } = mountHost()
    gesture(el, 100, 280)
    fire(el, 'touchend')
    expect(onNavigate).toHaveBeenCalledWith('p1')
  })

  it('拖动过程直接写 inline transform（不经过 Vue 响应式）', async () => {
    const { el } = mountHost()
    gesture(el, 300, 140)
    await tick()
    expect(el.style.transform).toMatch(/translateX\(-160px\)/)
    expect(el.style.transition).toBe('none')
  })

  it('队列边界：只做阻尼跟手，不导航', async () => {
    const { el, onNavigate } = mountHost({ next: null })
    gesture(el, 300, 140)
    await tick()
    // 160px 阻尼 0.22 ≈ 35px
    expect(Math.abs(parseFloat(el.style.transform.replace(/[^\d.-]/g, '')))).toBeLessThan(60)
    fire(el, 'touchend')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('纵向拖动不触发切换', () => {
    const { el, onNavigate } = mountHost()
    fire(el, 'touchstart', [{ clientX: 200, clientY: 300 }])
    fire(el, 'touchmove', [{ clientX: 205, clientY: 430 }])
    fire(el, 'touchend')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('手势被打断（touchcancel）不导航且复位', async () => {
    const { el, onNavigate } = mountHost()
    gesture(el, 300, 140)
    await tick()
    fire(el, 'touchcancel')
    fire(el, 'touchend')
    expect(onNavigate).not.toHaveBeenCalled()
    expect(el.style.transform).toBe('')
  })
})
