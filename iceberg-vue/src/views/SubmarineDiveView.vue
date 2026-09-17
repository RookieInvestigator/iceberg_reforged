<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { normalizeData } from '../lib/data'
import { DiveEngine, type DiveEntry, type DiveFocus, type DiveHud } from '../lib/iceberg3d/diveEngine'
import { useI18n } from '../lib/useI18n'
import raw from '../data/iceberg.json'

const { t } = useI18n()
const data = normalizeData(raw)

const route = useRoute()
const router = useRouter()
const QUERY_KEY = 'item'

const entries: DiveEntry[] = data.tierOrder.flatMap((tierName, tierIndex) =>
  (data.tiers[tierName] || []).map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    categoryColor: (it as { categoryColor?: string }).categoryColor
      ?? data.categoryColors[it.category] ?? '#ffffff',
    tags: it.tags || [],
    desc: it.desc || '',
    link: it.link,
    tierIndex,
  })),
)

const containerRef = ref<HTMLDivElement>()
const isLoading = ref(true)
const webglUnavailable = ref(false)
const selectedEntry = ref<DiveFocus | null>(null)
const hud = ref<DiveHud>({ depthM: 0, tierIndex: 0, speedKn: 0, sonarTitle: null, sonarDistM: null })
const isTouch = ref(false)
let engine: DiveEngine | null = null

const tierName = computed(() => data.tierOrder[hud.value.tierIndex] || '')
const reducedMotion = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 聚焦状态 → URL query 同步（与 /3d 同模式：可分享、可回退） */
function syncUrl(focus: DiveFocus | null) {
  if (!engine) return
  const query = { ...route.query }
  const id = focus?.item.id
  if (id) query[QUERY_KEY] = id
  else delete query[QUERY_KEY]
  router.replace({ query }).catch(() => {})
}

watch(
  () => route.query[QUERY_KEY],
  (item) => {
    if (!engine) return
    const target = typeof item === 'string' ? item : null
    if (target !== engine.focusedId) engine.focusById(target)
  },
)

// ── 键盘操控 ──
const keys = new Set<string>()
function applyKeys() {
  if (!engine) return
  const down = (c: string) => keys.has(c)
  engine.input.thrust = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0)
  engine.input.yaw = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0)
  engine.input.vertical = (down('Space') ? 1 : 0) - (down('ShiftLeft') || down('ShiftRight') ? 1 : 0)
}
function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') e.preventDefault()
  if (e.key === 'Enter') {
    if (engine?.openSonar()) return
  }
  if (e.key === 'Escape') {
    engine?.focusById(null)
    return
  }
  keys.add(e.code)
  applyKeys()
}
function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code)
  applyKeys()
}
function onBlur() {
  keys.clear()
  engine?.clearInput()
}

// ── 触屏：左摇杆（转向+推进）+ 右侧升降键 ──
const stickRef = ref<HTMLDivElement>()
const stickKnob = ref<HTMLDivElement>()
let stickId: number | null = null
function stickVec(e: PointerEvent) {
  const zone = stickRef.value
  if (!zone) return { x: 0, y: 0 }
  const r = zone.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const dx = (e.clientX - cx) / (r.width / 2)
  const dy = (e.clientY - cy) / (r.height / 2)
  const len = Math.hypot(dx, dy) || 1
  const cl = Math.min(1, len)
  return { x: (dx / len) * cl, y: (dy / len) * cl }
}
function onStickDown(e: PointerEvent) {
  stickId = e.pointerId
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  onStickMove(e)
}
function onStickMove(e: PointerEvent) {
  if (e.pointerId !== stickId || !engine) return
  const v = stickVec(e)
  engine.input.yaw = v.x
  engine.input.thrust = -v.y
  if (stickKnob.value) stickKnob.value.style.transform = `translate(${v.x * 32}px, ${v.y * 32}px)`
}
function onStickUp(e: PointerEvent) {
  if (e.pointerId !== stickId || !engine) return
  stickId = null
  engine.input.yaw = 0
  engine.input.thrust = 0
  if (stickKnob.value) stickKnob.value.style.transform = ''
}
function setVertical(v: number, on: boolean) {
  if (!engine) return
  const cur = engine.input.vertical
  engine.input.vertical = on ? v : (cur === v ? 0 : cur)
}

onMounted(() => {
  isTouch.value = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none)').matches

  const container = containerRef.value
  if (!container) return

  if (!DiveEngine.supportsWebGL2()) {
    webglUnavailable.value = true
    isLoading.value = false
    return
  }

  engine = new DiveEngine({
    container,
    entries,
    reducedMotion,
    onFocusChange: (focus) => {
      selectedEntry.value = focus
      syncUrl(focus)
    },
    onHud: (h) => { hud.value = h },
    onReady: () => { isLoading.value = false },
    onError: () => {
      webglUnavailable.value = true
      isLoading.value = false
    },
  })
  engine.init()

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibilityChange)

  const initial = route.query[QUERY_KEY]
  if (typeof initial === 'string') engine.focusById(initial)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  engine?.dispose()
  engine = null
})

