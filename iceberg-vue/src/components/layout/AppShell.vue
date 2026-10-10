<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import router from '../../router'
import BulletinBanner from './BulletinBanner.vue'
import BulletinModal from '../modals/BulletinModal.vue'
import {
  dismissBulletinBanner,
  loadBulletins,
  pendingBulletin,
  readBulletinState,
  shouldShowBanner,
} from '../../lib/bulletins'

// 首帧加载页（#app-shield）生命周期。
// 视觉样式全部内联在 index.html（首帧无 JS 也能渲染），这里只负责「何时显示/隐藏」：
//   - 路由 path 变化：beforeEach 露出遮罩，afterEach 设置 2500ms 兜底；
//   - App.vue 的 transition after-enter 派发 `route-ready` 后淡出（新页面已进入）；
//   - 页面挂载后的 `vue-ready` 事件作为首帧二次确认（幂等，重复触发无害）。
const SHIELD_FALLBACK_DELAY = 2500
const SHIELD_FADE_OUT_DELAY = 140

let shieldTimer = 0
let shieldHidden = false

// ── 公告 ──────────────────────────────────────────────────────
// 两条可见路径，判定与状态全在 lib/bulletins.ts：
//   ① 顶部条幅（BulletinBanner，全站）：显示最新一条，只有用户手动关闭才让位 ——
//      「已读」不隐藏条幅；
//   ② 最新一条既未读也未被关闭时，进站自动弹一次公告板（每份公告只弹一次）。
// 「已读」指针由 BulletinModal 打开时前移（自动弹窗与手动打开同一条路径，不会漏记）。
const bulletins = loadBulletins()
const bulletinState = readBulletinState()
const bannerBulletin = ref(shouldShowBanner(bulletins, bulletinState) ? bulletins[0] : null)
const showBulletin = ref(false)

// 条幅高度 → CSS 变量 --bulletin-offset（供 bg.css 的静态背景层向上顶出，消除顶端硬边）。
// 不写死 58px：移动端断点、env(safe-area-inset-top) 都会改变高度，实测最稳。
const bannerEl = ref<HTMLElement | null>(null)
let bannerRo: ResizeObserver | null = null

function syncBulletinOffset() {
  const root = document.documentElement
  const h = bannerEl.value?.offsetHeight || 0
  if (h > 0) root.style.setProperty('--bulletin-offset', `${h}px`)
  else root.style.removeProperty('--bulletin-offset')
}

function onBulletinDismiss() {
  const id = bannerBulletin.value?.id
  if (id) dismissBulletinBanner(id)
  bannerBulletin.value = null
  void nextTick(syncBulletinOffset)
}

// 自动弹窗时机：等首帧加载页真正让位之后再弹 —— 遮罩 z-index 高于弹窗，提前弹会被盖住，
// 用户只会看到遮罩消失后凭空出现一个弹窗。故由 hideShield 成功后触发，只触发一次。
const BULLETIN_AUTO_DELAY = 350
let bulletinPopupScheduled = false
let bulletinTimer = 0

function scheduleBulletinPopup() {
  if (bulletinPopupScheduled) return
  bulletinPopupScheduled = true
  // 定向深链（?item= / #hash）自身会打开词条弹窗，不要再叠一层公告
  if (/[?&]item=/.test(window.location.search) || !!window.location.hash) return
  if (!pendingBulletin(bulletins, bulletinState)) return
  bulletinTimer = window.setTimeout(() => {
    if (!showBulletin.value) showBulletin.value = true
  }, BULLETIN_AUTO_DELAY)
}

function getShield(): HTMLElement | null {
  return document.getElementById('app-shield')
}

function hideShield(delay = 0) {
  window.clearTimeout(shieldTimer)
  shieldTimer = window.setTimeout(() => {
    if (shieldHidden) return
    shieldHidden = true
    getShield()?.classList.add('hidden')
    scheduleBulletinPopup()
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

// 路由切换时由 App.vue 的 transition after-enter 派发，确保新页面已经进入后再隐藏遮罩
function onRouteReady() {
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
  // 路由确认后不立即隐藏：等 App.vue 的 transition after-enter 派发 route-ready；
  // 这里先设置兜底，避免异常情况下遮罩永久显示。
  hideShield(SHIELD_FALLBACK_DELAY)
})

onMounted(() => {
  window.scrollTo(0, 0)
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  hideShield(SHIELD_FALLBACK_DELAY)
  document.addEventListener('vue-ready', onVueReady)
  document.addEventListener('route-ready', onRouteReady)
  window.addEventListener('pageshow', onPageshow)

  syncBulletinOffset()
  if (typeof ResizeObserver !== 'undefined') {
    bannerRo = new ResizeObserver(syncBulletinOffset)
    if (bannerEl.value) bannerRo.observe(bannerEl.value)
  }
})

onUnmounted(() => {
  document.removeEventListener('vue-ready', onVueReady)
  document.removeEventListener('route-ready', onRouteReady)
  window.removeEventListener('pageshow', onPageshow)
  window.clearTimeout(shieldTimer)
  window.clearTimeout(bulletinTimer)
  bannerRo?.disconnect()
  bannerRo = null
  document.documentElement.style.removeProperty('--bulletin-offset')
})
</script>

<template>
  <!-- 顶部公告条：全站可见（含所有路由），关闭状态按公告 id 记忆。
       外层 div 只为量高度（--bulletin-offset），组件根元素不接受模板 ref -->
  <div v-if="bannerBulletin" ref="bannerEl" class="bulletin-slot">
    <BulletinBanner
      :bulletin="bannerBulletin"
      @open="showBulletin = true"
      @dismiss="onBulletinDismiss"
    />
  </div>
  <slot />

  <!-- 公告板：页脚 / 条幅 / 进站自动弹窗共用同一实例入口 -->
  <BulletinModal v-if="showBulletin" :bulletins="bulletins" @close="showBulletin = false" />
</template>

<style>
/* 加载页布局/视觉由 index.html 内联样式负责，这里只保留淡出过渡（避免双份样式漂移） */
.app-shield { transition: opacity 0.55s ease-out; }
.app-shield.hidden { opacity: 0; pointer-events: none; }
</style>
