import { MIRROR_PHRASE, splitMirror } from '../iceberg/mirror'
import { mulberry32 } from '../iceberg3d/prng'
import type { V3Item } from './keys'

const CAT_CLASS_MAX = 64
export const CAT_SHAPE_COUNT = 15
const DRIFT_SLOTS = 12
const DRIFT_X = [-3, 2, -1, 3, -2, 1, 0, 2, -3, 1, -1, 3]
const DRIFT_Y = [-4, 1, 3, -2, 0, -3, 2, 4, -1, 2, -4, 1]

const categoryShapeCache = new WeakMap<Record<string, string>, Map<string, number>>()

export function buildCategoryShapeMap(categoryColors: Record<string, string>): Map<string, number> {
  const cached = categoryShapeCache.get(categoryColors)
  if (cached) return cached
  const map = new Map<string, number>()
  let idx = 0
  for (const name of Object.keys(categoryColors)) {
    map.set(name, idx % CAT_SHAPE_COUNT)
    idx++
  }
  categoryShapeCache.set(categoryColors, map)
  return map
}

export function hashSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface WallTier {
  name: string
  el: HTMLElement
  cloudEl: HTMLElement
  emptyEl: HTMLElement
  start: number
  end: number
}

export interface WallHandles {
  els: HTMLElement[]
  ids: string[]
  items: V3Item[]
  indexOf: Map<string, number>
  tiers: WallTier[]
  catClass: Map<string, string>
  scatter: boolean
  destroy(): void
}

export interface BuildOptions {
  tiers: Array<{ name: string; items: V3Item[] }>
  categoryColors: Record<string, string>
  drift: boolean
  scatter?: boolean
  colorblind?: boolean
  tierEmptyText?: string
  initialTiers?: number
  readIds?: Set<string>
  favIds?: Set<string>
  showRead?: boolean
  showNew?: boolean
  newCutoff?: number
  matched?: Set<string> | null
  filterMode?: 'hide' | 'dim'
  onTierMounted?: (tier: WallTier, h: WallHandles) => void
}

export interface WallBuilder {
  handles: WallHandles
  flush(): void
  cancel(): void
  destroy(): void
  setTierEmptyText(text: string): void
  setInitialFilter(matched: Set<string> | null, mode: 'hide' | 'dim'): void
  setInitialMarks(opts: { readIds?: Set<string>; favIds?: Set<string>; showRead?: boolean; showNew?: boolean; newCutoff?: number }): void
  progress(): { done: number; total: number }
}

const stateCache = new WeakMap<WallHandles, Uint8Array>()
const activeTooltipEl = new WeakMap<WallHandles, HTMLElement | null>()

function ensureCatStyle(id: string, categoryColors: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>()
  let css = '.v3-entry{--entry-color:#e9eee9}'
  let n = 0
  for (const [name, color] of Object.entries(categoryColors)) {
    if (n >= CAT_CLASS_MAX) break
    const cls = `c-${n}`
    map.set(name, cls)
    css += `.v3-entry.${cls}{--entry-color:${color}}`
    n++
  }
  let styleEl = document.getElementById(id) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = id
  }
  if (styleEl.textContent !== css) styleEl.textContent = css
  if (!styleEl.isConnected) document.head.appendChild(styleEl)
  return map
}

function ensureDriftStyle(id: string): void {
  const existing = document.getElementById(id) as HTMLStyleElement | null
  if (existing && existing.isConnected && existing.textContent) return
  let css = ''
  for (let i = 0; i < DRIFT_SLOTS; i++) {
    css += `.v3-entry.d-${i}{--v3-dx:${DRIFT_X[i]}px;--v3-dy:${DRIFT_Y[i]}px}`
  }
  const el = existing ?? document.createElement('style')
  el.id = id
  el.textContent = css
  if (!el.isConnected) document.head.appendChild(el)
}

function appendTitleText(target: HTMLElement, title: string): void {
  if (!title.includes(MIRROR_PHRASE)) {
    target.textContent = title
    return
  }
  const segs = splitMirror(title)
  for (const seg of segs) {
    if (!seg.mirror) {
      target.appendChild(document.createTextNode(seg.text))
    } else {
      const wrap = document.createElement('span')
      wrap.className = 'mir-seq'
      for (const ch of seg.text) {
        const s = document.createElement('span')
        s.className = 'mir'
        s.textContent = ch
        wrap.appendChild(s)
      }
      target.appendChild(wrap)
    }
  }
}

interface EntryInitState {
  readIds?: Set<string>
  favIds?: Set<string>
  showRead: boolean
  showNew: boolean
  newCutoff: number
  matched: Set<string> | null
  filterMode: 'hide' | 'dim'
  colorblind: boolean
  catShape: Map<string, number>
  categoryColors: Record<string, string>
}

