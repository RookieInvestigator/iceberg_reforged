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
// 滚动自适应帧率：滚动中液态降到 30fps（GPU 优先合成页面 repaint，缓解滚动卡顿），
// 停止滚动 200ms 后恢复 60fps（静止时满帧流畅）
const liquidFps = ref(60)
let scrollTick = 0
let scrollStopTimer = 0
function onScroll() {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    scrollDepth.value = max > 0 ? Math.min(window.scrollY / max, 1) : 0
    if (liquidFps.value !== 30) liquidFps.value = 30
    if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
    scrollStopTimer = window.setTimeout(() => { liquidFps.value = 60 }, 200)
  })
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
})
onActivated(() => {
  onScroll()
  rerollSeed()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  if (scrollTick) cancelAnimationFrame(scrollTick)
  if (scrollStopTimer) window.clearTimeout(scrollStopTimer)
})
</script>

<template>
  <div class="liquid-bg" aria-hidden="true">
    <!-- colorA 传纯黑：沉海终点为纯黑（色板最深端由深蓝黑 #001220 改为 #000000）
         湍流 7 档保留全部形变；fps 由滚动自适应控制（静止 60 / 滚动 30） -->
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
