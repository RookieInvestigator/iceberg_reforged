import { provide, shallowRef } from 'vue'
import raw from '../../data/iceberg.json'
import { normalizeData } from '../data'
import { loadAppendix } from './appendix'
import { applyCategories } from './extraCategories'
import { applyOverrides } from './overrides'
import {
  CATEGORY_COLORS_KEY,
  CATEGORIES_MAP_KEY,
  CONTRIBUTORS_MAP_KEY,
  DEFAULT_COLOR_KEY,
  DESC_MAP_KEY,
  EXTRA_MAP_KEY,
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
 * 冰山图数据源：normalizeData + 六张副表的解析/装配 + 全套 provide，一处持有。
 * 主图（IndexNextView）唯一数据入口。
 *
 * 副表解析（列名/键/越界判定）统一走 lib/iceberg/appendix.ts，装配按区域分派：
 *   标量字段 → overrides.applyOverrides；分类 → extraCategories.applyCategories；
 *   链接/关联只提供 Map。**顺序有讲究**：订正（title/desc/tags）必须在
 *   allItemsRaw / descMap 生成之前就地把值写回词条对象，之后所有消费方
 *   （词条墙、详情、hero 标题、descMap）自动拿到订正后的值；分类装配随后一次算清
 *   主分类覆盖 + 副分类 + 墙渐变色标。
 */
export function useIcebergDataSource() {
  const data = normalizeData(raw)
  const appendix = loadAppendix()
  if (appendix.violations.length) {
    // 越界写法（保留字段写进通用表）不生效，必须外显（见 lib/iceberg/appendix.ts）
    console.warn('[appendix] 副表越界：', appendix.violations.join('；'))
  }

  // 派生字段重算所需的映射（tags → emojis，见 lib/iceberg/overrides.ts）
  const nameToEmoji: Record<string, string> = {}
  for (const [emoji, name] of Object.entries(data.tagMap || {})) nameToEmoji[name] = emoji
  const overrideStat = applyOverrides(Object.values(data.tiers).flat(), appendix.overrides, { nameToEmoji })
  if (overrideStat.violations.length) console.warn('[overrides] 越界字段（未生效）：', overrideStat.violations.join('；'))
  if (overrideStat.skipped.length) {
    // 不静默：这些字段的反馈被写进了 CSV 却没有渲染层语义（见 lib/iceberg/overrides.ts）
    console.warn('[overrides] 暂不支持叠加的字段（已忽略）：', overrideStat.skipped.join('、'))
  }

  // 分类区域：主分类覆盖 + 副分类追加 + 墙 OKLCH 渐变色标（唯一入口）
  applyCategories(data, appendix.categories)

  const allItemsRaw = Object.entries(data.tiers).flatMap(([tierName, items]) =>
    items.map((item) => ({ ...item, tier: tierName })),
  )
  const allItems = shallowRef(allItemsRaw)

  // 全量数据下发（含 desc）；descMap 供 Interactivity 按 id 快速取回
  const renderItemsRef = shallowRef(allItemsRaw)
  const descMap = new Map(allItemsRaw.map((i) => [i.id, (i as { desc?: string }).desc || '']))

  // 全局注入：子组件不需要 JSON.parse props
  provide(TIER_ORDER_KEY, data.tierOrder)
  provide(CATEGORY_COLORS_KEY, data.categoryColors)
  provide(TAG_MAP_KEY, data.tagMap)
  provide(DEFAULT_COLOR_KEY, data.defaultColor)
  provide(RENDER_ITEMS_KEY, renderItemsRef)
  provide(DESC_MAP_KEY, descMap)
  provide(HERO_TITLES_KEY, allItemsRaw.map((i) => i.title))
  provide(RELATED_MAP_KEY, appendix.related)
  provide(REFERENCES_MAP_KEY, appendix.references)
  provide(CONTRIBUTORS_MAP_KEY, appendix.contributors)
  provide(EXTRA_MAP_KEY, appendix.extra)
  provide(CATEGORIES_MAP_KEY, appendix.categories)

  return {
    data,
    allItems,
    allItemsRaw,
    renderItemsRef,
    descMap,
    relatedMap: appendix.related,
    referencesMap: appendix.references,
    overridesMap: appendix.overrides,
    categoriesMap: appendix.categories,
    contributorsMap: appendix.contributors,
    extraMap: appendix.extra,
    appendix,
  }
}