function createEntryEl(
  it: V3Item,
  catClass: Map<string, string>,
  drift: boolean,
  init: EntryInitState,
): { entry: HTMLElement; hit: number } {
  const entry = document.createElement('span')
  entry.className = 'v3-entry'
  const cc = catClass.get(it.category)
  if (cc) entry.classList.add(cc)
  if (drift) entry.classList.add(`d-${hashSeed(it.id) % DRIFT_SLOTS}`)

  const multi = !!(it.gradStops && it.categories && it.categories.length > 1)
  if (multi) {
    entry.classList.add('is-multi')
    entry.style.setProperty('--grad-stops', it.gradStops as string)
  }

  if (init.showNew && (it.modifiedAt || 0) >= init.newCutoff) {
    entry.classList.add('is-new')
  }
  if (init.showRead && init.readIds?.has(it.id)) {
    entry.setAttribute('data-read', '')
  }
  if (init.favIds?.has(it.id)) {
    entry.setAttribute('data-fav', '')
  }

  const hit = init.matched ? (init.matched.has(it.id) ? 1 : 0) : 1
  if (hit === 0) {
    entry.classList.add(init.filterMode === 'hide' ? 'is-hidden' : 'is-dim')
  }

  entry.dataset.id = it.id
  entry.dataset.category = it.category
  entry.tabIndex = 0
  entry.setAttribute('role', 'button')

  if (init.colorblind) {
    const cats = it.categories && it.categories.length > 0 ? it.categories : [it.category]
    const marksWrap = document.createElement('span')
    marksWrap.className = 'v3-cmarks'
    marksWrap.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < cats.length; i++) {
      const catName = cats[i]
      const shapeIdx = init.catShape.get(catName) ?? 0
      const color = init.categoryColors[catName] || it.categoryColor || '#e9eee9'
      const mark = document.createElement('span')
      mark.className = `v3-cmark cm-${shapeIdx}`
      mark.style.setProperty('--mark-color', color)
      marksWrap.appendChild(mark)
    }
    entry.appendChild(marksWrap)
  }

  if (multi) {
    // 双层同列 inline-grid 渐变：底层实芯描边+投影（完全跟随换行与镜像字），顶层 OKLCH 渐变裁剪填色
    const textWrap = document.createElement('span')
    textWrap.className = 'v3-entry-text v3-entry-text--multi'

    const stroke = document.createElement('span')
    stroke.className = 'v3-entry-stroke'
    stroke.setAttribute('aria-hidden', 'true')
    appendTitleText(stroke, it.title)

    const fill = document.createElement('span')
    fill.className = 'v3-entry-fill'
    appendTitleText(fill, it.title)

    textWrap.append(stroke, fill)
    entry.appendChild(textWrap)
  } else {
    const text = document.createElement('span')
    text.className = 'v3-entry-text'
    appendTitleText(text, it.title)
    entry.appendChild(text)
  }

  if (it.emojis && it.emojis.length) {
    for (let i = 0; i < it.emojis.length; i++) {
      const tag = document.createElement('span')
      tag.className = 'v3-entry-tag'
      tag.setAttribute('aria-hidden', 'true')
      tag.textContent = it.emojis[i]
      entry.appendChild(tag)
    }
  }
  return { entry, hit }
}

function syncTierVisibility(tiers: WallTier[], cache: Uint8Array, hasFilter: boolean, mode: 'hide' | 'dim', totalHits: number): void {
  if (mode === 'hide' && hasFilter) {
    const allZero = totalHits === 0
    for (const t of tiers) {
      if (allZero) {
        if (!t.el.hidden) t.el.hidden = true
        continue
      }
      if (t.el.hidden) t.el.hidden = false
      let c = 0
      for (let i = t.start; i < t.end; i++) if (cache[i] === 1) c++
      const empty = c === 0 && t.end > t.start
      if (t.emptyEl.hidden !== !empty) t.emptyEl.hidden = !empty
    }
  } else {
    for (const t of tiers) {
      if (t.el.hidden) t.el.hidden = false
      if (!t.emptyEl.hidden) t.emptyEl.hidden = true
    }
  }
}

