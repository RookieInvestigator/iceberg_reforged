<script setup lang="ts">
/**
 * LiquidBg —— 冰山图「液态」背景模式（bgMode === 'liquid'）。
 * 独立组件承载 WebGL 液态渐变 + 滚动沉海（darkShift）。
 * 根元素 position: fixed 铺满视口：canvas 尺寸恒为视口 × dpr，
 * 避免挂在随文档高度拉伸的容器里导致 WebGL canvas 尺寸超限（冰山图页面很长）。
 */
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue'
import LiquidGradient from './LiquidGradient.vue'

// 滚动沉海：色板采样向深色端平移（darkShift），黑色占比随滚动增大
const scrollDepth = ref(0)
// ═══ 交互感知帧率（治 hover/tooltip 卡顿）═══
// 全屏 shader 静止 60fps 会与词条墙的 hover 记号笔/tooltip 抢合成（历史 24fps 设计意图
// 曾因重构回退为 60fps）。三档：滚动 30（沉海跟随）/ 鼠标停在词条墙 12（近静止，
// 湍流细节保留、视觉几乎无感；把合成器让给交互）/ 静止 24（慢流速，肉眼与 60 无差）。
const SCROLL_FPS = 30
const HOVER_WALL_FPS = 12
const IDLE_FPS = 24
const liquidFps = ref(IDLE_FPS)
let scrolling = false
let wallHover = false
let scrollTick = 0
let scrollStopTimer = 0
let hoverStopTimer = 0
function refreshFps() {
  liquidFps.value = scrolling ? SCROLL_FPS : wallHover ? HOVER_WALL_FPS : IDLE_FPS
}
function onScroll() {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    scrollDepth.value = max > 0 ? Math.min(window.scrollY / max, 1) : 0
    if (!scrolling) scrolling = true
    if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(() => { scrolling = false; refreshFps() }, 200)
    refreshFps()
  })
}
// 词条墙 hover 区：pointerover 委托判定（passive），进入/离开切换帧率档
function onWallPointer(e: Event) {
  const inWall = !!(e.target as HTMLElement | null)?.closest?.('#items-container')
  if (inWall !== wallHover) {
    wallHover = inWall
    if (hoverStopTimer) window.clearTimeout(hoverStopTimer)
    // 离开词条墙后 150ms 才恢复，避免在词条间隙微动时来回跳档
    if (!inWall) hoverStopTimer = window.setTimeout(() => refreshFps(), 150)
    else refreshFps()
  }
}
// 线性到 1.0：视觉全黑阈值（此前 1.3/1.8 过早全黑），滚到底时画面全部落入纯黑
const liquidShift = computed(() => scrollDepth.value * 1.0)

// 液态种子：每次进入页面（含 keep-alive 切回）重新随机（0-1000），图案不重复
const liquidSeed = ref(Math.floor(Math.random() * 1001))
function rerollSeed() {
  liquidSeed.value = Math.floor(Math.random() * 1001)
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('pointerover', onWallPointer, { passive: true })
})
onActivated(() => {
  onScroll()
  rerollSeed()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerover', onWallPointer)
  if (scrollTick) cancelAnimationFrame(scrollTick)
  if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
  if (hoverStopTimer) window.clearTimeout(hoverStopTimer)
})
</script>

<template>
  <div class="liquid-bg" aria-hidden="true">
    <!-- colorA 传纯黑：沉海终点为纯黑（色板最深端由深蓝黑 #001220 改为 #000000）
         湍流 7 档保留全部形变；fps 三档交互自适应（滚动 30 / 词条墙 hover 12 / 静止 24） -->
    <LiquidGradient :darkShift="liquidShift" colorA="#000000" :seed="liquidSeed" :turb-iter="7" :fps="liquidFps" />
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
