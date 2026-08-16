<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { normalizeData } from '../lib/data'
import { Iceberg3DEngine, type FocusState } from '../lib/iceberg3d/engine'
import { useI18n } from '../lib/useI18n'
import raw from '../data/iceberg.json'

const { t } = useI18n()
const data = normalizeData(raw)

const route = useRoute()
const router = useRouter()
const QUERY_KEY = 'item'

const containerRef = ref<HTMLDivElement>()
const isLoading = ref(true)
const webglUnavailable = ref(false)
const selectedEntry = ref<FocusState | null>(null)
let engine: Iceberg3DEngine | null = null

/** 聚焦状态 → URL query 同步（llm-wiki 深链思路：可分享、可回退） */
function syncUrl(focus: FocusState | null) {
  if (!engine) return
  const query = { ...route.query }
  const id = focus?.item.id
  if (id) query[QUERY_KEY] = id
  else delete query[QUERY_KEY]
  router.replace({ query }).catch(() => {})
}

// URL 深链响应（前进/后退、手动编辑 URL）：query 与引擎聚焦态不同步时才动作，避免循环
watch(
  () => route.query[QUERY_KEY],
  (item) => {
    if (!engine) return
    const target = typeof item === 'string' ? item : null
    if (target !== engine.focusedId) engine.focusById(target)
  },
)

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  if (!Iceberg3DEngine.supportsWebGL2()) {
    webglUnavailable.value = true
    isLoading.value = false
    return
  }

  engine = new Iceberg3DEngine({
    container,
    data,
    onFocusChange: (focus) => {
      selectedEntry.value = focus
      syncUrl(focus)
    },
    onReady: () => {
      isLoading.value = false
    },
    onError: () => {
      webglUnavailable.value = true
      isLoading.value = false
    },
  })
  engine.init()

  // 初始深链：/3d?item=xxx
  const initial = route.query[QUERY_KEY]
  if (typeof initial === 'string') engine.focusById(initial)
})

onActivated(() => engine?.resume())
onDeactivated(() => engine?.pause())
// perf：切后台自动暂停渲染循环，回前台恢复
function onVisibilityChange() {
  if (document.hidden) engine?.pause()
  else engine?.resume()
}
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div class="iceberg-3d-page">
    <!-- Loading / WebGL unavailable states -->
    <div v-if="isLoading" class="scene-loading">
      <div class="scene-loading-spinner"></div>
      <p>{{ t('loading3d') }}</p>
    </div>
    <div v-else-if="webglUnavailable" class="scene-error">
      <p>{{ t('webglUnsupported') }}</p>
    </div>

    <!-- 流动流体背景：纯 CSS 动画渐变，避免第二个 WebGL 上下文导致卡顿 -->
    <div class="scene-sky" aria-hidden="true">
      <span class="scene-sky-overlay"></span>
    </div>

    <div ref="containerRef" class="canvas-container"></div>

    <!-- 大气光晕：橙色落日辉光 + 深海蓝环境光，叠加在 3D 画面上增加氛围 -->
    <div class="scene-atmosphere" aria-hidden="true"></div>

    <div class="scene-ui" :class="{ 'hidden': !!selectedEntry }">
      <router-link to="/home" class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>{{ t('backToHome') }}</span>
      </router-link>

      <div class="scene-brand" aria-hidden="true">
        <span class="scene-brand-dot"></span>
        <span>{{ t('nav3d') }} · ICEBERG</span>
      </div>
    </div>

    <!-- 右侧信息栏 -->
    <aside class="detail-panel" :class="{ 'open': !!selectedEntry }">
      <transition name="panel-switch" mode="out-in">
        <div class="panel-inner" v-if="selectedEntry" :key="selectedEntry.item.id || selectedEntry.item.title">

          <div class="panel-top">
            <span
              class="cat-badge"
              :style="{ color: '#' + selectedEntry.tierColor.toString(16).padStart(6, '0'), borderColor: '#' + selectedEntry.tierColor.toString(16).padStart(6, '0') }"
            >{{ selectedEntry.item.category }}</span>
            <button class="close-btn" @click="engine?.focusById(null)" :aria-label="t('close')">&times;</button>
          </div>

          <h2 class="panel-title">{{ selectedEntry.item.title }}</h2>

          <div class="panel-tags" v-if="selectedEntry.item.tags?.length">
            <span v-for="t in selectedEntry.item.tags" :key="t">#{{ t }}</span>
          </div>

          <p class="panel-desc">{{ selectedEntry.item.desc || t('noDescription') }}</p>

          <a v-if="selectedEntry.item.link" :href="selectedEntry.item.link" target="_blank" rel="noopener" class="panel-link">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
            {{ t('openLinkShort') }}
          </a>

        </div>
      </transition>
    </aside>
  </div>