export function buildWall(root: HTMLElement, opts: BuildOptions): WallBuilder {
  const catClass = ensureCatStyle('v3-cat-colors', opts.categoryColors)
  const catShape = buildCategoryShapeMap(opts.categoryColors)
  ensureDriftStyle('v3-drift-slots')

  const els: HTMLElement[] = []
  const ids: string[] = []
  const mountedItems: V3Item[] = []
  const indexOf = new Map<string, number>()
  const tiers: WallTier[] = []
  let emptyText = opts.tierEmptyText || '这个层级没有匹配的词条'

  const initState: EntryInitState = {
    readIds: opts.readIds,
    favIds: opts.favIds,
    showRead: opts.showRead ?? false,
    showNew: opts.showNew ?? false,
    newCutoff: opts.newCutoff ?? 0,
    matched: opts.matched ?? null,
    filterMode: opts.filterMode ?? 'hide',
    colorblind: !!opts.colorblind,
    catShape,
    categoryColors: opts.categoryColors,
  }

  // 无层级散落模式：将全部词条洗牌并合入单一分区
  const sourceTiers: Array<{ name: string; items: V3Item[]; isScatter?: boolean }> = opts.scatter
    ? (() => {
        const flat = opts.tiers.flatMap((t) => t.items)
        const rand = mulberry32(Math.floor(Math.random() * 0xffffffff))
        const arr = [...flat]
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return [{ name: '__scatter__', items: arr, isScatter: true }]
      })()
    : opts.tiers

  const total = sourceTiers.length
  const totalItems = sourceTiers.reduce((sum, t) => sum + t.items.length, 0)
  const hitBits = new Uint8Array(totalItems)
  hitBits.fill(2)

  const initial = Math.max(0, Math.min(opts.initialTiers ?? total, total))
  root.textContent = ''

  const handles: WallHandles = {
    els,
    ids,
    items: mountedItems,
    indexOf,
    tiers,
    catClass,
    scatter: !!opts.scatter,
    destroy() {
      cancel()
      root.textContent = ''
      document.getElementById('v3-cat-colors')?.remove()
      document.getElementById('v3-drift-slots')?.remove()
    },
  }
  stateCache.set(handles, hitBits)

  function buildTier(ti: number): WallTier {
    const { name, items, isScatter } = sourceTiers[ti]
    const section = document.createElement('section')
    section.className = isScatter ? 'v3-tier v3-tier--scatter' : 'v3-tier'
    if (!isScatter) section.dataset.tier = name

    const cloud = document.createElement('div')
    cloud.className = isScatter ? 'v3-cloud v3-cloud--scatter' : 'v3-cloud'

    const start = els.length
    let tierHits = 0
    const frag = document.createDocumentFragment()
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const idx = els.length
      const { entry, hit } = createEntryEl(it, catClass, opts.drift, initState)
      hitBits[idx] = hit
      if (hit) tierHits++
      frag.appendChild(entry)
      indexOf.set(it.id, idx)
      els.push(entry)
      ids.push(it.id)
      mountedItems.push(it)
    }
    cloud.appendChild(frag)

    const emptyEl = document.createElement('p')
    emptyEl.className = 'v3-tier-empty'
    emptyEl.textContent = emptyText
    const showTierEmpty = initState.filterMode === 'hide' && initState.matched !== null && tierHits === 0 && items.length > 0
    emptyEl.hidden = !showTierEmpty
    if (initState.filterMode === 'hide' && initState.matched !== null && initState.matched.size === 0) {
      section.hidden = true
    }

    if (isScatter) {
      section.append(cloud, emptyEl)
    } else {
      const h2 = document.createElement('h2')
      h2.className = 'v3-tier-name'
      h2.textContent = name
      section.append(h2, cloud, emptyEl)
    }
    root.appendChild(section)
    return { name, el: section, cloudEl: cloud, emptyEl, start, end: els.length }
  }

  for (let ti = 0; ti < initial; ti++) {
    const t = buildTier(ti)
    tiers.push(t)
    opts.onTierMounted?.(t, handles)
  }

  let done = initial
  let idleHandle = 0
  let timeoutHandle = 0
  let cancelled = false

  function cancel() {
    cancelled = true
    if (idleHandle && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleHandle)
    }
    if (timeoutHandle) window.clearTimeout(timeoutHandle)
    idleHandle = 0
    timeoutHandle = 0
  }

  function flush() {
    cancel()
    cancelled = false
    while (done < total) {
      const t = buildTier(done)
      tiers.push(t)
      done++
      opts.onTierMounted?.(t, handles)
    }
  }

  function step() {
    idleHandle = 0
    timeoutHandle = 0
    if (cancelled || done >= total) return
    const t = buildTier(done)
    tiers.push(t)
    done++
    opts.onTierMounted?.(t, handles)
    if (done < total) schedule()
  }

  function schedule() {
    if (cancelled || done >= total) return
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(step, { timeout: 600 })
    } else {
      timeoutHandle = window.setTimeout(step, 40)
    }
  }

  if (done < total) schedule()

  return {
    handles,
    flush,
    cancel,
    destroy() { handles.destroy() },
    setTierEmptyText(text: string) {
      emptyText = text
      for (const t of tiers) t.emptyEl.textContent = text
    },
    setInitialFilter(matched, mode) {
      initState.matched = matched
      initState.filterMode = mode
    },
    setInitialMarks(m) {
      if (m.readIds !== undefined) initState.readIds = m.readIds
      if (m.favIds !== undefined) initState.favIds = m.favIds
      if (m.showRead !== undefined) initState.showRead = m.showRead
      if (m.showNew !== undefined) initState.showNew = m.showNew
      if (m.newCutoff !== undefined) initState.newCutoff = m.newCutoff
    },
    progress: () => ({ done, total }),
  }
}

