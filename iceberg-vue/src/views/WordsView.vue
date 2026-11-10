<script setup lang="ts">
// 词条星图：把 1461 条词条按「同分类 / 共标签」的关系摊在一张无限画布上。
//
// 为什么用 canvas 而不是 DOM：主图曾因为一次性创建 1461 个 .iceberg-item 节点
// 造成 400ms+ 的单帧卡顿（实测最差帧 550ms）。星图节点更多（1461 个点 + 数千条边），
// 走 DOM 必然重演那一次。
//
// 为什么自己写力导向：项目没有 d3 依赖；这里只需要斥力 / 弹簧 / 向心三股力，
// 自己写能按帧推进（图形是「长出来」的，不阻塞首屏），也能保证同一份数据每次打开一致。
//
// 弹窗复用：点节点后直接用 V2EntryCard（桌面）/ V2Sheet（移动），
// 与主图完全同一套内容与交互（评论、收藏、关联词条、←/→ 切换）。
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search, LocateFixed, ZoomIn, ZoomOut, X } from '@lucide/vue'
import { useI18n } from '../lib/useI18n'
import { useIcebergDataSource } from '../lib/iceberg/useIcebergDataSource'
import { toEntryView, MOBILE_BP, type EntryView } from '../lib/iceberg/entryView'
import {
  buildGraph,
  createLayout,
  graphBounds,
  adjacencyOf,
  type GraphNode,
  type WordGraph,
  type LayoutEngine,
} from '../lib/iceberg/wordGraph'
import V2EntryCard from '../components/v2/V2EntryCard.vue'
import V2Sheet from '../components/v2/V2Sheet.vue'
import DevShell from '../components/dev/DevShell.vue'

const { t } = useI18n()
const route = useRoute()
const { allItemsRaw, data } = useIcebergDataSource()

/** DEV 顶栏那句说明：说清「这些线是怎么连出来的」，省得每次都要翻代码 */
const subtitle = `${allItemsRaw.length} 条词条 · 同分类 / 副分类 / 共标签连边 · 点节点开详情，←/→ 走邻居`

const itemMap = new Map(allItemsRaw.map((i) => [i.id, i]))

const canvasEl = ref<HTMLCanvasElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
const graph = shallowRef<WordGraph | null>(null)
const adj = shallowRef<Map<number, number[]> | null>(null)
const layout = shallowRef<LayoutEngine | null>(null)
const phase = ref<'building' | 'settling' | 'ready'>('building')
const progress = ref(0)

const searchText = ref('')
const matched = ref<Set<number>>(new Set())
const hovered = ref<GraphNode | null>(null)
const hoverPos = ref({ x: 0, y: 0 })
const currentId = ref<string | null>(null)
const isMobile = ref(false)

/** 视口变换：世界坐标 → 屏幕坐标 */
const view = { scale: 1, ox: 0, oy: 0 }
let dpr = 1
let raf = 0
let fitRaf = 0
let layoutRaf = 0
let idleTask = 0
let resizeObserver: ResizeObserver | null = null

const nodeIndex = computed(() => {
  const g = graph.value
  return g ? g.index : new Map<string, number>()
})

