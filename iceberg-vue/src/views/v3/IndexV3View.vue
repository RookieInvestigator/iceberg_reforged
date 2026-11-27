<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { useStore } from '@nanostores/vue'

import { formatUnixDate } from '../../lib/data'
import { useI18n } from '../../lib/useI18n'
import { FILTER_VISIBLE_KEY } from '../../lib/injectionKeys'
import { TRAIL_KEY } from '../../lib/iceberg/v2/keys'
import { resolvePresenter, type EntryView } from '../../lib/iceberg/entryView'
import { pickLinks } from '../../lib/iceberg/entryLinks'
import { decodeTrail, encodeTrail, useTrail } from '../../lib/iceberg/useTrail'
import { resolveV3Id, useV3Data } from '../../lib/v3/dataSource'
import { useV3Search } from '../../lib/v3/search'
import { useV3Filter } from '../../lib/v3/filter'
import { createV3EntryViewFactory, createV3TooltipView, pickRandom } from '../../lib/v3/entryView'
import { applyV3UrlState, snapshotV3UrlState, writeV3UrlParams } from '../../lib/v3/urlState'
import { V3_CTX_KEY, type V3Context } from '../../lib/v3/keys'
import {
  fontSize, floatMode, detailMode, filterMode, immersiveMode, bgMode,
  scatterMode, showTrail, FONT_SCALE_MAP, v3Density, v3Align,
  colorblindMode, showFavMark, showEntryTags, reducedMotion,
  searchQuery, activeCategories, activeTags,
  hiddenCategories, hiddenTags, specialFilter, favFilter,
  tagFilterMode, searchMode, searchFuzzyMode, sortMode,
  resetFilters, markRead,
} from '../../lib/v3/store'

import IcebergBg from '../../components/layout/IcebergBg.vue'
import V3Masthead from '../../components/v3/V3Masthead.vue'
import V3CommandBar from '../../components/v3/V3CommandBar.vue'
import V3Wall from '../../components/v3/V3Wall.vue'
import V3HoverCard from '../../components/v3/V3HoverCard.vue'
import V3EntryDialog from '../../components/v3/V3EntryDialog.vue'
import V3FloatingButtons from '../../components/v3/V3FloatingButtons.vue'
import V3Colophon from '../../components/v3/V3Colophon.vue'
import '../../styles/v3.css'

const OnThisDayModal = defineAsyncComponent(() => import('../../components/calendar/OnThisDayModal.vue'))
const V3Settings = defineAsyncComponent(() => import('../../components/v3/V3Settings.vue'))
const V3Shortcuts = defineAsyncComponent(() => import('../../components/v3/V3Shortcuts.vue'))

const { t } = useI18n()
const route = useRoute()

const { dataset, itemsRef } = useV3Data()
const search = useV3Search(() => itemsRef.value)
const { result: filterResult, isFiltered } = useV3Filter(
  () => itemsRef.value,
  () => search.resultSet.value,
  (id) => resolveV3Id(dataset.value, id),
)

// 供 ExportModal 消费当前筛选可见集
const filterVisibleRef = shallowRef<Set<string> | null>(null)
watch(() => filterResult.value.visible, (v) => { filterVisibleRef.value = v }, { immediate: true })
provide(FILTER_VISIBLE_KEY, filterVisibleRef)

const showOnThisDay = ref(false)

const { trail, push: trailPush, reset: trailReset, surface: trailSurface } = useTrail()
provide(TRAIL_KEY, { trail })
const trailOn = useStore(showTrail)

const fs = useStore(fontSize)
const fltMode = useStore(floatMode)
const detailModeVal = useStore(detailMode)
const fltFilterMode = useStore(filterMode)
const immersive = useStore(immersiveMode)
const bg = useStore(bgMode)
const density = useStore(v3Density)
const align = useStore(v3Align)
const cb = useStore(colorblindMode)
const favMark = useStore(showFavMark)
const entryTags = useStore(showEntryTags)
const redMotion = useStore(reducedMotion)