/**
 * Uint8Array 差分筛选：
 * 在 hide 模式下保留层级标题栏，无命中层级只显示层级空状态而非整层消失；
 * 仅当所有层级均空时由外层容器显示全局空状态。
 */
export function applyFilter(
  h: WallHandles,
  matched: Set<string> | null,
  mode: 'hide' | 'dim',
): number {
  const { els, ids } = h
  const n = els.length
  let prev = stateCache.get(h)
  if (!prev || prev.length < n) {
    const nextArr = new Uint8Array(n)
    nextArr.fill(2)
    if (prev) nextArr.set(prev.subarray(0, Math.min(prev.length, n)))
    prev = nextArr
    stateCache.set(h, prev)
  }

  const cls = mode === 'hide' ? 'is-hidden' : 'is-dim'
  const otherCls = mode === 'hide' ? 'is-dim' : 'is-hidden'
  let count = 0
  for (let i = 0; i < n; i++) {
    const hit = matched ? (matched.has(ids[i]) ? 1 : 0) : 1
    if (hit) count++
    const el = els[i]
    if (prev[i] !== hit) {
      el.classList.toggle(cls, hit === 0)
      if (el.classList.contains(otherCls)) el.classList.remove(otherCls)
      prev[i] = hit
    } else if (hit === 0 && !el.classList.contains(cls)) {
      // mode 从 hide ↔ dim 切换时同步类名
      el.classList.add(cls)
      el.classList.remove(otherCls)
    }
  }

  syncTierVisibility(h.tiers, prev, matched !== null, mode, count)
  return count
}

export function applyReadAll(h: WallHandles, readIds: Set<string>, on: boolean, start = 0) {
  const { els, ids } = h
  for (let i = start; i < els.length; i++) {
    const el = els[i]
    const want = on && readIds.has(ids[i])
    if (want) { if (!el.hasAttribute('data-read')) el.setAttribute('data-read', '') }
    else if (el.hasAttribute('data-read')) el.removeAttribute('data-read')
  }
}

export function applyFavAll(h: WallHandles, favIds: Set<string>, start = 0) {
  const { els, ids } = h
  for (let i = start; i < els.length; i++) {
    const el = els[i]
    const want = favIds.has(ids[i])
    if (want) { if (!el.hasAttribute('data-fav')) el.setAttribute('data-fav', '') }
    else if (el.hasAttribute('data-fav')) el.removeAttribute('data-fav')
  }
}

export function applyNewAll(h: WallHandles, cutoff: number, on: boolean, start = 0) {
  const { els, items } = h
  for (let i = start; i < els.length; i++) {
    const el = els[i]
    const want = on && (items[i]?.modifiedAt || 0) >= cutoff
    if (want) { if (!el.classList.contains('is-new')) el.classList.add('is-new') }
    else if (el.classList.contains('is-new')) el.classList.remove('is-new')
  }
}

export function markReadOne(h: WallHandles, id: string, on = true) {
  const i = h.indexOf.get(id)
  if (i === undefined) return
  const el = h.els[i]
  if (on) { if (!el.hasAttribute('data-read')) el.setAttribute('data-read', '') }
  else el.removeAttribute('data-read')
}

export function markFavOne(h: WallHandles, id: string, on: boolean) {
  const i = h.indexOf.get(id)
  if (i === undefined) return
  const el = h.els[i]
  if (on) { if (!el.hasAttribute('data-fav')) el.setAttribute('data-fav', '') }
  else el.removeAttribute('data-fav')
}

export function setTooltipActive(h: WallHandles | null, id: string | null) {
  if (!h) return
  const prev = activeTooltipEl.get(h) ?? null
  const nextIdx = id ? h.indexOf.get(id) : undefined
  const next = nextIdx !== undefined ? h.els[nextIdx] : null
  if (prev === next) return
  if (prev) prev.classList.remove('tooltip-active')
  if (next) next.classList.add('tooltip-active')
  activeTooltipEl.set(h, next)
}