/** 搜索：标题子串匹配（大小写无关）。中文标题没有分词，子串是最直观的做法。 */
watch(searchText, (q) => {
  const g = graph.value
  if (!g) { matched.value = new Set(); return }
  const key = q.trim().toLowerCase()
  if (!key) { matched.value = new Set(); return }
  const set = new Set<number>()
  for (let i = 0; i < g.nodes.length; i++) {
    if (g.nodes[i]!.title.toLowerCase().includes(key)) set.add(i)
  }
  matched.value = set
  requestDraw()
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

// ── 建图 ──────────────────────────────────────────────────────
// 放在空闲回调里：建图要算 1461 次候选打分，同步做会压在首屏那一帧上。
function build() {
  const source = allItemsRaw.map((it) => ({
    id: it.id,
    title: it.title,
    category: it.category,
    categories: it.categories,
    tags: it.tags,
    tier: it.tier,
  }))
  const g = buildGraph(source, {
    colorOf: (it) => data.categoryColors[it.category] || data.defaultColor,
  })
  graph.value = g
  adj.value = adjacencyOf(g)
  layout.value = createLayout(g)
  phase.value = 'settling'
  runLayout()
}

function scheduleBuild() {
  if (typeof requestIdleCallback === 'function') {
    idleTask = requestIdleCallback(() => build(), { timeout: 1500 })
  } else {
    idleTask = window.setTimeout(build, 60)
  }
}

/** 力导向按帧推进：每帧几轮，图形逐步收敛 */
function runLayout() {
  const engine = layout.value
  if (!engine) return
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const perFrame = reduced ? 24 : 2
  const tick = () => {
    const e = layout.value
    if (!e) return
    let alive = true
    for (let i = 0; i < perFrame && alive; i++) alive = e.step()
    progress.value = e.progress()
    if (!alive || e.energy() < 400) {
      phase.value = 'ready'
      progress.value = 1
      // 收敛后再取景：布局过程中节点一直在动，提前 fit 会取到还没摊开的包围盒
      fitToView(true)
      return
    }
    requestDraw()
    layoutRaf = requestAnimationFrame(tick)
  }
  layoutRaf = requestAnimationFrame(tick)
}

// ── 绘制 ──────────────────────────────────────────────────────
function resize() {
  const canvas = canvasEl.value
  const wrap = wrapEl.value
  if (!canvas || !wrap) return
  const rect = wrap.getBoundingClientRect()
  dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  requestDraw()
}

function requestDraw() {
  if (raf) return
  raf = requestAnimationFrame(draw)
}

function draw() {
  raf = 0
  const canvas = canvasEl.value
  const g = graph.value
  if (!canvas || !g) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width / dpr
  const h = canvas.height / dpr

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const { scale, ox, oy } = view
  const toScreenX = (x: number) => x * scale + ox
  const toScreenY = (y: number) => y * scale + oy
  const margin = 60
  // 屏幕 → 世界：world * scale + offset = screen，所以可见世界区间要减去 offset
  const minX = (-margin - ox) / scale
  const maxX = (w + margin - ox) / scale
  const minY = (-margin - oy) / scale
  const maxY = (h + margin - oy) / scale

  // 边：先画，压在节点下面
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  for (const edge of g.edges) {
    const a = g.nodes[edge.a]!
    const b = g.nodes[edge.b]!
    if (a.x < minX || a.x > maxX || a.y < minY || a.y > maxY) {
      if (b.x < minX || b.x > maxX || b.y < minY || b.y > maxY) continue
    }
    ctx.moveTo(toScreenX(a.x), toScreenY(a.y))
    ctx.lineTo(toScreenX(b.x), toScreenY(b.y))
  }
  ctx.stroke()

  // 节点
  const hasMatch = matched.value.size > 0
  for (let i = 0; i < g.nodes.length; i++) {
    const node = g.nodes[i]!
    if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY) continue
    const r = (2 + Math.min(4, node.degree * 0.45)) * Math.max(0.7, Math.min(1.6, scale))
    const isMatch = hasMatch && matched.value.has(i)
    if (isMatch) {
      ctx.fillStyle = 'rgba(255,106,6,0.95)'
      ctx.beginPath()
      ctx.arc(toScreenX(node.x), toScreenY(node.y), r + 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = node.color
    ctx.globalAlpha = hasMatch && !isMatch ? 0.22 : 0.9
    ctx.beginPath()
    ctx.arc(toScreenX(node.x), toScreenY(node.y), r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 标签：缩放够大才画，且只给度数高或有命中的节点画 —— 否则 1461 个标签糊成一片。
  // 再加一道重叠剔除：标签之间互相压住时先画度数高的，后面的直接跳过。
  const showLabels = scale > 0.62
  if (showLabels) {
    ctx.font = '11px "Noto Sans SC", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    const boxes: Array<[number, number, number, number]> = []
    const LABEL_MAX = 120
    // 度数高的先画
    const order = g.nodes
      .map((n, i) => i)
      .filter((i) => {
        const n = g.nodes[i]!
        if (n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) return false
        return matched.value.has(i) || n.degree >= 6
      })
      .sort((a, b) => {
        const ma = matched.value.has(a) ? 1 : 0
        const mb = matched.value.has(b) ? 1 : 0
        if (ma !== mb) return mb - ma
        return g.nodes[b]!.degree - g.nodes[a]!.degree
      })
    for (const i of order) {
      if (boxes.length >= LABEL_MAX) break
      const node = g.nodes[i]!
      const isMatch = matched.value.has(i)
      const sx = toScreenX(node.x) + 5
      const sy = toScreenY(node.y)
      const tw = ctx.measureText(node.title).width
      const box: [number, number, number, number] = [sx - 3, sy - 8, tw + 6, 16]
      let clash = false
      for (const b of boxes) {
        if (box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1]) {
          clash = true
          break
        }
      }
      if (clash) continue
      boxes.push(box)
      ctx.fillStyle = isMatch ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.42)'
      ctx.fillText(node.title, sx, sy)
    }
  }

  // 悬停节点的标题（画布上没有 title 属性，只能自己画）
  if (hovered.value) {
    ctx.font = '12px "Noto Sans SC", system-ui, sans-serif'
    const text = hovered.value.title
    const tw = ctx.measureText(text).width
    const x = Math.min(hoverPos.value.x + 12, w - tw - 16)
    const y = hoverPos.value.y - 14
    ctx.fillStyle = 'rgba(12,12,14,0.9)'
    ctx.fillRect(x - 6, y - 10, tw + 12, 20)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }
}

// ── 视图操作 ──────────────────────────────────────────────────
function fitToView(animate = true) {
  const g = graph.value
  const canvas = canvasEl.value
  if (!g || !canvas) return
  const b = graphBounds(g)
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const bw = Math.max(1, b.maxX - b.minX)
  const bh = Math.max(1, b.maxY - b.minY)
  const scale = Math.min(w / bw, h / bh) * 0.86
  const target = { scale, ox: w / 2 - ((b.minX + b.maxX) / 2) * scale, oy: h / 2 - ((b.minY + b.maxY) / 2) * scale }
  if (!animate) {
    view.scale = target.scale
    view.ox = target.ox
    view.oy = target.oy
    requestDraw()
    return
  }
  // 动画用自己的句柄：与 draw 的 rAF 槽分开，否则两者互相抢占 ——
  // 动画帧里 requestDraw 看到 raf 已被占（正是动画自己）就直接跳过，draw 永远排不上，
  // 结果视口停在初始值（图形堆在左上角）。
  const from = { scale: view.scale, ox: view.ox, oy: view.oy }
  const t0 = performance.now()
  const dur = 420
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3)
    view.scale = from.scale + (target.scale - from.scale) * e
    view.ox = from.ox + (target.ox - from.ox) * e
    view.oy = from.oy + (target.oy - from.oy) * e
    draw()
    if (k < 1) fitRaf = requestAnimationFrame(tick)
  }
  fitRaf = requestAnimationFrame(tick)
}

function zoomBy(factor: number, cx?: number, cy?: number) {
  const canvas = canvasEl.value
  if (!canvas) return
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const px = cx ?? w / 2
  const py = cy ?? h / 2
  const next = Math.max(0.12, Math.min(6, view.scale * factor))
  const k = next / view.scale
  view.ox = px - (px - view.ox) * k
  view.oy = py - (py - view.oy) * k
  view.scale = next
  requestDraw()
}

/** 把某个节点移到视口中心 */
function centerOn(idx: number, targetScale?: number) {
  const g = graph.value
  if (!g) return
  const node = g.nodes[idx]
  if (!node) return
  const canvas = canvasEl.value
  if (!canvas) return
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  if (targetScale) view.scale = targetScale
  view.ox = w / 2 - node.x * view.scale
  view.oy = h / 2 - node.y * view.scale
  requestDraw()
}

function screenToWorld(sx: number, sy: number) {
  return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }
}