interface WallApi {
  flush: () => void
  markRead: (id: string) => void
  markFav: (id: string) => void
  setTooltipActive: (id: string | null) => void
  getEl: (id: string) => HTMLElement | null
  getWall: () => { ids: string[]; scatter: boolean } | null
}
interface CmdBarApi {
  togglePanel: (source?: 'fab' | 'bar') => void
  focusSearch: () => void
  closeDropdowns: () => boolean
}
interface HoverCardApi {
  rootEl: HTMLElement | null
}

const wallRef = ref<WallApi | null>(null)
const cmdBarRef = ref<CmdBarApi | null>(null)
const hoverCardRef = ref<HoverCardApi | null>(null)

function navOrder(): string[] {
  const w = wallRef.value?.getWall()
  const vis = filterResult.value.visible
  if (w && w.ids.length === dataset.value.items.length) {
    return vis ? w.ids.filter((id) => vis.has(id)) : w.ids
  }
  return filterResult.value.visibleOrder
}

const viewFactory = computed(() => createV3EntryViewFactory(dataset.value, navOrder))

const activeView = ref<EntryView | null>(null)
const settingsOpen = ref(false)
const shortcutsOpen = ref(false)
const toastMsg = ref('')
let toastTimer = 0
let deepLinkTimer = 0
let randomTipTimer = 0

function toast(msg: string) {
  toastMsg.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMsg.value = '' }, 1800)
}

function syncUrl(clearItem = true) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (clearItem) {
    url.searchParams.delete('entry')
    url.searchParams.delete('item')
  }
  const ids = trail.value.map((n) => n.id)
  const code = trailOn.value ? encodeTrail(ids) : ''
  if (code) url.searchParams.set('trail', code)
  else url.searchParams.delete('trail')
  writeV3UrlParams(url.searchParams, snapshotV3UrlState())
  const hash = ids.length ? `#${ids[ids.length - 1]}` : ''
  const next = url.pathname + url.search + hash
  if (window.location.pathname + window.location.search + window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}

watch(trailOn, () => {
  if (trail.value.length) syncUrl(true)
})

function openEntryDialog(id: string, fromId?: string | null) {
  const resolved = resolveV3Id(dataset.value, id)
  const v = viewFactory.value(resolved)
  if (!v) { toast(t('noResults')); return }
  hideHover()
  if (fromId) {
    const top = trail.value[trail.value.length - 1]
    if (top && top.id === fromId) trailPush({ id: v.id, title: v.title })
    else {
      const idx = trail.value.findIndex((n) => n.id === fromId)
      const base = idx >= 0 ? trail.value.slice(0, idx + 1) : []
      trail.value = [...base, { id: v.id, title: v.title }]
    }
  } else {
    trailReset({ id: v.id, title: v.title })
  }
  syncUrl()
  markRead(v.id)
  wallRef.value?.markRead(v.id)
  activeView.value = {
    ...v,
    depth: Math.max(0, trail.value.findIndex((n) => n.id === v.id)),
  }
}

function closeEntry() {
  activeView.value = null
  trailSurface()
  syncUrl()
}

// ── Tooltip 悬浮卡片控制（桌面 tooltip 模式：200ms 延迟 / 滚动节流 / 移入卡片保活） ──
const hoverView = ref<EntryView | null>(null)
const hoverAnchorEl = ref<HTMLElement | null>(null)
let hoverTimer = 0
let hoverEntryEl: HTMLElement | null = null
let scrollBusy = false
let scrollBusyTimer = 0

function showHover(el: HTMLElement, id: string) {
  if (window.innerWidth < 1024 || detailModeVal.value === 'modal') return
  const v = createV3TooltipView(dataset.value, id)
  if (!v) return
  hoverEntryEl = el
  hoverAnchorEl.value = el
  hoverView.value = v
  wallRef.value?.setTooltipActive(id)
}

function hideHover() {
  if (hoverTimer) {
    window.clearTimeout(hoverTimer)
    hoverTimer = 0
  }
  if (!hoverEntryEl && !hoverAnchorEl.value && !hoverView.value) return
  hoverEntryEl = null
  hoverAnchorEl.value = null
  hoverView.value = null
  wallRef.value?.setTooltipActive(null)
}

function onCardEnter() {
  hoverEntryEl = null
}

function onCardLeave() {
  hideHover()
}

