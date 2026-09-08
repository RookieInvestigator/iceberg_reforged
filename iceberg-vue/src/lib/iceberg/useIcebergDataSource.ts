import { provide, shallowRef } from 'vue'
import raw from '../../data/iceberg.json'
import relatedRaw from '../../data/appendix/related.csv?raw'
import referencesRaw from '../../data/appendix/references.csv?raw'
import { isSafeHttpUrl, normalizeData } from '../data'
import { parseCSV } from '../csv'
import {
  CATEGORY_COLORS_KEY,
  DEFAULT_COLOR_KEY,
  DESC_MAP_KEY,
  FILTER_VISIBLE_KEY,
  DIM_ITEMS_KEY,
  HERO_TITLES_KEY,
  RELATED_MAP_KEY,
  REFERENCES_MAP_KEY,
  RENDER_ITEMS_KEY,
  TAG_MAP_KEY,
  TIER_ORDER_KEY,
} from '../injectionKeys'

/**
 * 冰山图数据源（审计 A6.2：IndexNextView 数据段上提）。
 * normalizeData + 关联/参考副表 CSV 解析 + 全套 provide，一处持有。
 * v1 IndexView 暂不消费（v1 冻结，转正时再合流），当前仅 v2 用。
 */
export function useIcebergDataSource() {
  const data = normalizeData(raw)
  const allItemsRaw = Object.entries(data.tiers).flatMap(([tierName, items]) =>
    items.map((item) => ({ ...item, tier: tierName })),
  )
  const allItems = shallowRef(allItemsRaw)

  // 全量数据下发（含 desc）；descMap 供 Interactivity 按 id 快速取回
  const renderItemsRef = shallowRef(allItemsRaw)
  const descMap = new Map(allItemsRaw.map((i) => [i.id, (i as { desc?: string }).desc || '']))

  // 副表加载：关联词条 (source_id → target_id[], 含反向索引)
  const relatedMap = new Map<string, string[]>()
  for (const row of parseCSV(relatedRaw)) {
    const src = (row.source_id || '').trim()
    const tgt = (row.target_id || '').trim()
    if (!src || !tgt) continue
    if (!relatedMap.has(src)) relatedMap.set(src, [])
    relatedMap.get(src)!.push(tgt)
    // 反向：target 也获得 source
    if (!relatedMap.has(tgt)) relatedMap.set(tgt, [])
    relatedMap.get(tgt)!.push(src)
  }

  // 副表加载：参考链接 (source_id → [{label, url}])
  const referencesMap = new Map<string, { label: string; url: string }[]>()
  for (const row of parseCSV(referencesRaw)) {
    const src = (row.source_id || '').trim()
    const label = (row.label || '').trim()
    const url = (row.url || '').trim()
    if (!src || !url) continue
    if (!isSafeHttpUrl(url)) continue // F34：副表 URL 同样过 schema 校验
    if (!referencesMap.has(src)) referencesMap.set(src, [])
    referencesMap.get(src)!.push({ label: label || url, url })
  }

  // 全局注入：子组件不需要 JSON.parse props
  provide(TIER_ORDER_KEY, data.tierOrder)
  provide(CATEGORY_COLORS_KEY, data.categoryColors)
  provide(TAG_MAP_KEY, data.tagMap)
  provide(DEFAULT_COLOR_KEY, data.defaultColor)
  provide(RENDER_ITEMS_KEY, renderItemsRef)
  provide(DESC_MAP_KEY, descMap)
  provide(HERO_TITLES_KEY, allItemsRaw.map((i) => i.title))
  provide(RELATED_MAP_KEY, relatedMap)
  provide(REFERENCES_MAP_KEY, referencesMap)

  return { data, allItems, allItemsRaw, renderItemsRef, descMap, relatedMap, referencesMap }
}