function hitTest(sx: number, sy: number): GraphNode | null {
  const g = graph.value
  if (!g) return null
  const { x, y } = screenToWorld(sx, sy)
  const r = 8 / view.scale
  let best: GraphNode | null = null
  let bestD = r
  for (const node of g.nodes) {
    const dx = node.x - x
    const dy = node.y - y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestD) { bestD = d; best = node }
  }
  return best
}

// ── 交互 ──────────────────────────────────────────────────────
let dragging = false
let dragMoved = false
let lastX = 0
let lastY = 0

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  dragMoved = false
  lastX = e.clientX
  lastY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  if (dragging) {
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true
    view.ox += dx
    view.oy += dy
    lastX = e.clientX
    lastY = e.clientY
    requestDraw()
    return
  }
  const node = hitTest(sx, sy)
  hovered.value = node
  hoverPos.value = { x: sx, y: sy }
  requestDraw()
}

function onPointerUp(e: PointerEvent) {
  const wasDragging = dragging
  dragging = false
  if (!wasDragging || dragMoved) return
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return
  const node = hitTest(e.clientX - rect.left, e.clientY - rect.top)
  if (node) openEntry(node.id)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = canvasEl.value?.getBoundingClientRect()
  if (!rect) return
  const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14
  zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top)
}

