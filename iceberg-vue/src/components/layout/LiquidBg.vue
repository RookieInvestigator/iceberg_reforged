<script setup lang="ts">
/**
 * LiquidBg —— 冰山图「液态」背景模式（bgMode === 'liquid'）。
 * 独立组件承载 WebGL 液态渐变 + 滚动沉海（darkShift）。
 * 根元素 position: fixed 铺满视口：canvas 尺寸恒为视口 × dpr，
 * 避免挂在随文档高度拉伸的容器里导致 WebGL canvas 尺寸超限（冰山图页面很长）。
 */
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useStore } from '@nanostores/vue'
import { overlayActive } from '../../lib/overlayLock'
import { reducedMotion as osReducedMotion } from '../../lib/motion'
import { reducedMotion as userReducedMotion } from '../../lib/v3/store'
import LiquidGradient from './LiquidGradient.vue'

// 滚动沉海：色板采样向深色端平移（darkShift），黑色占比随滚动增大
const scrollDepth = ref(0)
// ═══ 交互感知帧率（治 hover/tooltip 卡顿）═══
// 全屏 shader 高帧率会与词条墙 hover 记号笔 / 弹窗抢合成器，因此分档：
// 弹窗覆盖 12 / 滚动 30 / 词条墙 hover 24 / 静止 48（URL 参数 ?scrollFps= / ?hoverFps= / ?idleFps= 可覆盖）
const MODAL_FPS = 12
const SCROLL_FPS = 30
const HOVER_WALL_FPS = 24
const IDLE_FPS = 48

function fpsOverride(key: string, fallback: number): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get(key))
    return Number.isFinite(v) && v > 0 ? Math.min(v, 120) : fallback
  } catch {
    return fallback
  }
}

const isOverlay = useStore(overlayActive)
const userReduced = useStore(userReducedMotion)
const isFrozen = computed(() => osReducedMotion.value || userReduced.value)

const liquidFps = ref(IDLE_FPS)
let scrolling = false
let wallHover = false
let wallEl: HTMLElement | null = null
let scrollTick = 0
let scrollStopTimer = 0
let hoverStopTimer = 0

function refreshFps() {
  if (isOverlay.value) {
    liquidFps.value = MODAL_FPS
    return
  }
  const scrollFps = fpsOverride('scrollFps', SCROLL_FPS)
  const hoverFps = fpsOverride('hoverFps', HOVER_WALL_FPS)
  const idleFps = fpsOverride('idleFps', IDLE_FPS)
  liquidFps.value = scrolling ? scrollFps : wallHover ? hoverFps : idleFps
}

watch(isOverlay, refreshFps)

function onScroll() {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    const raw = max > 0 ? Math.min(window.scrollY / max, 1) : 0
    // 量化到 0.002 精度，避免微小滚动像素触发无谓 uniform 重传
    const quantized = Math.round(raw * 500) / 500
    if (scrollDepth.value !== quantized) scrollDepth.value = quantized
    if (!scrolling) {
      scrolling = true
      refreshFps()
    }
    if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(() => { scrolling = false; refreshFps() }, 200)
  })
}

// 词条墙 hover 区：缓存墙根节点并用原生 contains 判定（避免每次微动都 .closest() 遍历祖先链）
function onWallPointer(e: Event) {
  if (!wallEl || !wallEl.isConnected) {
    wallEl = document.getElementById('v3-strata') || document.getElementById('items-container')
  }
  const target = e.target as Node | null
  const inWall = !!(wallEl && target && wallEl.contains(target))
  if (inWall !== wallHover) {
    wallHover = inWall
    if (hoverStopTimer) window.clearTimeout(hoverStopTimer)
    if (!inWall) hoverStopTimer = window.setTimeout(() => refreshFps(), 150)
    else refreshFps()
  }
}

// 线性到 1.0：滚到底时画面全部落入纯黑
const liquidShift = computed(() => scrollDepth.value * 1.0)

// 液态种子：每次进入页面（含 keep-alive 切回）重新随机（0-1000），图案不重复
const liquidSeed = ref(Math.floor(Math.random() * 1001))
function rerollSeed() {
  liquidSeed.value = Math.floor(Math.random() * 1001)
}

useEventListener(window, 'scroll', onScroll, { passive: true })
useEventListener(document, 'pointerover', onWallPointer, { passive: true })

onMounted(() => {
  onScroll()
  refreshFps()
})
onActivated(() => {
  wallEl = null
  onScroll()
  rerollSeed()
  refreshFps()
})
onUnmounted(() => {
  if (scrollTick) cancelAnimationFrame(scrollTick)
  if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
  if (hoverStopTimer) window.clearTimeout(hoverStopTimer)
  wallEl = null
})
</script>

<template>
  <div class="liquid-bg" aria-hidden="true">
    <!-- colorA 传纯黑：沉海终点为纯黑（色板最深端 #000000）
         湍流 7 档保留全部形变；fps 交互与遮罩自适应降帧，reduced-motion 下冻结为空转零开销 -->
    <LiquidGradient :darkShift="liquidShift" colorA="#000000" :seed="liquidSeed" :turb-iter="7" :fps="liquidFps" :frozen="isFrozen" />
  </div>
</template>

<style scoped>
.liquid-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
</style>
