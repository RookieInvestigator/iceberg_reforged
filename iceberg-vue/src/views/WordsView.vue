<script setup lang="ts">
// 词条星图（/stars）— 极简深空星座观测台：
//   - 100vw × 100dvh 广域深空星图画布，可平缓拖拽漫游、缩放与聚焦探索
//   - 多维关联算法（副表抽词：地名 / 时间年代 / 核心名词 + 多分类 + 标签 + 手工关联）
//   - 点击星点平滑居中并拉近关联星、点空白区域柔缓退出聚焦
import { computed, onMounted, onUnmounted, provide, ref, shallowRef, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import {
  Search,
  LocateFixed,
  ZoomIn,
  ZoomOut,
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue'
import { useI18n } from '../lib/useI18n'
import { useIcebergDataSource } from '../lib/iceberg/useIcebergDataSource'
import { toEntryView, MOBILE_BP, type EntryView } from '../lib/iceberg/entryView'
import {
  adjacencyOf,
  buildGraph,
  categoryDistribution,
  computeConstellationsLayout,
  rankNodesByDegree,
  type CategoryStat,
  type ConstellationsLayoutResult,
  type EdgeReason,
  type GraphEdge,
  type GraphNode,
  type WordGraph,
} from '../lib/iceberg/wordGraph'
import {
  createWordGraphCanvas,
  type FocusEdgeVisual,
  type WordGraphCanvasController,
} from '../lib/iceberg/wordGraphCanvas'
import { useEntryInteractions } from '../lib/useEntryInteractions'
import { ENTRY_IA_KEY } from '../lib/iceberg/v2/keys'
import V2EntryBody from '../components/v2/V2EntryBody.vue'
import V2EntryActions from '../components/v2/V2EntryActions.vue'
import EntrySearchButton from '../components/items/EntrySearchButton.vue'

const { t, lang } = useI18n()
const route = useRoute()
const isDev = import.meta.env.DEV
const { allItemsRaw, data, relatedMap, entitiesMap } = useIcebergDataSource()

const itemMap = new Map(allItemsRaw.map((i) => [i.id, i]))

const canvasEl = ref<HTMLCanvasElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
const searchInputEl = ref<HTMLInputElement | null>(null)
const commentSectionEl = ref<HTMLElement | null>(null)

const graph = shallowRef<WordGraph | null>(null)
const adj = shallowRef<Map<number, number[]> | null>(null)
const skyScene = shallowRef<ConstellationsLayoutResult | null>(null)
const rankedIndices = shallowRef<number[]>([])
const categories = shallowRef<CategoryStat[]>([])

const searchText = ref('')
const activeCategory = ref<string | null>(null)
const categoryMenuOpen = ref(false)
const hovered = ref<GraphNode | null>(null)
const syncedHoverId = ref<string | null>(null)
const currentId = ref<string | null>(null)
const trailIds = ref<string[]>([])
const isMobile = ref(false)

const ia = useEntryInteractions(currentId, commentSectionEl)
provide(ENTRY_IA_KEY, ia)
const { titleCopied, copyTitle } = ia

function setCommentEl(el: HTMLElement | null) {
  commentSectionEl.value = el
}

const renderer = shallowRef<WordGraphCanvasController | null>(null)
let idleTask = 0
let resizeObserver: ResizeObserver | null = null

const nodeIndex = computed(() => graph.value?.index ?? new Map<string, number>())

const matched = computed(() => {
  const g = graph.value
  const key = searchText.value.trim().toLowerCase()
  const set = new Set<number>()
  if (!g || !key) return set
  for (let i = 0; i < g.nodes.length; i++) {
    const n = g.nodes[i]!
    if (
      activeCategory.value &&
      n.category !== activeCategory.value &&
      !n.categories.includes(activeCategory.value)
    ) {
      continue
    }
    if (n.title.toLowerCase().includes(key)) set.add(i)
  }
  return set
})

const searchResults = computed(() => {
  const g = graph.value
  if (!g || matched.value.size === 0) return []
  const out: GraphNode[] = []
  for (const i of matched.value) {
    const node = g.nodes[i]
    if (node) out.push(node)
    if (out.length >= 40) break
  }
  return out
})

const selectedIndex = computed(() => {
  if (!currentId.value) return null
  return nodeIndex.value.get(currentId.value) ?? null
})

const focusIndex = computed(() => {
  if (hovered.value) return nodeIndex.value.get(hovered.value.id) ?? null
  return selectedIndex.value
})

const activeFocusTargetIndex = computed(() => selectedIndex.value ?? focusIndex.value)

const focusNeighbors = computed(() => {
  const idx = activeFocusTargetIndex.value
  if (idx === null || !adj.value) return new Set<number>()
  return new Set(adj.value.get(idx) ?? [])
})

const syncedHoverIndex = computed(() => {
  if (!syncedHoverId.value) return null
  return nodeIndex.value.get(syncedHoverId.value) ?? null
})

const activeCategoryMeta = computed(
  () => categories.value.find((c) => c.category === activeCategory.value) ?? null,
)

const hoveredNeighborCountText = computed(() => {
  if (!hovered.value) return ''
  const tierTag =
    hovered.value.starClass === 'primary'
      ? '主星'
      : hovered.value.starClass === 'sub'
        ? '副星'
        : '游离星'
  const capCount = Math.min(hovered.value.degree, hovered.value.maxLinks)
  return `${tierTag} · ${t('wordsNeighbors').replace('{count}', String(capCount))}`
})

function formatEdgeReasons(reasons?: EdgeReason[]): string {
  void lang.value
  if (!reasons || reasons.length === 0) return t('wordsReasonSameCat')
  const picked: string[] = []
  for (const r of reasons) {
    const text = r.kind === 'explicit' ? t('wordsReasonExplicit') : r.label
    if (text && !picked.includes(text)) picked.push(text)
    if (picked.length >= 2) break
  }
  return picked.length ? picked.join(' · ') : t('wordsReasonSameCat')
}

interface ConnectedStarItem {
  idx: number
  node: GraphNode
  weight: number
  explicit: boolean
  reasonText: string
}

function edgesForNode(targetIdx: number | null): ConnectedStarItem[] {
  const g = graph.value
  if (targetIdx === null || !g) return []
  const list: Array<{ idx: number; edge: GraphEdge }> = []
  for (const e of g.edges) {
    if (e.a === targetIdx) list.push({ idx: e.b, edge: e })
    else if (e.b === targetIdx) list.push({ idx: e.a, edge: e })
  }
  list.sort((x, y) => {
    const ex = x.edge.explicit ? 1 : 0
    const ey = y.edge.explicit ? 1 : 0
    if (ex !== ey) return ey - ex
    return y.edge.w - x.edge.w
  })
  const cap = g.nodes[targetIdx]?.maxLinks ?? 12
  return list.slice(0, cap).map(({ idx, edge }) => ({
    idx,
    node: g.nodes[idx]!,
    weight: edge.w,
    explicit: Boolean(edge.explicit),
    reasonText: formatEdgeReasons(edge.reasons),
  }))
}

const focusEdges = computed<FocusEdgeVisual[]>(() => {
  return edgesForNode(activeFocusTargetIndex.value).map((item) => ({
    neighborIdx: item.idx,
    weight: item.weight,
    explicit: item.explicit,
    reasonText: item.reasonText,
  }))
})

const connectedStars = computed<ConnectedStarItem[]>(() => {
  return edgesForNode(selectedIndex.value)
})

const currentDevEntities = computed(() => {
  if (!isDev) return null
  const g = graph.value
  const idx = selectedIndex.value
  if (!g || idx === null) return null
  const node = g.nodes[idx]
  if (!node) return null
  return {
    places: node.places,
    times: node.times,
    nouns: node.nouns,
    platforms: node.platforms,
  }
})

const hoveredDevKeywords = computed(() => {
  if (!isDev || !hovered.value) return []
  const h = hovered.value
  const groups: Array<{ kind: string; items: string[] }> = []
  if (h.places.length) groups.push({ kind: '地名', items: h.places })
  if (h.times.length) groups.push({ kind: '时间', items: h.times })
  if (h.nouns.length) groups.push({ kind: '名词', items: h.nouns })
  if (h.platforms.length) groups.push({ kind: '平台', items: h.platforms })
  return groups
})

const currentEntitySummary = computed(() => {
  const g = graph.value
  const idx = selectedIndex.value
  if (!g || idx === null) return ''
  const node = g.nodes[idx]
  if (!node) return ''
  const parts = [
    ...node.places.slice(0, 2),
    ...node.times.slice(0, 2),
    ...node.nouns.slice(0, 2),
    ...node.platforms.slice(0, 1),
  ]
  return [...new Set(parts)].slice(0, 5).join(' · ')
})

watchEffect(() => {
  const state = {
    matched: matched.value,
    activeCategory: activeCategory.value,
    focusIndex: focusIndex.value,
    focusNeighbors: focusNeighbors.value,
    selectedIndex: selectedIndex.value,
    focusEdges: focusEdges.value,
    syncedHoverIndex: syncedHoverIndex.value,
  }
  renderer.value?.setFocusState(state)
})

function focusSelectedOnCanvas(animate = true) {
  const idx = selectedIndex.value
  const r = renderer.value
  if (!r) return
  if (idx === null) {
    r.focusStar(null, { animate })
    return
  }
  r.focusStar(idx, {
    offsetRatioX: isMobile.value ? 0.5 : 0.39,
    offsetRatioY: isMobile.value ? 0.28 : 0.5,
    animate,
  })
}

function build() {
  const source = allItemsRaw.map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    categories: it.categories,
    tags: it.tags,
    tier: it.tier,
    desc: (it as { desc?: string }).desc || '',
  }))
  const g = buildGraph(source, {
    colorOf: (it) => data.categoryColors[it.category] || data.defaultColor,
    explicitRelated: relatedMap,
    entitiesMap,
  })
  const adjacency = adjacencyOf(g)
  const ranked = rankNodesByDegree(g)
  const sky = computeConstellationsLayout(g, adjacency)

  graph.value = g
  adj.value = adjacency
  rankedIndices.value = ranked
  categories.value = categoryDistribution(g)
  skyScene.value = sky
  renderer.value?.setGraph(g, ranked, sky)

  if (currentId.value) {
    focusSelectedOnCanvas(true)
  }
}