// ── 词条打开（复用主图的弹窗 / 抽屉）─────────────────────────
const currentView = computed<EntryView | null>(() => {
  const id = currentId.value
  if (!id) return null
  const raw = itemMap.get(id)
  if (!raw) return null
  const idx = nodeIndex.value.get(id)
  const neighbors = idx != null && adj.value ? adj.value.get(idx) || [] : []
  const related = neighbors
    .slice(0, 6)
    .map((i) => graph.value?.nodes[i])
    .filter((n): n is GraphNode => !!n)
    .map((n) => ({ id: n.id, title: n.title }))
  return toEntryView(raw, {
    related,
    recommended: [],
    prevId: neighbors[0] != null ? graph.value?.nodes[neighbors[0]]?.id : null,
    nextId: neighbors[1] != null ? graph.value?.nodes[neighbors[1]]?.id : null,
  })
})

function openEntry(id: string) {
  currentId.value = id
}

function closeEntry() {
  currentId.value = null
}

function onNavigate(payload: { id: string; from?: string }) {
  currentId.value = payload.id
  const idx = nodeIndex.value.get(payload.id)
  if (idx != null) centerOn(idx)
}

// 深链：/words#<8hex> 直接打开该词条（与主图同款 hash 语义）
watch(() => route.hash, (hash) => {
  const id = hash.replace(/^#/, '')
  if (/^[a-f0-9]{8}$/.test(id) && itemMap.has(id)) openEntry(id)
}, { immediate: true })

// 键盘：←/→ 在相邻词条之间走（与弹窗里的 ←/→ 同一语义）
function onKey(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'Escape' && currentId.value) { closeEntry(); return }
  if (!currentId.value) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const idx = nodeIndex.value.get(currentId.value)
  if (idx == null || !adj.value) return
  const neighbors = adj.value.get(idx) || []
  const target = e.key === 'ArrowLeft' ? neighbors[0] : neighbors[1]
  if (target == null) return
  e.preventDefault()
  onNavigate({ id: graph.value!.nodes[target]!.id })
}