function onScrollOrResize() {
  scrollBusy = true
  hideHover()
  window.clearTimeout(scrollBusyTimer)
  scrollBusyTimer = window.setTimeout(() => { scrollBusy = false }, 300)
}
useEventListener(window, 'scroll', onScrollOrResize, { passive: true })
useEventListener(window, 'resize', onScrollOrResize, { passive: true })

function openEntry(
  rawId: string,
  opts: { fromId?: string | null; preferHover?: boolean } = {},
) {
  const id = resolveV3Id(dataset.value, rawId)
  if (!id) return
  const item = dataset.value.byId.get(id)
  if (!item) { toast(t('noResults')); return }

  const presenter = resolvePresenter({ viewport: window.innerWidth, detailMode: detailModeVal.value })
  if (presenter === 'modal' || presenter === 'sheet' || opts.fromId) {
    openEntryDialog(id, opts.fromId)
    return
  }

  // 桌面 tooltip 模式
  if (opts.preferHover) {
    wallRef.value?.flush()
    const focusWithRetry = (tries: number) => {
      const el = wallRef.value?.getEl(id)
      const visible = !!el && el.isConnected && !el.classList.contains('is-hidden')
      if (visible && el) {
        el.scrollIntoView({ behavior: reducedMotion.get() ? 'auto' : 'smooth', block: 'center' })
        window.clearTimeout(randomTipTimer)
        randomTipTimer = window.setTimeout(() => showHover(el, id), 600)
        return
      }
      if (tries > 0) requestAnimationFrame(() => focusWithRetry(tries - 1))
      else openEntryDialog(id)
    }
    requestAnimationFrame(() => focusWithRetry(6))
    return
  }

  // 点击/键盘激活词条本体：有主链接则新标签打开并标已读
  const mainUrl = pickLinks(item.link, dataset.value.references.get(item.id)).main?.url
  markRead(item.id)
  wallRef.value?.markRead(item.id)
  if (mainUrl) window.open(mainUrl, '_blank', 'noopener')
}

// ── 词条墙事件委托（#v3-strata） ──
let strataEl: HTMLElement | null = null
function entryElFrom(e: Event): HTMLElement | null {
  return (e.target as HTMLElement | null)?.closest<HTMLElement>('.v3-entry[data-id]') ?? null
}
function onWallClick(e: Event) {
  const el = entryElFrom(e)
  if (!el?.dataset.id) return
  openEntry(el.dataset.id)
}
function onWallMouseOver(e: MouseEvent) {
  if (scrollBusy || detailModeVal.value === 'modal' || window.innerWidth < 1024) return
  const el = entryElFrom(e)
  if (!el?.dataset.id) { hideHover(); return }
  if (el === hoverEntryEl) return
  hoverEntryEl = el
  window.clearTimeout(hoverTimer)
  const id = el.dataset.id
  hoverTimer = window.setTimeout(() => showHover(el, id), 200)
}
function onWallMouseLeave(e: MouseEvent) {
  if (detailModeVal.value === 'modal') return
  window.clearTimeout(hoverTimer)
  hoverEntryEl = null
  const to = e.relatedTarget as HTMLElement | null
  const tipEl = hoverCardRef.value?.rootEl
  if (to && tipEl && (to === tipEl || tipEl.contains(to))) return
  if (!to || !to.closest('#v3-strata')) hideHover()
}
function onWallKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const el = entryElFrom(e)
  if (!el?.dataset.id) return
  e.preventDefault()
  openEntry(el.dataset.id)
}

function flushWall() {
  wallRef.value?.flush()
}

function doRandom() {
  const pool = filterResult.value.matched
  if (pool && pool.size === 0) {
    toast(t('noResults'))
    return
  }
  const id = pickRandom(pool, navOrder(), activeView.value?.id)
  if (!id) {
    toast(t('noResults'))
    return
  }
  openEntry(id, { preferHover: true })
}

function jumpTier(name: string) {
  flushWall()
  const scrollTry = (tries: number) => {
    const el = document.querySelector<HTMLElement>(`.v3-tier[data-tier="${CSS.escape(name)}"]`)
    if (el) { el.scrollIntoView({ behavior: reducedMotion.get() ? 'auto' : 'smooth', block: 'start' }); return }
    if (tries > 0) requestAnimationFrame(() => scrollTry(tries - 1))
  }
  requestAnimationFrame(() => scrollTry(6))
}

