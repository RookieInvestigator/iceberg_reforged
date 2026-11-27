import { toEntryView, type EntryView } from '../iceberg/entryView'
import { itemCategories } from '../iceberg/extraCategories'
import type { V3Dataset, V3Item } from './keys'

export type V3Sort = 'default' | 'title-asc' | 'title-desc' | 'category'

export function sortTier<T extends { title: string; category: string }>(list: readonly T[], mode: V3Sort): T[] {
  if (mode === 'default') return list as T[]
  const arr = [...list]
  if (mode === 'title-asc') arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  else if (mode === 'title-desc') arr.sort((a, b) => b.title.localeCompare(a.title, 'zh-CN'))
  else arr.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN'))
  return arr
}

interface RelIndex {
  catIdx: Map<string, string[]>
  tagIdx: Map<string, string[]>
  bgIdx: Map<string, string[]>
}

const relIndexCache = new WeakMap<V3Dataset, RelIndex>()

function getRelIndex(ds: V3Dataset): RelIndex {
  const hit = relIndexCache.get(ds)
  if (hit) return hit

  const catIdx = new Map<string, string[]>()
  const tagIdx = new Map<string, string[]>()
  const bgIdx = new Map<string, string[]>()

  for (const item of ds.items) {
    let catList = catIdx.get(item.category)
    if (!catList) {
      catList = []
      catIdx.set(item.category, catList)
    }
    catList.push(item.id)

    for (const t of item.tags || []) {
      let tagList = tagIdx.get(t)
      if (!tagList) {
        tagList = []
        tagIdx.set(t, tagList)
      }
      tagList.push(item.id)
    }

    for (let i = 0; i < item.title.length - 1; i++) {
      const bg = item.title.slice(i, i + 2)
      let bgList = bgIdx.get(bg)
      if (!bgList) {
        bgList = []
        bgIdx.set(bg, bgList)
      }
      bgList.push(item.id)
    }
  }

  const built: RelIndex = { catIdx, tagIdx, bgIdx }
  relIndexCache.set(ds, built)
  return built
}

function pickRelatedSingle(ds: V3Dataset, item: V3Item) {
  const explicitIds = ds.related.get(item.id) || (item.related?.length ? item.related : [])
  const explicit: V3Item[] = []
  const usedIds = new Set<string>([item.id])

  for (const id of explicitIds) {
    const r = ds.byId.get(id)
    if (r && !usedIds.has(r.id)) {
      explicit.push(r)
      usedIds.add(r.id)
    }
  }

  const { catIdx, tagIdx, bgIdx } = getRelIndex(ds)
  const scores = new Map<string, number>()
  const bgN = new Map<string, number>()

  for (const id of catIdx.get(item.category) || []) {
    if (!usedIds.has(id)) scores.set(id, 3)
  }
  for (const t of item.tags || []) {
    for (const id of tagIdx.get(t) || []) {
      if (!usedIds.has(id)) scores.set(id, (scores.get(id) || 0) + 2)
    }
  }
  for (let i = 0; i < item.title.length - 1; i++) {
    for (const id of bgIdx.get(item.title.slice(i, i + 2)) || []) {
      if (!usedIds.has(id)) bgN.set(id, (bgN.get(id) || 0) + 1)
    }
  }
  for (const [id, n] of bgN) {
    scores.set(id, (scores.get(id) || 0) + Math.min(n, 3))
  }

  const pool: Array<[string, number]> = []
  for (const [id, s] of scores) {
    if (s >= 2) pool.push([id, s])
  }
  pool.sort((a, b) => b[1] - a[1])

  const top = pool.slice(0, 10).map(([id]) => id)
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[top[i], top[j]] = [top[j], top[i]]
  }
  const recommended = top
    .slice(0, 2)
    .map((id) => ds.byId.get(id))
    .filter((r): r is V3Item => Boolean(r))

  return { explicit, recommended }
}

/** 悬浮卡片专用 O(1) 轻量视图：零导航序列扫描、零相似度索引构建 */
export function createV3TooltipView(ds: V3Dataset, id: string): EntryView | null {
  const resolved = ds.idAliases[id] || id
  const item = ds.byId.get(resolved)
  if (!item) return null
  return toEntryView({
    id: item.id,
    title: item.title,
    tier: item.tier,
    desc: item.desc,
    category: item.category,
    categoryColor: item.categoryColor,
    categories: itemCategories(item),
    tags: item.tags,
    link: item.link,
    references: ds.references.get(item.id),
  })
}

export function createV3EntryViewFactory(
  ds: V3Dataset,
  visibleOrder: () => string[],
): (id: string) => EntryView | null {
  return (id: string): EntryView | null => {
    const resolved = ds.idAliases[id] || id
    const item = ds.byId.get(resolved)
    if (!item) return null

    const { explicit, recommended } = pickRelatedSingle(ds, item)
    const list = visibleOrder()
    const pos = list.indexOf(item.id)
    const prevId = pos > 0 ? list[pos - 1] : null
    const nextId = pos > -1 && pos < list.length - 1 ? list[pos + 1] : null

    return toEntryView(
      {
        id: item.id,
        title: item.title,
        tier: item.tier,
        desc: item.desc,
        category: item.category,
        categoryColor: item.categoryColor,
        categories: itemCategories(item),
        tags: item.tags,
        link: item.link,
        references: ds.references.get(item.id),
      },
      {
        related: explicit.map((r) => ({ id: r.id, title: r.title })),
        recommended: recommended.map((r) => ({ id: r.id, title: r.title })),
        prevId,
        nextId,
      },
    )
  }
}

export function pickRandom(
  matched: Set<string> | null,
  order: readonly string[],
  excludeId?: string,
): string | null {
  const pool = matched ? order.filter((id) => matched.has(id)) : order
  if (!pool.length) return null
  let pick = pool[Math.floor(Math.random() * pool.length)]
  if (pool.length > 1 && pick === excludeId) {
    pick = pool[(pool.indexOf(pick) + 1) % pool.length]
  }
  return pick
}

export type { V3Item }
