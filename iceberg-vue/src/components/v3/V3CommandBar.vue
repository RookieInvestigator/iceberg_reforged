<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEventListener, useMediaQuery } from '@vueuse/core'
import { useStore } from '@nanostores/vue'
import { Search } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import { isInNavHotZone, navShouldShowOnPointer, navShouldShowOnScroll } from '../../lib/navVisibility'
import { tierDisplayName, totalTiersText } from '../../lib/iceberg/tierDisplay'
import { searchTerms } from '../../lib/iceberg/searchIndex'
import { bodySnippet } from '../../lib/v3/search'
import { observeShared } from '../../lib/v3/sharedObserver'
import { buildCategoryShapeMap } from '../../lib/v3/wall'
import {
  searchQuery, activeCategories, activeTags, hiddenCategories, hiddenTags,
  specialFilter, favFilter, searchFuzzyMode, searchMode, scatterMode,
  colorblindMode, showScrollProgress, hasActiveFilterAtom,
  toggleCategory, toggleTag, hideCategory, hideTag, resetFilters,
} from '../../lib/v3/store'
import { V3_CTX_KEY, type V3SuggestRow } from '../../lib/v3/keys'
import V3FilterPanel from './V3FilterPanel.vue'

const _ctx = inject(V3_CTX_KEY)
if (!_ctx) throw new Error('[V3CommandBar] 缺少 V3_CTX_KEY')
const ctx = _ctx

const { t } = useI18n()

const ds = computed(() => ctx.dataset.value)
const query = useStore(searchQuery)
const cats = useStore(activeCategories)
const tags = useStore(activeTags)
const hideCats = useStore(hiddenCategories)
const hideTags = useStore(hiddenTags)
const special = useStore(specialFilter)
const favOnly = useStore(favFilter)
const fuzzy = useStore(searchFuzzyMode)
const scope = useStore(searchMode)
const scatter = useStore(scatterMode)
const cb = useStore(colorblindMode)
const showProg = useStore(showScrollProgress)
const hasActive = useStore(hasActiveFilterAtom)
const catShapes = computed(() => buildCategoryShapeMap(ds.value.categoryColors))

const sentinelRef = ref<HTMLElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const progressEl = ref<HTMLElement | null>(null)

const tierOpen = ref(false)
const panelOpen = ref(false)
const stuck = ref(false)
const barVisible = ref(true)
const curTier = ref('')
const atTop = ref(true)
const searchFocus = ref(false)
const suggestOpen = ref(false)
const suggestIdx = ref(0)

const coarse = useMediaQuery('(hover: none)')

let hotY = -1
let lastY = 0
let closedFromOutside = false
let scrollTick = false
let docScrollRange = 0
const visibleTiers = new Set<string>()
const tierStops = new Map<Element, () => void>()
let stopSentinel: (() => void) | null = null
let tierMutObs: MutationObserver | null = null
let docResizeObs: ResizeObserver | null = null

const countText = computed(() => {
  const total = ds.value.items.length
  const n = ctx.isFiltered.value ? ctx.filter.value.total : null
  if (!hasActive.value || n === null) return String(total)
  const allFuzzy = ctx.search.fuzzy.value && ctx.search.exactCount.value === 0
  return `${allFuzzy ? '≈' : ''}${n} / ${total}`
})

const curTierText = computed(() => {
  if (scatter.value) return t('scatterMode').split('（')[0]
  if (atTop.value) return totalTiersText(ds.value.tierOrder.length)
  return curTier.value ? tierDisplayName(curTier.value) : t('entries')
})

// 输入防抖写回 filterStore.searchQuery
let inputTimer = 0
function onSearchInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  window.clearTimeout(inputTimer)
  inputTimer = window.setTimeout(() => searchQuery.set(v), 150)
  suggestIdx.value = 0
  if (v.trim()) suggestOpen.value = true
  else suggestOpen.value = false
}

function onSearchFocus() {
  searchFocus.value = true
  if (query.value.trim()) suggestOpen.value = true
}