function readDeepLink() {
  const qs = new URLSearchParams(window.location.search)
  const restoredIds = trailOn.value
    ? decodeTrail(qs.get('trail')).map((id) => resolveV3Id(dataset.value, id)).filter((id) => dataset.value.byId.has(id))
    : []
  if (restoredIds.length > 0) {
    flushWall()
    trail.value = restoredIds.map((id) => {
      const it = dataset.value.byId.get(id)!
      return { id: it.id, title: it.title }
    })
    const last = restoredIds[restoredIds.length - 1]
    const from = restoredIds.length > 1 ? restoredIds[restoredIds.length - 2] : undefined
    deepLinkTimer = window.setTimeout(() => openEntryDialog(last, from), 200)
    return
  } else if (qs.has('trail')) {
    syncUrl()
  }

  const queryId = typeof route.query.item === 'string'
    ? route.query.item
    : (typeof route.query.entry === 'string' ? route.query.entry : '')
  const rawHash = window.location.hash.slice(1)
  const targetRaw = queryId || (/^[a-f0-9]{8}$/i.test(rawHash) ? rawHash : '')
  if (!targetRaw) return

  const resolved = resolveV3Id(dataset.value, targetRaw)
  if (!dataset.value.byId.has(resolved)) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return
  }
  flushWall()
  deepLinkTimer = window.setTimeout(() => openEntry(resolved, { preferHover: true }), 250)
}

function onOpenModalSignal(e: Event) {
  const raw = (e as CustomEvent).detail
  if (typeof raw !== 'string' || !raw) return
  flushWall()
  openEntryDialog(raw)
}

// ── 全局快捷键协调器（不干扰表单输入，不穿透已打开的详情弹窗） ──
function onGlobalKey(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA'

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    cmdBarRef.value?.focusSearch()
    return
  }

  if (e.key === 'Escape') {
    if (shortcutsOpen.value || settingsOpen.value || showOnThisDay.value || activeView.value) return
    if (cmdBarRef.value?.closeDropdowns()) return
    if (typing && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    return
  }

  if (typing) return
  if (e.key === '?') { e.preventDefault(); shortcutsOpen.value = !shortcutsOpen.value; return }
  if (e.key === '/') { e.preventDefault(); cmdBarRef.value?.focusSearch(); return }

  if (activeView.value || settingsOpen.value || shortcutsOpen.value || showOnThisDay.value) return
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase()
    if (k === 'r') { e.preventDefault(); doRandom() }
    else if (k === 'f') { e.preventDefault(); cmdBarRef.value?.togglePanel('bar') }
  }
}

watch(detailModeVal, (m) => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-detail', m)
  if (m === 'modal') hideHover()
}, { immediate: true })

watch(redMotion, (v) => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-motion', v ? 'reduce' : 'auto')
}, { immediate: true })

watch(fs, (v) => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--item-font-size', FONT_SCALE_MAP[v] || '1rem')
  }
}, { immediate: true })

watch(() => route.query.item, (v) => {
  if (v) readDeepLink()
})

const buildDate = computed(() => formatUnixDate(dataset.value.generatedAt))

const rootClass = computed(() => ({
  'is-compact': density.value === 'compact',
  'is-left': align.value === 'left',
  'no-float': fltMode.value === 'none',
  'is-immersive': immersive.value,
  'is-colorblind': cb.value,
  'no-fav-mark': !favMark.value,
  'no-entry-tags': !entryTags.value,
}))

const ctx: V3Context = {
  dataset,
  buildDate,
  filter: filterResult,
  isFiltered,
  search,
  trail,
  activeView,
  openEntry,
  openEntryDialog,
  closeEntry,
  pickAndShowRandom: doRandom,
  jumpTier,
  toggleFilterPanel: (source) => cmdBarRef.value?.togglePanel(source),
  openSettings: () => { settingsOpen.value = true },
  openShortcuts: () => { shortcutsOpen.value = true },
  openOnThisDay: () => { showOnThisDay.value = true },
  toast,
}
provide(V3_CTX_KEY, ctx)

const unbindUrlAtoms: Array<() => void> = []

