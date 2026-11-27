import { computed } from 'vue'
import { useStore } from '@nanostores/vue'
import { itemCategories } from '../iceberg/extraCategories'
import type { V3FilterResult, V3Item } from './keys'
import {
  activeCategories, activeTags, favFilter, favorites, filterMode,
  hiddenCategories, hiddenTags, NEW_MARK_WINDOW_DAYS, searchQuery,
  specialFilter, tagFilterMode,
} from './store'

const EMPTY_SET: Set<string> = new Set()

export interface V3FilterSnapshot {
  query: string
  resultSet: Set<string> | null
  cats: readonly string[]
  tags: readonly string[]
  tagMode: string
  hCats: readonly string[]
  hTags: readonly string[]
  spl: string
  favF: boolean
  favSet: Set<string>
  newCutoff: number
}

export type Predicate = (item: V3Item) => boolean

/**
 * 组合式谓词编译（各维度严格 AND，绝不短路跳过，口径与 lib/iceberg/filterMatch.ts 一致）。
 */
export function compilePredicates(snap: V3FilterSnapshot): Predicate[] {
  const out: Predicate[] = []
  if (snap.hCats.length) {
    const hidden = new Set(snap.hCats)
    out.push((it) => !itemCategories(it).some((c) => hidden.has(c)))
  }
  if (snap.hTags.length) {
    const hidden = new Set(snap.hTags)
    out.push((it) => !(it.emojis || []).some((e) => hidden.has(e)))
  }
  if (snap.cats.length) {
    const sel = new Set(snap.cats)
    out.push((it) => itemCategories(it).some((c) => sel.has(c)))
  }
  if (snap.tags.length) {
    const isAnd = snap.tagMode.toUpperCase() === 'AND'
    const sel = new Set(snap.tags)
    out.push((it) => {
      const mine = it.emojis || []
      return isAnd
        ? snap.tags.every((t) => mine.includes(t))
        : mine.some((e) => sel.has(e))
    })
  }
  if (snap.spl !== 'all') {
    const sp = snap.spl
    out.push((it) => {
      switch (sp) {
        case 'hasLink': return !!it.link
        case 'hasDesc': return !!it.desc
        case 'isNew': return (it.modifiedAt || 0) >= snap.newCutoff
        case 'noLinkNoDesc': return !it.link && !it.desc
        default: return true
      }
    })
  }
  if (snap.favF) {
    const fav = snap.favSet
    out.push((it) => fav.has(it.id))
  }
  if (snap.resultSet) {
    const rs = snap.resultSet
    out.push((it) => rs.has(it.id))
  }
  return out
}

export function matchesSnapshot(item: V3Item, preds: readonly Predicate[]): boolean {
  for (let i = 0; i < preds.length; i++) if (!preds[i](item)) return false
  return true
}

export function computeFilter(
  items: readonly V3Item[],
  preds: readonly Predicate[],
  mode: 'hide' | 'dim',
): V3FilterResult {
  if (preds.length === 0) {
    return {
      visible: null,
      matched: null,
      tierCounts: null,
      total: items.length,
      visibleOrder: items.map((it) => it.id),
    }
  }
  const matched = new Set<string>()
  const counts = new Map<string, number>()
  const visibleOrder: string[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (matchesSnapshot(it, preds)) {
      matched.add(it.id)
      visibleOrder.push(it.id)
      counts.set(it.tier, (counts.get(it.tier) || 0) + 1)
    }
  }
  return {
    visible: mode === 'hide' ? matched : null,
    matched,
    tierCounts: mode === 'hide' ? counts : null,
    total: matched.size,
    visibleOrder,
  }
}

export function useV3Filter(
  items: () => readonly V3Item[],
  resultSet: () => Set<string> | null,
  resolveId: (id: string) => string = (id) => id,
) {
  const query = useStore(searchQuery)
  const cats = useStore(activeCategories)
  const tags = useStore(activeTags)
  const tagMode = useStore(tagFilterMode)
  const hCats = useStore(hiddenCategories)
  const hTags = useStore(hiddenTags)
  const spl = useStore(specialFilter)
  const favF = useStore(favFilter)
  const favList = useStore(favorites)
  const mode = useStore(filterMode)
  const newCutoff = Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 86400

  const snapshot = computed<V3FilterSnapshot>(() => {
    const normalizedFavs = favF.value
      ? new Set(favList.value.map((id) => resolveId(id)))
      : EMPTY_SET
    return {
      query: query.value,
      resultSet: resultSet(),
      cats: cats.value,
      tags: tags.value,
      tagMode: tagMode.value,
      hCats: hCats.value,
      hTags: hTags.value,
      spl: spl.value,
      favF: favF.value,
      favSet: normalizedFavs,
      newCutoff,
    }
  })

  const predicates = computed(() => compilePredicates(snapshot.value))
  const defaultResult = computed<V3FilterResult>(() => {
    const list = items()
    return {
      visible: null,
      matched: null,
      tierCounts: null,
      total: list.length,
      visibleOrder: list.map((it) => it.id),
    }
  })
  const result = computed(() =>
    predicates.value.length === 0
      ? defaultResult.value
      : computeFilter(items(), predicates.value, mode.value === 'dim' ? 'dim' : 'hide'),
  )
  const isFiltered = computed(() => predicates.value.length > 0)

  return { snapshot, predicates, result, isFiltered }
}