function scheduleBuild() {
  if (typeof requestIdleCallback === 'function') {
    idleTask = requestIdleCallback(() => build(), { timeout: 1000 })
  } else {
    idleTask = window.setTimeout(build, 20)
  }
}

function fitToView() {
  if (currentId.value && selectedIndex.value !== null) {
    focusSelectedOnCanvas(true)
    return
  }
  if (activeCategory.value && graph.value) {
    const indices: number[] = []
    graph.value.nodes.forEach((n, i) => {
      if (n.category === activeCategory.value || n.categories.includes(activeCategory.value!)) indices.push(i)
    })
    renderer.value?.fitToView(true, indices)
    return
  }
  renderer.value?.fitToView(true)
}

function selectCategory(cat: string | null) {
  activeCategory.value = activeCategory.value === cat ? null : cat
  categoryMenuOpen.value = false
  if (currentId.value) return
  if (activeCategory.value && graph.value) {
    const indices: number[] = []
    graph.value.nodes.forEach((n, i) => {
      if (n.category === activeCategory.value || n.categories.includes(activeCategory.value!)) indices.push(i)
    })
    renderer.value?.fitToView(true, indices)
  } else {
    renderer.value?.fitToView(true)
  }
}

function zoomBy(factor: number) {
  renderer.value?.zoomBy(factor)
}