</template>

<style scoped>
/* ═══ 3D 冰山：橙-蓝-黑深海主题界面 ═══ */
.iceberg-3d-page {
  position: fixed; inset: 0; background: #000;
  overflow: hidden;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  color: var(--color-text-primary);
}

.scene-sky {
  position: absolute; inset: 0; z-index: 0; overflow: hidden;
  background:
    radial-gradient(38% 32% at 18% 22%, rgba(255, 107, 6, 0.28), transparent 70%),
    radial-gradient(45% 40% at 78% 28%, rgba(10, 90, 153, 0.45), transparent 70%),
    radial-gradient(30% 30% at 55% 82%, rgba(125, 181, 220, 0.22), transparent 70%),
    linear-gradient(180deg, #0a2a4a 0%, #04101c 55%, #000 100%);
  background-size: 180% 180%;
  animation: sky-flow 24s ease-in-out infinite alternate;
}
@keyframes sky-flow {
  0% { background-position: 0% 0%, 100% 0%, 50% 100%, 0 0; }
  100% { background-position: 100% 100%, 0% 100%, 50% 0%, 0 0; }
}
.scene-sky-overlay {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.2) 80%, rgba(0,0,0,0.7) 100%);
}

@media (prefers-reduced-motion: reduce) {
  .scene-sky { animation: none; }
}

.canvas-container {
  position: absolute; inset: 0; z-index: 1;
}

.scene-atmosphere {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  mix-blend-mode: screen;
  background:
    radial-gradient(42% 38% at 18% 12%, rgba(255, 107, 6, 0.16) 0%, transparent 70%),
    radial-gradient(55% 50% at 82% 88%, rgba(10, 90, 153, 0.22) 0%, transparent 70%),
    radial-gradient(30% 28% at 70% 18%, rgba(125, 181, 220, 0.1) 0%, transparent 70%);
}

.scene-loading, .scene-error {
  position: absolute; inset: 0; z-index: 50;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1rem;
  background: rgba(2, 4, 8, 0.82);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.scene-loading p, .scene-error p {
  color: var(--white-45); font-size: var(--font-sm); letter-spacing: 0.04em;
}
.scene-loading-spinner {
  width: 32px; height: 32px;
  border: 2px solid var(--white-10);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.scene-ui {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; justify-content: space-between;
  padding: 1.5rem;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
.scene-ui.hidden { opacity: 0; pointer-events: none; }

.back-btn {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem; border-radius: 999px;
  border: 1px solid var(--white-08);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  color: var(--white-55); text-decoration: none; font-size: var(--font-sm);
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}
.back-btn:hover {
  color: var(--color-accent-soft);
  border-color: var(--white-18);
  background: rgba(0, 0, 0, 0.55);
}

.scene-brand {
  pointer-events: auto;
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem; border-radius: 999px;
  border: 1px solid var(--white-08);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  color: var(--white-40); font-size: var(--font-tiny); letter-spacing: 0.14em;
  text-transform: uppercase;
}
.scene-brand-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 10px rgba(255, 106, 6, 0.7);
}

.detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 20;
  width: 420px; max-width: 90vw;
  background: rgba(5, 8, 14, 0.82);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-left: 1px solid var(--white-06);
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.4);
  transform: translateX(100%);
  transition: transform 0.35s var(--ease-emphatic);
  display: flex; flex-direction: column;
}
.detail-panel.open { transform: translateX(0); }