function onSearchBlur() {
  searchFocus.value = false
}

const terms = computed(() => searchTerms(query.value))
const suggestSettled = computed(() => !query.value.trim() || ctx.search.hitsQuery.value === query.value)
const suggestFuzzy = computed(() => ctx.search.fuzzy.value && (ctx.search.hits.value?.length ?? 0) > 0)
const suggestMixed = computed(() => suggestFuzzy.value && ctx.search.exactCount.value > 0)
const suggestSwitchToFuzzy = computed(() =>
  fuzzy.value === 'exact'
  && !!query.value.trim()
  && ctx.search.hitsQuery.value === query.value
  && (ctx.search.hits.value?.length ?? 0) === 0,
)

const rows = computed<V3SuggestRow[]>(() => {
  const ids = ctx.search.hits.value
  if (!ids?.length || !terms.value.length) return []
  const out: V3SuggestRow[] = []
  for (const id of ids) {
    const it = ds.value.byId.get(id)
    if (!it) continue
    out.push({
      id: it.id,
      title: it.title,
      category: it.category,
      snippet: bodySnippet(it, query.value),
    })
    if (out.length >= 6) break
  }
  return out
})

function chooseRow(row: V3SuggestRow | undefined) {
  suggestOpen.value = false
  if (!row?.id) return
  ctx.openEntry(row.id, { preferHover: true })
  inputRef.value?.blur()
}

function switchToFuzzy() {
  searchFuzzyMode.set('fuzzy')
}

function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!suggestOpen.value) { suggestOpen.value = true; return }
    const n = rows.value.length
    if (!n) return
    suggestIdx.value = e.key === 'ArrowDown'
      ? Math.min(suggestIdx.value + 1, n - 1)
      : Math.max(suggestIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    if (suggestOpen.value && rows.value.length) {
      e.preventDefault()
      chooseRow(rows.value[suggestIdx.value] || rows.value[0])
    }
  } else if (e.key === 'Escape') {
    suggestOpen.value = false
    inputRef.value?.blur()
  }
}

function onMouseMove(e: MouseEvent) {
  hotY = e.clientY
  if (!stuck.value && barVisible.value) return
  const decision = navShouldShowOnPointer({
    inHotZone: isInNavHotZone(e.clientY),
    coarsePointer: coarse.value,
    forceVisible: panelOpen.value || tierOpen.value || searchFocus.value || suggestOpen.value,
    alwaysVisible: !stuck.value,
  })
  const next = decision === 'show'
  if (barVisible.value !== next) barVisible.value = next
}

function syncTierFromVisible() {
  if (scatter.value) return
  let best = ''
  const order = ds.value.tierOrder
  for (let i = order.length - 1; i >= 0; i--) {
    const name = order[i]
    if (visibleTiers.has(name)) {
      best = name
      break
    }
  }
  const nextAtTop = best === '' && window.scrollY < 400
  const nextTier = best || (nextAtTop ? '' : order[order.length - 1] || '')
  if (curTier.value !== nextTier) curTier.value = nextTier
  if (atTop.value !== nextAtTop) atTop.value = nextAtTop
}

function syncTierObservers() {
  if (scatter.value) {
    for (const stop of tierStops.values()) stop()
    tierStops.clear()
    visibleTiers.clear()
    return
  }
  const nodes = document.querySelectorAll('.v3-tier[data-tier]')
  const live = new Set<Element>(nodes)
  for (const [el, stop] of tierStops) {
    if (!live.has(el)) {
      stop()
      tierStops.delete(el)
      const name = (el as HTMLElement).dataset.tier
      if (name) visibleTiers.delete(name)
    }
  }
  for (const el of nodes) {
    if (tierStops.has(el)) continue
    const stop = observeShared(
      el,
      (entry) => {
        const name = (entry.target as HTMLElement).dataset.tier
        if (!name) return
        if (entry.isIntersecting) visibleTiers.add(name)
        else visibleTiers.delete(name)
        syncTierFromVisible()
      },
      { rootMargin: '-1px 0px -50% 0px', threshold: 0 },
    )
    tierStops.set(el, stop)
  }
}

