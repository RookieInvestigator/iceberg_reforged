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
let scrollTick = 0
function onScroll() {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    scrollDepth.value = max > 0 ? Math.min(window.scrollY / max, 1) : 0
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
})
</script>

<template>
  <div class="liquid-bg" aria-hidden="true">
    <!-- colorA 传纯黑：沉海终点为纯黑（色板最深端由深蓝黑 #001220 改为 #000000） -->
    <LiquidGradient :darkShift="liquidShift" colorA="#000000" :seed="liquidSeed" />
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