.panel-inner {
  padding: 2.5rem 2rem; height: 100%;
  box-sizing: border-box; overflow-y: auto;
  display: flex; flex-direction: column;
}

.panel-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 1.5rem;
}

.cat-badge {
  font-size: var(--font-xs); font-weight: 600;
  border: 1px solid; padding: 0.25rem 0.7rem; border-radius: 999px;
  background: rgba(0, 0, 0, 0.2);
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.panel-switch-enter-from .cat-badge,
.panel-switch-leave-to .cat-badge { opacity: 0; transform: translateY(8px); }
.panel-switch-enter-from .cat-badge { transition-delay: 0s; }

.close-btn {
  background: none; border: none; color: var(--white-60); cursor: pointer;
  font-size: 1.4rem; line-height: 1; padding: 0 0 0.2rem 0.5rem;
  border-radius: 999px;
  transition: color 0.15s;
}
.close-btn:hover { color: var(--color-accent-soft); }

.panel-title {
  margin: 0 0 1rem; font-size: 1.25rem; font-weight: 700;
  line-height: 1.35; color: var(--white-92); letter-spacing: 0.01em;
  transition: opacity 0.3s ease 0.04s, transform 0.3s ease 0.04s;
}
.panel-switch-enter-from .panel-title,
.panel-switch-leave-to .panel-title { opacity: 0; transform: translateY(8px); }

.panel-tags {
  display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; margin-bottom: 1.25rem;
  transition: opacity 0.3s ease 0.08s, transform 0.3s ease 0.08s;
}
.panel-tags span { font-size: var(--font-xs); color: var(--white-45); }
.panel-switch-enter-from .panel-tags,
.panel-switch-leave-to .panel-tags { opacity: 0; transform: translateY(8px); }

.panel-desc {
  font-size: var(--font-sm); line-height: 1.7; color: var(--white-60);
  margin: 0; white-space: pre-wrap; flex: 1;
  transition: opacity 0.3s ease 0.12s, transform 0.3s ease 0.12s;
}
.panel-switch-enter-from .panel-desc,
.panel-switch-leave-to .panel-desc { opacity: 0; transform: translateY(8px); }

.panel-link {
  display: inline-flex; align-items: center; gap: 0.5rem;
  margin-top: 1.5rem; padding: 0.5rem 1.25rem;
  border: 1px solid var(--white-18); border-radius: 999px;
  font-size: var(--font-xs); font-weight: 600; color: var(--white-55); text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.3s ease 0.16s, transform 0.3s ease 0.16s;
  align-self: flex-start;
}
.panel-link:hover {
  background: var(--white-08); color: var(--color-accent-soft); border-color: var(--color-accent-soft);
}
.panel-switch-enter-from .panel-link,
.panel-switch-leave-to .panel-link { opacity: 0; transform: translateY(8px); }

.panel-inner::-webkit-scrollbar { width: 4px; }
.panel-inner::-webkit-scrollbar-track { background: transparent; }
.panel-inner::-webkit-scrollbar-thumb { background: var(--white-12); border-radius: 999px; }

/* 面板整体淡入 + 子元素阶梯视差 */
.panel-switch-enter-active, .panel-switch-leave-active {
  transition: opacity 0.2s ease;
}
.panel-switch-enter-from, .panel-switch-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .detail-panel {
    width: 100%; max-width: none; border-left: none; border-top: 1px solid var(--white-06);
    top: auto; height: 70vh; transform: translateY(100%);
  }
  .detail-panel.open { transform: translateY(0); }
  .panel-inner { padding: 1.5rem; }
  .panel-title { font-size: 1.15rem; }
}
</style>