function updateScrollRange() {
  docScrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

function requestScrollFrame() {
  if (scrollTick) return
  scrollTick = true
  requestAnimationFrame(() => {
    scrollTick = false
    const y = window.scrollY
    const dy = y - lastY
    lastY = y
    const decision = navShouldShowOnScroll({
      y,
      dy,
      inHotZone: isInNavHotZone(hotY),
      coarsePointer: coarse.value,
      forceVisible: panelOpen.value || tierOpen.value || searchFocus.value || suggestOpen.value,
      alwaysVisible: !stuck.value,
    })
    if (decision === 'show' && !barVisible.value) barVisible.value = true
    else if (decision === 'hide' && barVisible.value) barVisible.value = false

    const p = docScrollRange > 0 ? Math.min(1, Math.max(0, y / docScrollRange)) : 0
    if (progressEl.value) progressEl.value.style.transform = `scaleX(${p})`
  })
}

function onDocDown(e: MouseEvent) {
  let closed = false
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) {
    tierOpen.value = false
    suggestOpen.value = false
    if (panelOpen.value) {
      panelOpen.value = false
      closed = true
    }
  }
  closedFromOutside = closed
}

function togglePanel(source: 'fab' | 'bar' = 'bar') {
  if (panelOpen.value) {
    panelOpen.value = false
    return
  }
  if (source === 'fab' && closedFromOutside) {
    closedFromOutside = false
    return
  }
  closedFromOutside = false
  barVisible.value = true
  tierOpen.value = false
  panelOpen.value = true
}

function focusSearch() {
  panelOpen.value = false
  tierOpen.value = false
  barVisible.value = true
  inputRef.value?.focus()
  if (query.value.trim()) suggestOpen.value = true
}

function selectTier(name: string) {
  tierOpen.value = false
  ctx.jumpTier(name)
}

const specialLabel = computed(() => {
  switch (special.value) {
    case 'hasLink': return t('hasLink')
    case 'hasDesc': return t('hasDesc')
    case 'isNew': return t('isNew')
    case 'noLinkNoDesc': return t('needComplete')
    default: return ''
  }
})

useEventListener(window, 'scroll', requestScrollFrame, { passive: true })
useEventListener(window, 'resize', updateScrollRange, { passive: true })
useEventListener(window, 'mousemove', onMouseMove, { passive: true })
useEventListener(document, 'mousedown', onDocDown)

watch(scatter, () => { syncTierObservers(); syncTierFromVisible() })

let disposed = false
let syncQueued = false
function queueSyncTierObservers() {
  if (syncQueued || disposed) return
  syncQueued = true
  queueMicrotask(() => {
    syncQueued = false
    if (!disposed) syncTierObservers()
  })
}

onMounted(() => {
  updateScrollRange()
  if (typeof ResizeObserver === 'function') {
    docResizeObs = new ResizeObserver(updateScrollRange)
    docResizeObs.observe(document.documentElement)
  }
  if (sentinelRef.value) {
    stopSentinel = observeShared(
      sentinelRef.value,
      (entry) => {
        const isStuck = !entry.isIntersecting && entry.boundingClientRect.top <= 12
        if (isStuck && !stuck.value) {
          panelOpen.value = false
          tierOpen.value = false
        }
        if (stuck.value !== isStuck) stuck.value = isStuck
      },
      { rootMargin: '-12px 0px 0px 0px', threshold: 0 },
    )
  }
  syncTierObservers()
  const strata = document.getElementById('v3-strata')
  if (strata && typeof MutationObserver === 'function') {
    tierMutObs = new MutationObserver(queueSyncTierObservers)
    tierMutObs.observe(strata, { childList: true })
  }
  requestScrollFrame()
})

onBeforeUnmount(() => {
  disposed = true
  stopSentinel?.()
  stopSentinel = null
  for (const stop of tierStops.values()) stop()
  tierStops.clear()
  tierMutObs?.disconnect()
  tierMutObs = null
  docResizeObs?.disconnect()
  docResizeObs = null
})