// 后台自动暂停（与 /3d 同模式），onUnmounted 兜底释放
function onVisibilityChange() {
  if (document.hidden) engine?.pause()
  else engine?.resume()
}
</script>

<template>
  <div class="dive-page">
    <div v-if="isLoading" class="scene-loading">
      <div class="scene-loading-spinner"></div>
      <p>{{ t('loading3d') }}</p>
    </div>
    <div v-else-if="webglUnavailable" class="scene-error">
      <p>{{ t('webglUnsupported') }}</p>
    </div>

    <div ref="containerRef" class="canvas-container"></div>
    <div class="scene-vignette" aria-hidden="true"></div>

    <!-- HUD：深度 / 层级 / 航速 / 声呐 -->
    <div class="dive-hud">
        <router-link to="/home" class="back-btn">
          <ArrowLeft :size="16" :stroke-width="2" />
          <span>{{ t('backToHome') }}</span>
        </router-link>
      <div class="hud-right">
        <span class="hud-chip">{{ hud.depthM }} m</span>
        <span class="hud-chip">{{ tierName }}</span>
        <span class="hud-chip">{{ hud.speedKn }} kn</span>
      </div>
    </div>
    <div class="dive-sonar">
      <span class="sonar-dot" aria-hidden="true"></span>
      <span v-if="hud.sonarTitle">{{ hud.sonarTitle }} · {{ hud.sonarDistM }} m</span>
      <span v-else>{{ t('diveNoSonar') }}</span>
    </div>
    <p class="dive-hint">{{ t('diveHint') }}</p>

    <!-- 触屏操控 -->
    <div v-if="isTouch" class="touch-ui">
      <div ref="stickRef" class="stick" @pointerdown="onStickDown" @pointermove="onStickMove" @pointerup="onStickUp" @pointercancel="onStickUp">
        <div ref="stickKnob" class="stick-knob"></div>
      </div>
      <div class="depth-btns">
        <button type="button" aria-label="up" @pointerdown="setVertical(1, true)" @pointerup="setVertical(1, false)" @pointerleave="setVertical(1, false)">▲</button>
        <button type="button" aria-label="down" @pointerdown="setVertical(-1, true)" @pointerup="setVertical(-1, false)" @pointerleave="setVertical(-1, false)">▼</button>
      </div>
    </div>

    <!-- 词条面板 -->
    <aside class="detail-panel" :class="{ 'open': !!selectedEntry }">
      <transition name="panel-switch" mode="out-in">
        <div class="panel-inner" v-if="selectedEntry" :key="selectedEntry.item.id">
          <div class="panel-top">
            <span
              class="cat-badge"
              :style="{ color: selectedEntry.item.categoryColor, borderColor: selectedEntry.item.categoryColor }"
            >{{ selectedEntry.item.category }}</span>
            <button class="close-btn" @click="engine?.focusById(null)" :aria-label="t('close')">&times;</button>
          </div>
          <h2 class="panel-title">{{ selectedEntry.item.title }}</h2>
          <div class="panel-tags" v-if="selectedEntry.item.tags?.length">
            <span v-for="tag in selectedEntry.item.tags" :key="tag">#{{ tag }}</span>
          </div>
          <p class="panel-desc">{{ selectedEntry.item.desc || t('noDescription') }}</p>
          <a v-if="selectedEntry.item.link" :href="selectedEntry.item.link" target="_blank" rel="noopener" class="panel-link">
            {{ t('openLinkShort') }}
          </a>
        </div>
      </transition>
    </aside>
  </div>
</template>