onMounted(() => {
  isMobile.value = window.innerWidth < MOBILE_BP
  resize()
  scheduleBuild()
  if (typeof ResizeObserver !== 'undefined' && wrapEl.value) {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(wrapEl.value)
  }
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (fitRaf) cancelAnimationFrame(fitRaf)
  if (layoutRaf) cancelAnimationFrame(layoutRaf)
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleTask)
  else window.clearTimeout(idleTask)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <DevShell title="词条星图" :subtitle="subtitle" layout="fill">
    <div class="words">
      <div class="words-bar">
        <div class="words-search">
          <Search :size="14" :stroke-width="1.8" aria-hidden="true" />
          <input
            v-model="searchText"
            type="search"
            :placeholder="t('wordsSearch')"
            :aria-label="t('wordsSearch')"
          />
          <button v-if="searchText" type="button" class="words-clear" @click="searchText = ''" :aria-label="t('close')">
            <X :size="13" :stroke-width="2" />
          </button>
        </div>
        <div class="words-tools">
          <button type="button" class="words-tool" @click="zoomBy(1.25)" :aria-label="t('wordsZoomIn')" :title="t('wordsZoomIn')">
            <ZoomIn :size="15" :stroke-width="1.8" />
          </button>
          <button type="button" class="words-tool" @click="zoomBy(1 / 1.25)" :aria-label="t('wordsZoomOut')" :title="t('wordsZoomOut')">
            <ZoomOut :size="15" :stroke-width="1.8" />
          </button>
          <button type="button" class="words-tool" @click="fitToView()" :aria-label="t('wordsFit')" :title="t('wordsFit')">
            <LocateFixed :size="15" :stroke-width="1.8" />
          </button>
        </div>
      </div>

      <div ref="wrapEl" class="words-canvas-wrap">
        <canvas
          ref="canvasEl"
          class="words-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointerleave="hovered = null; requestDraw()"
          @wheel="onWheel"
        ></canvas>

        <p v-if="phase !== 'ready'" class="words-status">
          {{ phase === 'building' ? t('wordsBuilding') : t('wordsSettling') }} {{ Math.round(progress * 100) }}%
        </p>
        <p v-else class="words-hint">{{ t('wordsHint') }}</p>

        <ul v-if="searchResults.length" class="words-results">
          <li v-for="node in searchResults" :key="node.id">
            <button
              type="button"
              class="words-result"
              @click="centerOn(nodeIndex.get(node.id) ?? 0, 1.1); openEntry(node.id)"
            >
              <span class="words-dot" :style="{ backgroundColor: node.color }"></span>
              <span class="words-result-title">{{ node.title }}</span>
              <span class="words-result-cat">{{ node.category }}</span>
            </button>
          </li>
        </ul>
        <p v-else-if="searchText.trim()" class="words-status">{{ t('wordsNoMatch') }}</p>
      </div>

      <V2EntryCard v-if="currentView && !isMobile" :item="currentView" @close="closeEntry" @navigate="onNavigate" />
      <V2Sheet v-if="isMobile" :item="currentView" @close="closeEntry" @navigate="onNavigate" />
    </div>
  </DevShell>
</template>

<style scoped>
.words {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 外套 DevShell 的 fill 布局：高度由 .dev-body 决定，自己不再算 100dvh */
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--white-06);
  border-radius: 12px;
  background: var(--color-surface);
}

.words-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid var(--white-06);
}

.words-search {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1 1 auto;
  max-width: 420px;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--white-10);
  border-radius: 999px;
  color: var(--white-40);
}
.words-search:focus-within { border-color: var(--white-25); color: var(--white-70); }
.words-search input {
  flex: 1 1 auto;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--white-85);
  font-size: var(--font-xs);
}
.words-search input::placeholder { color: var(--white-30); }
.words-clear {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: inherit;
  display: flex;
}

.words-tools { display: flex; gap: 0.3rem; }
.words-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: none;
  border: 1px solid var(--white-10);
  border-radius: 8px;
  color: var(--white-50);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.words-tool:hover { color: var(--white-90); border-color: var(--white-25); }
.words-tool:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }

.words-canvas-wrap { position: relative; flex: 1 1 auto; overflow: hidden; }
.words-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
.words-canvas:active { cursor: grabbing; }

.words-status,
.words-hint {
  position: absolute;
  left: 50%;
  bottom: 0.9rem;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-modal-bg) 82%, transparent);
  border: 1px solid var(--white-08);
  font-size: var(--font-tiny);
  letter-spacing: 0.06em;
  color: var(--white-45);
  pointer-events: none;
}

.words-results {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  right: 0.6rem;
  max-width: 380px;
  max-height: 60%;
  overflow-y: auto;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  border: 1px solid var(--white-08);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-modal-bg) 90%, transparent);
  backdrop-filter: blur(10px);
}
.words-result {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.35rem 0.5rem;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  color: var(--white-70);
  font-size: var(--font-xs);
}
.words-result:hover { background: var(--white-06); color: var(--white-92); }
.words-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; }
.words-result-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.words-result-cat { flex: 0 0 auto; color: var(--white-30); font-size: var(--font-micro); }

@media (max-width: 640px) {
  .words-results { max-width: none; }
}
</style>