function pushTrail(id: string) {
  const existingPos = trailIds.value.indexOf(id)
  if (existingPos >= 0) {
    trailIds.value = trailIds.value.slice(0, existingPos + 1)
  } else {
    trailIds.value = [...trailIds.value, id]
  }
}

function openEntry(id: string) {
  if (!itemMap.has(id)) return
  currentId.value = id
  syncedHoverId.value = null
  hovered.value = null
  categoryMenuOpen.value = false
  pushTrail(id)
  focusSelectedOnCanvas(true)
}

function jumpToNode(node: GraphNode) {
  searchText.value = ''
  searchInputEl.value?.blur()
  openEntry(node.id)
}

function jumpToFirstSearchResult() {
  const first = searchResults.value[0]
  if (first) jumpToNode(first)
}

function returnToMap() {
  if (!currentId.value) return
  currentId.value = null
  syncedHoverId.value = null
  trailIds.value = []
  renderer.value?.focusStar(null, { animate: true })
}

const trailEntries = computed(() =>
  trailIds.value.slice(-4).map((id) => ({
    id,
    title: itemMap.get(id)?.title || id,
  })),
)

const currentView = computed<EntryView | null>(() => {
  const id = currentId.value
  if (!id) return null
  const raw = itemMap.get(id)
  if (!raw) return null
  const links = connectedStars.value
  return toEntryView(raw, {
    related: [],
    recommended: [],
    prevId: links[0]?.node.id ?? null,
    nextId: links[1]?.node.id ?? null,
  })
})

function onNavigate(payload: { id: string; from?: string }) {
  openEntry(payload.id)
}