onMounted(() => {
  applyV3UrlState(window.location.search, dataset.value)
  for (const atom of [
    searchQuery, activeCategories, activeTags, hiddenCategories, hiddenTags,
    specialFilter, favFilter, tagFilterMode, searchMode, searchFuzzyMode, sortMode, scatterMode,
  ]) {
    unbindUrlAtoms.push(atom.listen(() => syncUrl(false)))
  }
  window.addEventListener('keydown', onGlobalKey)
  document.addEventListener('open-item-modal', onOpenModalSignal)

  strataEl = document.getElementById('v3-strata')
  if (strataEl) {
    strataEl.addEventListener('click', onWallClick)
    strataEl.addEventListener('mouseover', onWallMouseOver)
    strataEl.addEventListener('mouseleave', onWallMouseLeave)
    strataEl.addEventListener('keydown', onWallKeyDown)
  }

  requestAnimationFrame(() => readDeepLink())
  document.dispatchEvent(new CustomEvent('vue-ready'))
})

onBeforeUnmount(() => {
  while (unbindUrlAtoms.length) unbindUrlAtoms.pop()?.()
  window.clearTimeout(toastTimer)
  window.clearTimeout(hoverTimer)
  window.clearTimeout(scrollBusyTimer)
  window.clearTimeout(deepLinkTimer)
  window.clearTimeout(randomTipTimer)
  window.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('open-item-modal', onOpenModalSignal)
  if (typeof document !== 'undefined') {
    document.documentElement.removeAttribute('data-motion')
  }
  if (strataEl) {
    strataEl.removeEventListener('click', onWallClick)
    strataEl.removeEventListener('mouseover', onWallMouseOver)
    strataEl.removeEventListener('mouseleave', onWallMouseLeave)
    strataEl.removeEventListener('keydown', onWallKeyDown)
    strataEl = null
  }
})
</script>

<template>
  <div id="v3-capture" class="v3-root" :class="rootClass">
    <IcebergBg v-if="bg !== 'black'" />

    <div class="v3-content">
      <V3Masthead />

      <a href="#v3-colophon" class="v3-skip">{{ t('skipWall') }}</a>

      <V3CommandBar ref="cmdBarRef" />

      <main id="v3-strata-wrap">
        <V3Wall ref="wallRef" />

        <div v-if="fltFilterMode !== 'dim' && isFiltered && filterResult.total === 0" class="v3-empty">
          {{ t('noResults') }}
          <button type="button" class="v3-nav-tool" style="margin-left: 0.75rem" @click="resetFilters()">{{ t('clearAll') }}</button>
        </div>
      </main>

      <V3Colophon />
    </div>

    <V3HoverCard
      ref="hoverCardRef"
      :view="hoverView"
      :anchorEl="hoverAnchorEl"
      @enter="onCardEnter"
      @leave="onCardLeave"
    />

    <V3EntryDialog />

    <V3FloatingButtons />

    <V3Settings v-if="settingsOpen" @close="settingsOpen = false" @toast="toast" />
    <V3Shortcuts v-if="shortcutsOpen" @close="shortcutsOpen = false" />
    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />

    <Transition name="v3-toast">
      <div v-if="toastMsg" class="v3-toast" role="status" aria-live="polite">{{ toastMsg }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.v3-toast {
  position: fixed;
  left: 50%;
  bottom: 2rem;
  z-index: var(--v3-z-toast, 100010);
  transform: translate(-50%, 0);
  padding: 0.55rem 1rem;
  border: 1px solid var(--white-12);
  border-radius: var(--v3-r-md);
  background: rgba(10, 12, 16, 0.94);
  color: var(--white-85);
  font-size: var(--font-xs);
  letter-spacing: 0.06em;
  box-shadow: var(--v3-shadow-lg);
  pointer-events: none;
}
.v3-toast-enter-active {
  transition: opacity var(--v3-t-fast, 140ms) var(--v3-ease, ease-out),
    transform var(--v3-t-fast, 140ms) var(--v3-ease, ease-out);
}
.v3-toast-leave-active {
  transition: opacity var(--v3-t-fast, 140ms) ease-in,
    transform var(--v3-t-fast, 140ms) ease-in;
}
.v3-toast-enter-from,
.v3-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