function closeDropdowns(): boolean {
  let did = false
  if (panelOpen.value) { panelOpen.value = false; did = true }
  if (tierOpen.value) { tierOpen.value = false; did = true }
  if (suggestOpen.value) { suggestOpen.value = false; did = true }
  return did
}

defineExpose({ togglePanel, focusSearch, closeDropdowns, panelOpen })
</script>

<template>
  <div ref="sentinelRef" class="v3-nav-sentinel" aria-hidden="true" />
  <div ref="wrapRef" class="v3-navwrap" :class="{ 'is-stuck': stuck, 'is-hidden': !barVisible }">
    <nav class="v3-nav" :aria-label="t('filter')">
      <div class="v3-nav-tier">
        <button
          type="button"
          class="v3-nav-tool v3-nav-tierbtn"
          :disabled="!!scatter"
          :aria-expanded="tierOpen"
          @click.stop="tierOpen = !tierOpen; if (tierOpen) panelOpen = false"
        >{{ curTierText }}</button>
        <transition name="v3-tier-fade">
          <div v-if="tierOpen && !scatter" class="v3-nav-tierlist no-scrollbar">
            <button
              v-for="name in ds.tierOrder"
              :key="name"
              type="button"
              class="v3-nav-tieritem"
              :class="{ on: !atTop && name === curTier }"
              @click="selectTier(name)"
            >{{ tierDisplayName(name) }}</button>
          </div>
        </transition>
      </div>

      <span class="v3-nav-sep" aria-hidden="true" />

      <div class="v3-nav-search">
        <Search :size="16" :stroke-width="2" class="shrink-0 opacity-40" aria-hidden="true" />
        <input
          ref="inputRef"
          class="v3-nav-input"
          type="text"
          role="combobox"
          :value="query"
          :aria-expanded="suggestOpen && query.trim().length > 0"
          aria-controls="v3-suggest"
          :aria-activedescendant="suggestOpen && suggestIdx >= 0 ? 'v3-opt-' + suggestIdx : undefined"
          :placeholder="t('search')"
          autocomplete="off"
          spellcheck="false"
          :aria-label="t('search')"
          @input="onSearchInput"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          @keydown="onSearchKey"
        />
        <span class="v3-nav-count" aria-live="polite">{{ countText }}</span>
        <span class="v3-nav-kbd" aria-hidden="true">/</span>

        <transition name="v3-tier-fade">
          <div v-if="suggestOpen && query.trim()" id="v3-suggest" class="v3-nav-suggest no-scrollbar" role="listbox">
            <p v-if="suggestFuzzy && rows.length" class="v3-sughint">
              {{ suggestMixed ? t('searchFuzzyMixedHint') : t('searchFuzzyHint') }}
            </p>
            <button
              v-for="(row, i) in rows"
              :id="'v3-opt-' + i"
              :key="row.id"
              type="button"
              class="v3-sugrow"
              :class="{ on: i === suggestIdx }"
              role="option"
              :aria-selected="i === suggestIdx"
              @mousedown.prevent="chooseRow(row)"
              @mousemove="suggestIdx = i"
            >
              <span class="v3-sugtitle"><MirrorText :text="row.title" /></span>
              <span class="v3-sugcat">{{ row.category }}</span>
              <span v-if="row.snippet" class="v3-sugsnip">{{ row.snippet }}</span>
            </button>

            <button v-if="suggestSwitchToFuzzy" type="button" class="v3-sugswitch" @mousedown.prevent="switchToFuzzy">
              <span>{{ t('searchTryFuzzy') }}</span>
              <span class="v3-sugswitch-go" aria-hidden="true">→</span>
            </button>
            <p v-else-if="!rows.length && suggestSettled" class="v3-sugempty">{{ t('noResults') }}</p>
          </div>
        </transition>
      </div>

      <div class="v3-nav-tools">
        <button
          type="button"
          class="v3-nav-tool v3-nav-tool-dim v3-nav-hide-sm"
          :aria-pressed="scope === 'full'"
          @click="searchMode.set(scope === 'full' ? 'title' : 'full')"
        >{{ scope === 'full' ? t('searchFullText') : t('searchTitleOnly') }}</button>
        <button
          type="button"
          class="v3-nav-tool v3-nav-tool-dim v3-nav-hide-sm"
          :aria-pressed="fuzzy === 'fuzzy'"
          @click="searchFuzzyMode.set(fuzzy === 'fuzzy' ? 'exact' : 'fuzzy')"
        >{{ fuzzy === 'fuzzy' ? t('searchFuzzy') : t('searchExact') }}</button>
        <span class="v3-nav-sep v3-nav-hide-sm" aria-hidden="true" />
        <button
          type="button"
          class="v3-nav-tool"
          :class="{ on: panelOpen || hasActive }"
          :aria-expanded="panelOpen"
          @click="togglePanel('bar')"
        >{{ t('filter') }}<span v-if="hasActive" class="v3-nav-dot" aria-hidden="true" /></button>
      </div>

      <span v-show="showProg" ref="progressEl" class="v3-nav-progress" aria-hidden="true" />

      <transition name="v3-expand">
        <V3FilterPanel v-if="panelOpen" />
      </transition>
    </nav>

    <transition name="v3-expand">
      <div v-if="hasActive && !panelOpen && !suggestOpen" class="v3-bar-active">
        <button v-if="query" type="button" class="v3-chip" @click="searchQuery.set('')">
          <span class="truncate max-w-[120px]">{{ query }}</span>
          <span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button v-for="cat in cats" :key="cat" type="button" class="v3-chip" @click="toggleCategory(cat)">
          <span
            v-if="cb"
            class="v3-cmark"
            :class="'cm-' + (catShapes.get(cat) ?? 0)"
            :style="{ '--mark-color': ds.categoryColors[cat] || ds.defaultColor }"
            aria-hidden="true"
          />
          <span v-else class="v3-chip-dot" :style="{ backgroundColor: ds.categoryColors[cat] || ds.defaultColor }" />
          <span>{{ cat }}</span><span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button v-for="tag in tags" :key="tag" type="button" class="v3-chip" @click="toggleTag(tag)">
          <span class="opacity-50">{{ tag }}</span><span>{{ ds.tagMap[tag] || tag }}</span>
          <span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button v-if="specialLabel" type="button" class="v3-chip" @click="specialFilter.set('all')">
          <span>{{ specialLabel }}</span><span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button v-if="favOnly" type="button" class="v3-chip" @click="favFilter.set(false)">
          <span>★ {{ t('favorite') }}</span><span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <span v-if="(query || cats.length || tags.length || specialLabel || favOnly) && (hideCats.length || hideTags.length)" class="v3-chip-sep" aria-hidden="true" />
        <button v-for="cat in hideCats" :key="'h' + cat" type="button" class="v3-chip v3-chip-off" @click="hideCategory(cat)">
          <span aria-hidden="true">⊘</span>
          <span
            v-if="cb"
            class="v3-cmark opacity-40"
            :class="'cm-' + (catShapes.get(cat) ?? 0)"
            :style="{ '--mark-color': ds.categoryColors[cat] || ds.defaultColor }"
            aria-hidden="true"
          />
          <span v-else class="v3-chip-dot opacity-30" :style="{ backgroundColor: ds.categoryColors[cat] || ds.defaultColor }" />
          <span>{{ cat }}</span><span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button v-for="tag in hideTags" :key="'h' + tag" type="button" class="v3-chip v3-chip-off" @click="hideTag(tag)">
          <span aria-hidden="true">⊘</span><span>{{ ds.tagMap[tag] || tag }}</span>
          <span class="v3-chip-x" aria-hidden="true">×</span>
        </button>
        <button type="button" class="v3-chip v3-chip-clear" @click="resetFilters()">{{ t('clearAll') }}</button>
      </div>
    </transition>
  </div>
</template>