watch(
  () => route.hash,
  (hash) => {
    const id = hash.replace(/^#/, '')
    if (/^[a-f0-9]{8}$/.test(id) && itemMap.has(id)) openEntry(id)
  },
  { immediate: true },
)

function onKey(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA'

  if (e.key === 'Escape') {
    if (categoryMenuOpen.value) { categoryMenuOpen.value = false; return }
    if (typing && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
      return
    }
    if (currentId.value) { returnToMap(); return }
    if (activeCategory.value) { selectCategory(null); return }
    return
  }

  if (typing || e.metaKey || e.ctrlKey || e.altKey) return

  if (e.key === '/') {
    e.preventDefault()
    searchInputEl.value?.focus()
    return
  }
  if (e.key === '0') {
    e.preventDefault()
    fitToView()
    return
  }
  if (e.key === '=' || e.key === '+') {
    e.preventDefault()
    zoomBy(1.25)
    return
  }
  if (e.key === '-') {
    e.preventDefault()
    zoomBy(1 / 1.25)
    return
  }

  if (!currentId.value) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const links = connectedStars.value
  const target = e.key === 'ArrowLeft' ? links[0]?.node.id : links[1]?.node.id
  if (!target) return
  e.preventDefault()
  onNavigate({ id: target })
}

function updateViewportFlags() {
  isMobile.value = window.innerWidth < MOBILE_BP
}

onMounted(() => {
  updateViewportFlags()
  if (canvasEl.value && wrapEl.value) {
    const ctrl = createWordGraphCanvas(canvasEl.value, wrapEl.value, {
      onHoverChange(node) {
        hovered.value = node
      },
      onSelect(node) {
        openEntry(node.id)
      },
      onBackgroundClick() {
        returnToMap()
      },
    })
    ctrl.resize(false)
    renderer.value = ctrl
  }
  scheduleBuild()
  if (typeof ResizeObserver !== 'undefined' && wrapEl.value) {
    resizeObserver = new ResizeObserver(() => {
      updateViewportFlags()
      renderer.value?.resize(true)
      if (currentId.value && selectedIndex.value !== null) {
        focusSelectedOnCanvas(false)
      }
    })
    resizeObserver.observe(wrapEl.value)
  }
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleTask)
  else window.clearTimeout(idleTask)
  resizeObserver?.disconnect()
  resizeObserver = null
  renderer.value?.destroy()
  renderer.value = null
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="cosmos-shell" :class="{ 'has-inspector': !!currentView }">
    <!-- ── 全屏无限宇宙天幕画布（点击词条亦保持完整星图，无分割、无流程图）── -->
    <div ref="wrapEl" class="cosmos-canvas-pane">
      <canvas
        ref="canvasEl"
        class="cosmos-canvas"
        @pointerdown="categoryMenuOpen = false"
      />

      <!-- 顶部左：克制单行极简指令条 -->
      <header class="cosmos-hud-tl">
        <div class="cosmos-bar">
          <button
            v-if="currentView"
            type="button"
            class="cosmos-back"
            @click="returnToMap"
          >
            <ArrowLeft :size="13" :stroke-width="1.9" />
            <span>{{ t('wordsBackToMap') }}</span>
          </button>
          <router-link v-else to="/home" class="cosmos-brand">词条星图</router-link>

          <span class="cosmos-sep" aria-hidden="true">/</span>

          <div class="cosmos-search">
            <Search :size="12" :stroke-width="1.8" class="cosmos-search-ico" aria-hidden="true" />
            <input
              ref="searchInputEl"
              v-model="searchText"
              class="cosmos-search-input"
              type="text"
              inputmode="search"
              enterkeyhint="search"
              :placeholder="t('wordsSearch')"
              :aria-label="t('wordsSearch')"
              @keydown.enter.prevent="jumpToFirstSearchResult"
            />
            <span v-if="searchText" class="cosmos-match-count tabular-nums">{{ matched.size }}</span>
            <button
              v-if="searchText"
              type="button"
              class="cosmos-clear"
              :aria-label="t('close')"
              @click="searchText = ''"
            >
              <X :size="12" :stroke-width="2" />
            </button>
          </div>

          <template v-if="!currentView">
            <div class="cosmos-cat-wrap" :class="{ 'is-active': !!activeCategory || categoryMenuOpen }">
              <button
                type="button"
                class="cosmos-cat-trigger"
                @click="categoryMenuOpen = !categoryMenuOpen"
              >
                <span
                  class="cosmos-diamond"
                  :class="{ 'cosmos-diamond--all': !activeCategoryMeta }"
                  :style="activeCategoryMeta ? { backgroundColor: activeCategoryMeta.color } : undefined"
                />
                <span class="cosmos-cat-label">{{ activeCategory ?? t('wordsAllCategories') }}</span>
              </button>
              <button
                v-if="activeCategory"
                type="button"
                class="cosmos-cat-reset"
                :aria-label="t('clearAll')"
                @click="selectCategory(null)"
              >
                <X :size="11" :stroke-width="2" />
              </button>
            </div>
          </template>

          <nav v-else-if="trailEntries.length > 1" class="cosmos-trail" :aria-label="t('trailNav')">
            <template v-for="(step, idx) in trailEntries" :key="step.id">
              <span v-if="idx > 0" class="cosmos-trail-sep" aria-hidden="true">›</span>
              <button
                v-if="step.id !== currentId"
                type="button"
                class="cosmos-trail-link"
                @click="openEntry(step.id)"
              >
                {{ step.title }}
              </button>
              <span v-else class="cosmos-trail-cur">{{ step.title }}</span>
            </template>
          </nav>
        </div>

        <!-- 分类浮动面板 -->
        <div v-if="!currentView && categoryMenuOpen && categories.length" class="cosmos-cat-panel">
          <button
            type="button"
            class="cosmos-cat-item"
            :class="{ 'is-on': !activeCategory }"
            @click="selectCategory(null)"
          >
            <span class="cosmos-diamond cosmos-diamond--all" />
            <span class="cosmos-cat-name">{{ t('wordsAllCategories') }}</span>
            <span class="cosmos-cat-num tabular-nums">{{ graph?.nodes.length ?? 0 }}</span>
          </button>
          <button
            v-for="cat in categories"
            :key="cat.category"
            type="button"
            class="cosmos-cat-item"
            :class="{ 'is-on': activeCategory === cat.category }"
            @click="selectCategory(cat.category)"
          >
            <span class="cosmos-diamond" :style="{ backgroundColor: cat.color }" />
            <span class="cosmos-cat-name">{{ cat.category }}</span>
            <span class="cosmos-cat-num tabular-nums">{{ cat.count }}</span>
          </button>
        </div>

        <!-- 搜索结果下拉 -->
        <ul v-else-if="searchResults.length" class="cosmos-results">
          <li v-for="node in searchResults" :key="node.id">
            <button type="button" class="cosmos-result" @click="jumpToNode(node)">
              <span class="cosmos-diamond" :style="{ backgroundColor: node.color }" />
              <span class="cosmos-result-title">{{ node.title }}</span>
              <span class="cosmos-result-cat tabular-nums">{{ node.tier || node.category }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="searchText.trim()" class="cosmos-empty-tip">{{ t('wordsNoMatch') }}</p>
      </header>

      <!-- 底部左：悬停星体观测读数（dev 模式追加展示全量提取关键词） -->
      <div v-if="hovered" class="cosmos-hud-bl" aria-live="polite">
        <div class="cosmos-inspector">
          <span class="cosmos-diamond" :style="{ backgroundColor: hovered.color }" />
          <span class="cosmos-inspector-title">{{ hovered.title }}</span>
          <span v-if="hovered.tier" class="cosmos-inspector-sep" aria-hidden="true">·</span>
          <span v-if="hovered.tier" class="cosmos-inspector-meta tabular-nums">{{ hovered.tier }}</span>
          <span class="cosmos-inspector-sep" aria-hidden="true">·</span>
          <span class="cosmos-inspector-meta">{{ hovered.category }}</span>
          <span class="cosmos-inspector-sep" aria-hidden="true">·</span>
          <span class="cosmos-inspector-meta tabular-nums">{{ hoveredNeighborCountText }}</span>
        </div>
        <div v-if="hoveredDevKeywords.length" class="cosmos-dev-hover-kws">
          <span v-for="grp in hoveredDevKeywords" :key="grp.kind" class="cosmos-dev-kw-group">
            <span class="cosmos-dev-kw-kind">{{ grp.kind }}</span>
            <span>{{ grp.items.join(' · ') }}</span>
          </span>
        </div>
      </div>

      <!-- 底部右：透明幽灵缩放控制 -->
      <div class="cosmos-hud-br">
        <button type="button" class="cosmos-tool" :aria-label="t('wordsZoomIn')" :title="t('wordsZoomIn')" @click="zoomBy(1.28)">
          <ZoomIn :size="14" :stroke-width="1.6" />
        </button>
        <button type="button" class="cosmos-tool" :aria-label="t('wordsZoomOut')" :title="t('wordsZoomOut')" @click="zoomBy(1 / 1.28)">
          <ZoomOut :size="14" :stroke-width="1.6" />
        </button>
        <button type="button" class="cosmos-tool" :aria-label="t('wordsFit')" :title="t('wordsFit')" @click="fitToView()">
          <LocateFixed :size="14" :stroke-width="1.6" />
        </button>
      </div>
    </div>

    <!-- ── 悬浮暗星曜半透明透视卡（保留全屏星图原生交互，支持点击空白退场）── -->
    <Transition name="cosmos-panel">
      <aside v-if="currentView" class="cosmos-panel" aria-label="星标详情">
      <header class="cosmos-panel-head">
        <div class="cosmos-panel-title-wrap">
          <span class="cosmos-diamond cosmos-diamond--lg" :style="{ backgroundColor: currentView.categoryColor }" />
          <button
            type="button"
            class="cosmos-panel-title"
            :title="t('copyTitle')"
            @click="copyTitle(currentView.title)"
          >
            <MirrorText :text="titleCopied ? t('titleCopied') : currentView.title" />
          </button>
          <EntrySearchButton :title="currentView.title" />
        </div>

        <div class="cosmos-panel-actions-top">
          <button
            v-if="currentView.prevId"
            type="button"
            class="cosmos-head-btn"
            :title="t('prevEntry')"
            :aria-label="t('prevEntry')"
            @click="onNavigate({ id: currentView.prevId! })"
          >
            <ChevronLeft :size="15" :stroke-width="1.8" />
          </button>
          <button
            v-if="currentView.nextId"
            type="button"
            class="cosmos-head-btn"
            :title="t('nextEntry')"
            :aria-label="t('nextEntry')"
            @click="onNavigate({ id: currentView.nextId! })"
          >
            <ChevronRight :size="15" :stroke-width="1.8" />
          </button>
          <button
            type="button"
            class="cosmos-head-btn"
            :title="t('close')"
            :aria-label="t('close')"
            @click="returnToMap"
          >
            <X :size="14" :stroke-width="1.9" />
          </button>
        </div>
      </header>

      <div class="cosmos-panel-scroll">
        <V2EntryBody :item="currentView" layout="card" @navigate="onNavigate" @comment-el="setCommentEl" />

        <div v-if="currentDevEntities" class="cosmos-dev-entities">
          <div v-if="currentDevEntities.places.length" class="cosmos-dev-row">
            <span class="cosmos-dev-label">地名</span>
            <span class="cosmos-dev-vals">{{ currentDevEntities.places.join(' · ') }}</span>
          </div>
          <div v-if="currentDevEntities.times.length" class="cosmos-dev-row">
            <span class="cosmos-dev-label">时间</span>
            <span class="cosmos-dev-vals">{{ currentDevEntities.times.join(' · ') }}</span>
          </div>
          <div v-if="currentDevEntities.nouns.length" class="cosmos-dev-row">
            <span class="cosmos-dev-label">名词</span>
            <span class="cosmos-dev-vals">{{ currentDevEntities.nouns.join(' · ') }}</span>
          </div>
          <div v-if="currentDevEntities.platforms.length" class="cosmos-dev-row">
            <span class="cosmos-dev-label">平台</span>
            <span class="cosmos-dev-vals">{{ currentDevEntities.platforms.join(' · ') }}</span>
          </div>
          <p v-if="!currentDevEntities.places.length && !currentDevEntities.times.length && !currentDevEntities.nouns.length && !currentDevEntities.platforms.length" class="cosmos-dev-empty">
            未提取到实体关键词
          </p>
        </div>
        <p v-else-if="currentEntitySummary" class="cosmos-entity-line">
          {{ currentEntitySummary }}
        </p>

        <section class="cosmos-links-sec">
          <h3 class="cosmos-links-head">
            <span>{{ t('wordsConnectedStars') }}</span>
            <span class="tabular-nums">{{ connectedStars.length }}</span>
          </h3>

          <p v-if="connectedStars.length === 0" class="cosmos-links-empty">
            {{ t('wordsNoLinks') }}
          </p>

          <ul v-else class="cosmos-links-list">
            <li v-for="entry in connectedStars" :key="entry.node.id">
              <button
                type="button"
                class="cosmos-link-row"
                :class="{ 'is-explicit': entry.explicit }"
                @mouseenter="syncedHoverId = entry.node.id"
                @mouseleave="syncedHoverId = null"
                @click="openEntry(entry.node.id)"
              >
                <span class="cosmos-diamond" :style="{ backgroundColor: entry.node.color }" />
                <span class="cosmos-link-title"><MirrorText :text="entry.node.title" /></span>
                <span class="cosmos-link-reason tabular-nums">{{ entry.reasonText }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>

        <footer class="cosmos-panel-foot">
          <V2EntryActions :item="currentView" layout="card" @navigate="onNavigate" />
        </footer>
      </aside>
    </Transition>
  </main>
</template>

<style scoped>
.cosmos-shell {
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: radial-gradient(ellipse at 44% 46%, #060b18 0%, #03060d 62%, #020307 100%);
  color: var(--white-92);
}

.cosmos-canvas-pane {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.cosmos-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
.cosmos-canvas:active { cursor: grabbing; }

/* ── 顶部左：单行极简指令条 ── */
.cosmos-hud-tl {
  position: absolute;
  top: 1.05rem;
  left: 1.35rem;
  right: 1.35rem;
  z-index: 15;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.48rem;
}

.cosmos-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.72rem;
  pointer-events: auto;
  max-width: 100%;
}

.cosmos-brand {
  color: var(--white-80);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.1em;
  white-space: nowrap;
  transition: color 0.15s;
}
.cosmos-brand:hover { color: #fff; }

.cosmos-back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 28px;
  padding: 0 0.45rem 0 0.25rem;
  border: none;
  border-bottom: 1px solid rgba(255, 178, 92, 0.45);
  background: none;
  color: rgba(255, 214, 168, 0.92);
  font-size: var(--font-xs);
  font-weight: 500;
  letter-spacing: 0.03em;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.16s, color 0.16s;
}
.cosmos-back:hover {
  border-bottom-color: rgba(255, 198, 128, 0.95);
  color: #fff;
}

.cosmos-sep {
  color: var(--white-12);
  font-size: 12px;
  user-select: none;
}

.cosmos-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: min(176px, calc(100vw - 3rem));
  height: 26px;
  padding: 0 0.1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--white-40);
  transition: border-color 0.18s, color 0.18s, width 0.2s;
}
.cosmos-search:focus-within {
  width: min(220px, calc(100vw - 3rem));
  border-bottom-color: rgba(255, 186, 108, 0.65);
  color: var(--white-92);
}
.cosmos-search-ico { flex: none; opacity: 0.68; }
.cosmos-search-input {
  flex: 1 1 auto;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--white-92);
  font-size: var(--font-xs);
  letter-spacing: 0.02em;
}
.cosmos-search-input::placeholder { color: var(--white-24); }

.cosmos-match-count {
  font-size: var(--font-micro);
  color: rgba(255, 186, 108, 0.9);
}
.cosmos-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  color: var(--white-42);
  cursor: pointer;
}
.cosmos-clear:hover { color: #fff; }

.cosmos-cat-wrap {
  display: inline-flex;
  align-items: center;
  height: 26px;
  border-bottom: 1px solid transparent;
  color: var(--white-45);
  transition: color 0.15s, border-color 0.15s;
}
.cosmos-cat-wrap:hover { color: var(--white-92); }
.cosmos-cat-wrap.is-active {
  color: #fff;
  border-bottom-color: rgba(255, 186, 108, 0.72);
}
.cosmos-cat-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  height: 100%;
  padding: 0 0.15rem;
  border: none;
  background: none;
  color: inherit;
  font-size: var(--font-xs);
  white-space: nowrap;
  cursor: pointer;
}
.cosmos-cat-label {
  max-width: 8.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cosmos-cat-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 0.2rem;
  border: none;
  background: none;
  color: var(--white-42);
  cursor: pointer;
}
.cosmos-cat-reset:hover { color: #fff; }

.cosmos-trail {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 26px;
  font-size: var(--font-tiny);
  overflow: hidden;
}
.cosmos-trail-sep { color: var(--white-20); }
.cosmos-trail-link {
  border: none;
  background: none;
  padding: 0;
  color: var(--white-42);
  font-size: inherit;
  cursor: pointer;
  max-width: 7.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.14s;
}
.cosmos-trail-link:hover { color: #fff; }
.cosmos-trail-cur {
  color: rgba(255, 214, 168, 0.94);
  font-weight: 500;
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cosmos-cat-panel {
  pointer-events: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(136px, 1fr));
  gap: 0.12rem;
  width: min(344px, calc(100vw - 2.5rem));
  max-height: 52vh;
  overflow-y: auto;
  padding: 0.42rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(4, 7, 14, 0.92);
  backdrop-filter: blur(20px);
}
.cosmos-cat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.52rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--white-65);
  font-size: var(--font-xs);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.cosmos-cat-item:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }
.cosmos-cat-item.is-on { background: rgba(255, 178, 92, 0.1); color: #fff; font-weight: 600; }
.cosmos-cat-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cosmos-cat-num { font-size: var(--font-micro); color: var(--white-32); }

.cosmos-results {
  pointer-events: auto;
  width: min(308px, calc(100vw - 2.5rem));
  max-height: 44vh;
  overflow-y: auto;
  margin: 0;
  padding: 0.35rem;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(4, 7, 14, 0.92);
  backdrop-filter: blur(20px);
}
.cosmos-result {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.42rem 0.52rem;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  color: var(--white-75);
  font-size: var(--font-xs);
  transition: background 0.12s, color 0.12s;
}
.cosmos-result:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.cosmos-result-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cosmos-result-cat { flex: 0 0 auto; color: var(--white-35); font-size: var(--font-micro); }

.cosmos-empty-tip {
  pointer-events: auto;
  margin: 0;
  padding: 0.35rem 0.65rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: var(--font-xs);
  color: var(--white-45);
}

.cosmos-diamond {
  width: 5px;
  height: 5px;
  border-radius: 1px;
  transform: rotate(45deg);
  flex: none;
}
.cosmos-diamond--lg { width: 7px; height: 7px; }
.cosmos-diamond--all {
  background: linear-gradient(135deg, #ffd8ab 0%, #98cbff 100%);
}

/* ── 底部左：悬停星体观测读数 ── */
.cosmos-hud-bl {
  position: absolute;
  left: 1.35rem;
  bottom: 1.05rem;
  z-index: 12;
  pointer-events: none;
  max-width: calc(100% - 12rem);
}
.cosmos-inspector {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
  font-size: var(--font-xs);
  text-shadow: 0 1px 12px rgba(2, 4, 10, 0.96);
}
.cosmos-inspector-title { font-weight: 600; color: var(--white-95); letter-spacing: 0.02em; }
.cosmos-inspector-sep { color: var(--white-20); }
.cosmos-inspector-meta { color: var(--white-55); font-size: var(--font-tiny); }

/* ── 底部右：幽灵无框缩放图标 ── */
.cosmos-hud-br {
  position: absolute;
  right: 1.15rem;
  bottom: 0.9rem;
  z-index: 12;
  display: flex;
  gap: 0.2rem;
  opacity: 0.38;
  transition: opacity 0.2s ease, right 0.42s cubic-bezier(0.22, 1, 0.36, 1), bottom 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.cosmos-hud-br:hover { opacity: 0.96; }
.cosmos-shell.has-inspector .cosmos-hud-br {
  right: calc(min(376px, 33vw) + 2rem);
}
.cosmos-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: var(--white-80);
  cursor: pointer;
  transition: color 0.14s, transform 0.14s;
}
.cosmos-tool:hover {
  color: #fff;
  transform: scale(1.08);
}

/* ── 悬浮暗星曜半透明透视卡 ── */
.cosmos-panel {
  position: absolute;
  top: 3.8rem;
  right: 1.25rem;
  bottom: 1.15rem;
  width: min(376px, 33vw);
  z-index: 14;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 6px;
  background: rgba(4, 7, 14, 0.66);
  backdrop-filter: blur(22px);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.cosmos-panel-enter-active {
  transition: opacity 0.38s cubic-bezier(0.22, 1, 0.36, 1), transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
.cosmos-panel-leave-active {
  transition: opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1), transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.cosmos-panel-enter-from,
.cosmos-panel-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

.cosmos-panel-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.78rem 1rem 0.72rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.cosmos-panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.58rem;
  min-width: 0;
}
.cosmos-panel-title {
  background: none;
  border: none;
  padding: 0;
  color: var(--white-95);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cosmos-panel-title:hover { color: #fff; }

.cosmos-panel-actions-top {
  display: flex;
  align-items: center;
  gap: 0.18rem;
  flex: none;
}
.cosmos-head-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--white-55);
  cursor: pointer;
  transition: color 0.14s, border-color 0.14s, background 0.14s;
}
.cosmos-head-btn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
}

.cosmos-panel-scroll {
  flex: 1 1 0%;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  overflow-y: auto;
  overflow-x: clip;
  padding: 0.9rem 1.05rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  box-sizing: border-box;
}
.cosmos-panel-scroll > * {
  min-width: 0;
  max-width: 100%;
}
.cosmos-panel-scroll :deep(.tip-anchor:not(.open) .tip-bubble) {
  display: none;
}
.cosmos-panel-scroll :deep(.v2entry-body),
.cosmos-panel-scroll :deep(.v2entry-desc),
.cosmos-panel-scroll :deep(.rt),
.cosmos-panel-scroll :deep(.meta-row),
.cosmos-panel-scroll :deep(.v2entry-links),
.cosmos-panel-scroll :deep(.v2entry-linklist),
.cosmos-panel-scroll :deep(.v2entry-sec),
.cosmos-panel-scroll :deep(.v2reading-head),
.cosmos-panel-scroll :deep(.v2reading-note) {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.cosmos-panel-scroll :deep(.meta-item) {
  max-width: 100%;
}
.cosmos-panel-scroll :deep(.meta-chip) {
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
}
.cosmos-panel-scroll :deep(pre),
.cosmos-panel-scroll :deep(code),
.cosmos-panel-scroll :deep(table) {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
}

.cosmos-entity-line {
  margin: 0;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(186, 214, 248, 0.62);
  overflow-wrap: anywhere;
}


.cosmos-dev-entities {
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  min-width: 0;
  max-width: 100%;
}
.cosmos-dev-row {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  font-size: 11px;
  line-height: 1.5;
  min-width: 0;
  max-width: 100%;
}
.cosmos-dev-label {
  flex: none;
  color: rgba(255, 198, 134, 0.72);
  font-size: 10.5px;
  letter-spacing: 0.06em;
}
.cosmos-dev-vals {
  min-width: 0;
  max-width: 100%;
  color: rgba(196, 222, 255, 0.85);
  overflow-wrap: anywhere;
  word-break: break-word;
}
.cosmos-dev-empty {
  margin: 0;
  font-size: 11px;
  color: var(--white-32);
}

.cosmos-dev-hover-kws {
  margin-top: 0.22rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem 0.68rem;
  font-size: 10.5px;
  color: rgba(190, 218, 252, 0.78);
  text-shadow: 0 1px 10px rgba(2, 4, 10, 0.96);
}
.cosmos-dev-kw-group {
  display: inline-flex;
  align-items: baseline;
  gap: 0.32rem;
}
.cosmos-dev-kw-kind {
  color: rgba(255, 194, 122, 0.76);
}

.cosmos-links-sec {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.cosmos-links-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--white-45);
}
.cosmos-links-empty {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--white-35);
}
.cosmos-links-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}
.cosmos-link-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0.38rem 0.45rem;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--white-80);
  text-align: left;
  cursor: pointer;
  transition: background 0.13s, border-color 0.13s, color 0.13s;
}
.cosmos-link-row:hover {
  background: rgba(255, 178, 92, 0.08);
  border-color: rgba(255, 178, 92, 0.28);
  color: #fff;
}
.cosmos-link-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--font-xs);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cosmos-link-reason {
  flex: 0 1 auto;
  max-width: min(8.5rem, 38%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--white-38);
}
.cosmos-link-row.is-explicit .cosmos-link-reason {
  color: rgba(255, 190, 118, 0.88);
}

