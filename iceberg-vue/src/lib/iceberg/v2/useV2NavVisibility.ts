import { onMounted, onUnmounted, ref, type Ref } from 'vue'

// V2 导航显隐 + 滚动帧状态机（审计 C3：V2FilterBar 拆分其一）。
// 滚动方向感知 / 顶部热区 / 变形吸顶 / 面板开关 / 层级 scroll-spy / 进度直写，
// 共用同一 rAF 循环（与 P1/P2 同因，禁止再拆第二条循环）。
// suggest 下拉的开关由搜索域持有，经参数传入（外部点击关闭时联动）。
export function useV2NavVisibility(opts: { tierOrder: string[]; suggestOpen: Ref<boolean> }) {
  const { tierOrder, suggestOpen } = opts

  const expanded = ref(false)
  // 显隐组合：方向感知为主（上滚显 / 下滚隐，±10px 位移阈值防抖），
  // 顶部 96px 热区悬停临时展示；页顶 80px 内、面板/下拉/搜索聚焦、触屏常显。
  // P5：hotY 只在 onScroll 内读取、不参与渲染，用普通变量（省每帧响应式 setter 开销）
  let hotY = -1
  const searchFocus = ref(false)
  const coarse = ref(false)
  const barVisible = ref(true)
  let lastY = 0
  // C4：外部关闭来源显式区分（替代时间戳 hack）——FAB 在栏外，它的 mousedown 会先走
  // onDocDown 把面板关掉、紧接着 click 又会 toggle 开。onDocDown 只在真正关掉时立 flag，
  // togglePanel('fab') 消费一次后跳过重开；栏内按钮的 mousedown 不出栏，不受影响。
  let closedFromOutside = false

  const stuck = ref(false)
  const curTier = ref('')
  /** 第一层上方（masthead 区）：spy 无命中且首层仍在视口下方，指示器显示总数 */
  const atTop = ref(false)
  const tierOpen = ref(false)
  const barRef = ref<HTMLElement | null>(null)
  // 阅读进度（0–1）：复用同一 rAF 循环，直接赋值（帧率即平滑，无需过渡）
  const progressEl = ref<HTMLElement | null>(null)

  function onMouseMove(e: MouseEvent) {
    hotY = e.clientY
    // 热区直达：不经过滚动帧，进来立刻显现；离开则隐藏（保底态除外）；
    // 非贴住态（文档流中）永远可见，避免留空洞
    if (e.clientY >= 0 && e.clientY < 96) {
      barVisible.value = true
      return
    }
    if (!stuck.value) {
      barVisible.value = true
      return
    }
    if (!expanded.value && !tierOpen.value && !searchFocus.value && !coarse.value && !suggestOpen.value) {
      barVisible.value = false
    }
  }

  let scrollTick = false
  // P1：层级节点列表缓存（querySelectorAll 每帧调用省掉；渐进挂载补层时长度变化即失效重建；
  // getBoundingClientRect 保留逐帧——spy 的 vh*0.5 判定语义依赖实时矩形，不可缓存）
  let tierEls: HTMLElement[] = []
  function onScroll() {
    requestFrame()
  }
  function requestFrame() {
    if (scrollTick) return
    scrollTick = true
    requestAnimationFrame(() => {
      scrollTick = false
      const y = window.scrollY
      const dy = y - lastY
      lastY = y
      const inHot = hotY >= 0 && hotY < 96
      if (!stuck.value || y < 80 || coarse.value || expanded.value || tierOpen.value || searchFocus.value || suggestOpen.value || inHot) {
        barVisible.value = true
      } else if (dy < -10) {
        barVisible.value = true
      } else if (dy > 10) {
        barVisible.value = false
      }
      const top = barRef.value?.getBoundingClientRect().top ?? 0
      const isStuck = top <= 12
      if (isStuck && !stuck.value) { expanded.value = false; tierOpen.value = false }
      stuck.value = isStuck
      const vh = window.innerHeight
      let best = ''
      const nodes = document.querySelectorAll('.iceberg-tier')
      if (nodes.length !== tierEls.length) tierEls = Array.from(nodes) as HTMLElement[]
      for (const el of tierEls) {
        const r = el.getBoundingClientRect()
        if (r.top < vh * 0.5 && r.bottom > 0) best = el.dataset.tier || ''
      }
      curTier.value = best || tierOrder[tierOrder.length - 1] || ''
      // 顶部判定：无命中且首层仍在视口下方 = 还在 masthead 区（底部无命中时回退末层不变）
      const firstTop = tierEls.length ? tierEls[0].getBoundingClientRect().top : 0
      atTop.value = best === '' && firstTop > 0
      const docH = document.documentElement.scrollHeight - vh
      // P2：进度条移出响应式（模板 :style 每帧全量重渲染）→ rAF 直写 DOM
      const p = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0
      if (progressEl.value) progressEl.value.style.transform = `scaleX(${p})`
    })
  }

  function togglePanel(source: 'fab' | 'bar' = 'bar') {
    if (expanded.value) { expanded.value = false; return }
    if (source === 'fab' && closedFromOutside) { closedFromOutside = false; return }
    if (source === 'bar') closedFromOutside = false
    expanded.value = true
  }

  function scrollToTier(name: string) {
    tierOpen.value = false
    // 目标层可能尚未挂载（渐进挂载窗口约 6 帧；点击本身的 pointerdown 已触发全局
    // flush 安全网）：逐帧重试，避免静默无反馈
    const sel = `.iceberg-tier[data-tier="${CSS.escape(name)}"]`
    let tries = 6
    const go = () => {
      const el = document.querySelector(sel)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }
      if (tries-- > 0) requestAnimationFrame(go)
    }
    go()
  }

  function onDocDown(e: MouseEvent) {
    // flag 只在真正关掉面板的那一次 mousedown 立起，其余一律清掉——
    // 否则陈旧 flag 会吞掉用户下一次明确的打开意图（如栏外连点后点 FAB）
    let closed = false
    if (barRef.value && !barRef.value.contains(e.target as Node)) {
      tierOpen.value = false
      suggestOpen.value = false
      if (expanded.value) {
        expanded.value = false
        closed = true
      }
    }
    closedFromOutside = closed
  }

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('mousedown', onDocDown)
    if (typeof window.matchMedia === 'function') coarse.value = window.matchMedia('(hover: none)').matches
    onScroll()
  })
  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mousedown', onDocDown)
  })

  return {
    expanded, searchFocus, coarse, barVisible, stuck, curTier, atTop, tierOpen,
    barRef, progressEl, togglePanel, scrollToTier,
  }
}
