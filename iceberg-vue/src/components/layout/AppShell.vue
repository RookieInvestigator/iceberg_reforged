<script setup lang="ts">
import { nextTick, onMounted, onUnmounted } from 'vue'
import router from '../../router'

// 首帧加载页（#app-shield）生命周期。
// 视觉样式全部内联在 index.html（首帧无 JS 也能渲染），这里只负责「何时显示/隐藏」：
//   - 路由 path 变化：beforeEach 露出遮罩，afterEach + nextTick 后淡出；
//   - 页面挂载后的 `vue-ready` 事件作为二次确认（幂等，重复触发无害）；
//   - 2500ms 兜底：任何异常情况下都不会把用户永久挡在加载页。
const SHIELD_FALLBACK_DELAY = 2500
const SHIELD_FADE_OUT_DELAY = 140

let shieldTimer = 0
let shieldHidden = false

function getShield(): HTMLElement | null {
  return document.getElementById('app-shield')
}

function hideShield(delay = 0) {
  window.clearTimeout(shieldTimer)
  shieldTimer = window.setTimeout(() => {
    if (shieldHidden) return
    shieldHidden = true
    getShield()?.classList.add('hidden')
  }, delay)
}

function showShield() {
  // 取消上一次尚未触发的淡出定时器：快速连续切换路由时以最新一次渲染完成为准
  window.clearTimeout(shieldTimer)
  if (!shieldHidden) return
  shieldHidden = false
  getShield()?.classList.remove('hidden')
}

function onVueReady() {
  hideShield(SHIELD_FADE_OUT_DELAY)
}

function onPageshow(event: PageTransitionEvent) {
  // bfcache 恢复：页面已有完整快照，直接淡出遮罩
  if (event.persisted) hideShield(SHIELD_FADE_OUT_DELAY)
}

// 只记录 path：query/hash 变化（如 ?item= / #id 打开词条）不触发加载页
let lastPath = ''
router.beforeEach((to) => {
  if (lastPath && to.path !== lastPath) showShield()
  lastPath = to.path
  return true
})

router.afterEach(() => {
  // 路由确认 → 组件完成本轮渲染后淡出；兜底时间由 hideShield 内部 clearTimeout 覆盖
  nextTick(() => hideShield(SHIELD_FADE_OUT_DELAY))
})

onMounted(() => {
  window.scrollTo(0, 0)
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  hideShield(SHIELD_FALLBACK_DELAY)
  document.addEventListener('vue-ready', onVueReady)
  window.addEventListener('pageshow', onPageshow)
})

onUnmounted(() => {
  document.removeEventListener('vue-ready', onVueReady)
  window.removeEventListener('pageshow', onPageshow)
  window.clearTimeout(shieldTimer)
})
</script>

<template>
  <slot />
</template>

<style>
/* 加载页布局/视觉由 index.html 内联样式负责，这里只保留淡出过渡（避免双份样式漂移） */
.app-shield { transition: opacity 0.55s ease-out; }
.app-shield.hidden { opacity: 0; pointer-events: none; }
</style>
