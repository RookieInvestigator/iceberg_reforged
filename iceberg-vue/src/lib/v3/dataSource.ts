import { computed, provide, shallowRef, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import raw from '../../data/iceberg.json'
import { normalizeData, type QuoteStyle } from '../data'
import { loadAppendix } from '../iceberg/appendix'
import { applyCategories } from '../iceberg/extraCategories'
import { applyOverrides } from '../iceberg/overrides'
import {
  CATEGORY_COLORS_KEY,
  CATEGORIES_MAP_KEY,
  CONTRIBUTORS_MAP_KEY,
  DEFAULT_COLOR_KEY,
  DESC_MAP_KEY,
  EXTRA_MAP_KEY,
  ID_ALIASES_KEY,
  READING_MAP_KEY,
  REFERENCES_MAP_KEY,
  RELATED_MAP_KEY,
  RENDER_ITEMS_KEY,
  TAG_MAP_KEY,
  TIER_ORDER_KEY,
} from '../injectionKeys'
import { quoteStyle } from './store'
import type { V3Dataset, V3Item } from './keys'

const cache = new WeakMap<object, Map<QuoteStyle, V3Dataset>>()

export function buildV3Data(style: QuoteStyle): V3Dataset {
  const byStyle = cache.get(raw)
  const hit = byStyle?.get(style)
  if (hit) return hit

  const appendix = loadAppendix()
  if (appendix.violations.length) {
    console.warn('[v3/appendix] 副表越界（未生效）：', appendix.violations.join('；'))
  }

  const data = normalizeData(raw, style)
  const nameToEmoji: Record<string, string> = {}
  for (const [emoji, name] of Object.entries(data.tagMap || {})) nameToEmoji[name as string] = emoji

  const flat = Object.values(data.tiers).flat()
  applyOverrides(flat, appendix.overrides, { nameToEmoji })
  applyCategories(data, appendix.categories)

  const tiers: Record<string, V3Item[]> = {}
  const items: V3Item[] = []
  const byId = new Map<string, V3Item>()
  data.tierOrder.forEach((tierName, tierIndex) => {
    const list = (data.tiers[tierName] || []).map((it) => ({ ...it, tier: tierName, tierIndex }))
    tiers[tierName] = list
    for (const it of list) {
      items.push(it)
      byId.set(it.id, it)
    }
  })

  // 统计各分类（含多分类）和各标签词条数
  const facetCats: Record<string, number> = {}
  const facetTags: Record<string, number> = {}
  for (const it of items) {
    const cats = it.categories && it.categories.length ? it.categories : [it.category]
    for (const c of cats) facetCats[c] = (facetCats[c] || 0) + 1
    for (const e of it.emojis || []) facetTags[e] = (facetTags[e] || 0) + 1
  }

  const ds: V3Dataset = {
    tierOrder: data.tierOrder,
    tiers,
    items,
    byId,
    categoryColors: data.categoryColors,
    tagMap: data.tagMap,
    defaultColor: data.defaultColor,
    introText: data.introText,
    generatedAt: data.generatedAt,
    idAliases: data.idAliases || {},
    facetCats,
    facetTags,
    related: appendix.related,
    references: appendix.references,
    reading: appendix.reading,
    contributors: appendix.contributors,
    extra: appendix.extra,
    categoryRecords: appendix.categories,
  }

  if (!byStyle) cache.set(raw, new Map([[style, ds]]))
  else byStyle.set(style, ds)
  return ds
}

export function resolveV3Id(ds: V3Dataset, id: string | null | undefined): string {
  if (!id) return ''
  return ds.idAliases[id] || id
}

/**
 * V3 统一数据源：
 * 1) 消费共享 quoteStyle 并按风格热更新 dataset；
 * 2) 向共享子组件（ExportModal / V2EntryBody / V2EntryMetaBadges / EntryMarks）
 *    提供所需的只读数据注入键，零重复代码、零改共享组件。
 */
export function useV3Data() {
  const qStyle = useStore(quoteStyle)
  const first = buildV3Data(qStyle.value as QuoteStyle)
  const dataset = shallowRef<V3Dataset>(first)
  const itemsRef = shallowRef<V3Item[]>(first.items)
  const descMap = new Map<string, string>(first.items.map((i) => [i.id, i.desc || '']))
  const aliasMap = new Map<string, string>(Object.entries(first.idAliases))
  const tierOrder = computed(() => dataset.value.tierOrder)

  if (typeof window !== 'undefined') {
    watch(qStyle, (next) => {
      const ds = buildV3Data(next as QuoteStyle)
      dataset.value = ds
      itemsRef.value = ds.items
      descMap.clear()
      for (const i of ds.items) descMap.set(i.id, i.desc || '')
      aliasMap.clear()
      for (const [k, v] of Object.entries(ds.idAliases)) aliasMap.set(k, v)
    })
  }

  // 共享组件所需的只读契约桥接（ExportModal / V2EntryBody / V2EntryMetaBadges / EntryMarks）
  provide(TIER_ORDER_KEY, first.tierOrder)
  provide(CATEGORY_COLORS_KEY, first.categoryColors)
  provide(TAG_MAP_KEY, first.tagMap)
  provide(DEFAULT_COLOR_KEY, first.defaultColor)
  provide(RENDER_ITEMS_KEY, itemsRef)
  provide(DESC_MAP_KEY, descMap)
  provide(RELATED_MAP_KEY, first.related)
  provide(REFERENCES_MAP_KEY, first.references)
  provide(READING_MAP_KEY, first.reading)
  provide(CONTRIBUTORS_MAP_KEY, first.contributors)
  provide(EXTRA_MAP_KEY, first.extra)
  provide(CATEGORIES_MAP_KEY, first.categoryRecords)
  provide(ID_ALIASES_KEY, aliasMap)

  return { dataset, itemsRef, tierOrder, descMap, qStyle }
}