.cosmos-panel-foot {
  flex: none;
  padding: 0.52rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

@media (max-width: 1023px) {
  .cosmos-panel {
    top: auto;
    left: 0.65rem;
    right: 0.65rem;
    bottom: 0.65rem;
    width: auto;
    max-height: 49dvh;
  }
  .cosmos-panel-enter-from,
  .cosmos-panel-leave-to {
    opacity: 0;
    transform: translateY(18px);
  }
  .cosmos-shell.has-inspector .cosmos-hud-br {
    right: 0.8rem;
    bottom: calc(49dvh + 1.1rem);
  }
  .cosmos-shell.has-inspector .cosmos-hud-bl {
    display: none;
  }
  .cosmos-link-row {
    min-height: 40px;
  }
}

@media (max-width: 640px) {
  .cosmos-hud-tl { top: 0.85rem; left: 0.9rem; right: 0.9rem; }
  .cosmos-hud-bl { left: 0.9rem; bottom: 0.85rem; max-width: calc(100% - 8.5rem); }
  .cosmos-hud-br { right: 0.8rem; bottom: 0.75rem; }
  .cosmos-trail, .cosmos-sep { display: none; }
  .cosmos-cat-panel { grid-template-columns: 1fr; }
  .cosmos-tool { width: 32px; height: 32px; }
}
</style>