<style scoped>
.dive-page {
  position: fixed; inset: 0; background: #010304;
  overflow: hidden;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  color: var(--color-text-primary);
}
.canvas-container { position: absolute; inset: 0; z-index: 1; }
.canvas-container canvas { display: block; }
.scene-vignette {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}
.scene-loading, .scene-error {
  position: absolute; inset: 0; z-index: 50;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1rem; background: rgba(1, 4, 7, 0.85);
}
.scene-loading p, .scene-error p { color: var(--white-45); font-size: var(--font-sm); }
.scene-loading-spinner {
  width: 32px; height: 32px; border: 2px solid var(--white-10);
  border-top-color: var(--color-accent); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.dive-hud {
  position: absolute; top: 0; left: 0; right: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 1.25rem; pointer-events: none;
}
.back-btn {
  pointer-events: auto; display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1rem; border-radius: 999px;
  border: 1px solid var(--white-08); background: rgba(0, 8, 14, 0.5);
  color: var(--white-55); text-decoration: none; font-size: var(--font-sm);
}
.back-btn:hover { color: var(--color-accent-soft); border-color: var(--white-18); }
.hud-right { display: flex; gap: 0.5rem; }
.hud-chip {
  padding: 0.45rem 0.8rem; border-radius: 999px; font-size: var(--font-tiny);
  letter-spacing: 0.08em; color: var(--white-70);
  border: 1px solid var(--white-08); background: rgba(0, 8, 14, 0.5);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.dive-sonar {
  position: absolute; left: 1.25rem; bottom: 1.25rem; z-index: 10;
  display: flex; align-items: center; gap: 0.5rem;
  max-width: min(420px, 70vw); padding: 0.5rem 0.9rem; border-radius: 999px;
  border: 1px solid var(--white-08); background: rgba(0, 8, 14, 0.5);
  font-size: var(--font-xs); color: var(--white-60);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sonar-dot {
  flex: none; width: 7px; height: 7px; border-radius: 50%;
  background: #7fe0c3; box-shadow: 0 0 8px rgba(127, 224, 195, 0.8);
  animation: sonar-blink 2.2s ease-in-out infinite;
}
@keyframes sonar-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.dive-hint {
  position: absolute; right: 1.25rem; bottom: 1.25rem; z-index: 10; margin: 0;
  max-width: 300px; text-align: right;
  font-size: var(--font-tiny); line-height: 1.7; color: var(--white-30);
}
@media (max-width: 640px) {
  .dive-hint { display: none; }
  .dive-sonar { bottom: auto; top: 4.5rem; }
}

.touch-ui { position: absolute; inset: auto 0 0 0; z-index: 11; pointer-events: none; }
.stick {
  position: absolute; left: 1.5rem; bottom: 5rem; width: 110px; height: 110px;
  border-radius: 50%; border: 1px solid var(--white-18);
  background: rgba(0, 10, 18, 0.4); pointer-events: auto; touch-action: none;
}
.stick-knob {
  position: absolute; left: 50%; top: 50%; width: 44px; height: 44px;
  margin: -22px 0 0 -22px; border-radius: 50%;
  background: rgba(127, 224, 195, 0.25); border: 1px solid rgba(127, 224, 195, 0.6);
}
.depth-btns { position: absolute; right: 1.5rem; bottom: 5rem; display: flex; flex-direction: column; gap: 0.6rem; }
.depth-btns button {
  width: 52px; height: 52px; border-radius: 50%;
  border: 1px solid var(--white-18); background: rgba(0, 10, 18, 0.4);
  color: var(--white-70); font-size: 1rem; pointer-events: auto; touch-action: none;
}

.detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 20;
  width: 420px; max-width: 92vw;
  background: rgba(3, 10, 16, 0.86);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-left: 1px solid var(--white-06);
  transform: translateX(100%);
  transition: transform 0.35s var(--ease-emphatic);
  display: flex; flex-direction: column;
}
.detail-panel.open { transform: translateX(0); }
.panel-inner { padding: 2.5rem 2rem; height: 100%; box-sizing: border-box; overflow-y: auto; }
.panel-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; }
.cat-badge {
  font-size: var(--font-xs); font-weight: 700;
  border: 1px solid; padding: 0.25rem 0.7rem; border-radius: 999px;
  background: rgba(0, 0, 0, 0.2);
}
.close-btn {
  background: none; border: none; color: var(--white-60); cursor: pointer;
  font-size: 1.4rem; line-height: 1; padding: 0 0 0.2rem 0.5rem;
}
.close-btn:hover { color: var(--color-accent-soft); }
.panel-title { margin: 0 0 1rem; font-size: 1.25rem; font-weight: 700; line-height: 1.35; color: var(--white-92); }
.panel-tags { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; margin-bottom: 1.25rem; }
.panel-tags span { font-size: var(--font-xs); color: var(--white-45); }
.panel-desc { font-size: var(--font-sm); line-height: 1.7; color: var(--white-60); margin: 0; white-space: pre-wrap; flex: 1; }
.panel-link {
  display: inline-flex; align-items: center; gap: 0.5rem; align-self: flex-start;
  margin-top: 1.5rem; padding: 0.5rem 1.25rem;
  border: 1px solid var(--white-18); border-radius: 999px;
  font-size: var(--font-xs); font-weight: 700; color: var(--white-55); text-decoration: none;
}
.panel-link:hover { background: var(--white-08); color: var(--color-accent-soft); border-color: var(--color-accent-soft); }
.panel-switch-enter-active, .panel-switch-leave-active { transition: opacity 0.2s ease; }
.panel-switch-enter-from, .panel-switch-leave-to { opacity: 0; }
@media (max-width: 640px) {
  .detail-panel { width: 100%; top: auto; height: 62vh; transform: translateY(100%); border-left: none; border-top: 1px solid var(--white-06); }
  .detail-panel.open { transform: translateY(0); }
  .panel-inner { padding: 1.5rem; }
}
@media (prefers-reduced-motion: reduce) {
  .sonar-dot, .scene-loading-spinner { animation: none; }
}
</style>
