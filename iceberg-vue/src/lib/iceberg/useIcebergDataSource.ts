import { provide, shallowRef, watchEffect } from 'vue'
import { useStore } from '@nanostores/vue'
import raw from '../../data/iceberg.json'
import { normalizeData, type QuoteStyle } from '../data'
import { quoteStyle } from '../settingsStore'
import { loadAppendix } from './appendix'
import { applyCategories } from './extraCategories'
import { applyOverrides } from './overrides'
import {
  CATEGORY_COLORS_KEY,
  CATEGORIES_MAP_KEY,
  CONTRIBUTORS_MAP_KEY,
  DEFAULT_COLOR_KEY,
  DESC_MAP_KEY,
  ENTITIES_MAP_KEY,
  EXTRA_MAP_KEY,
  FILTER_VISIBLE_KEY,
  DIM_ITEMS_KEY,
  HERO_TITLES_KEY,
  RELATED_MAP_KEY,
  REFERENCES_MAP_KEY,
  READING_MAP_KEY,
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
  // 引号风格是实验开关：切换时整条装配链按新风格重算。normalizeData 按 (raw, style) 缓存，
  // 每次都返回**新对象**，所以副表的就地订正不会叠加两次。
  const qStyle = useStore(quoteStyle)
  const appendix = loadAppendix()
  if (appendix.violations.length) {
    // 越界写法（保留字段写进通用表）不生效，必须外显（见 lib/iceberg/appendix.ts）
    console.warn('[appendix] 副表越界：', appendix.violations.join('；'))
  }

  // 派生字段重算所需的映射（tags → emojis，见 lib/iceberg/overrides.ts）
  const nameToEmoji: Record<string, string> = {}
  for (const [emoji, name] of Object.entries(normalizeData(raw).tagMap || {})) nameToEmoji[name as string] = emoji

  /** 副表装配 + 扁平化：从 normalizeData 的新对象出发，可安全重算 */
  function assemble(style: QuoteStyle) {
    const d = normalizeData(raw, style)
    const overrideStat = applyOverrides(Object.values(d.tiers).flat(), appendix.overrides, { nameToEmoji })
    // 分类区域：主分类覆盖 + 副分类追加 + 墙 OKLCH 渐变色标（唯一入口）
    applyCategories(d, appendix.categories)
    const items = Object.entries(d.tiers).flatMap(([tierName, list]) =>
      list.map((item) => ({ ...item, tier: tierName })),
    )
    return { data: d, items, overrideStat }
  }

  const first = assemble(qStyle.value as QuoteStyle)
  if (first.overrideStat.violations.length) console.warn('[overrides] 越界字段（未生效）：', first.overrideStat.violations.join('；'))
  if (first.overrideStat.skipped.length) {
    // 不静默：这些字段的反馈被写进了 CSV 却没有渲染层语义（见 lib/iceberg/overrides.ts）
    console.warn('[overrides] 暂不支持叠加的字段（已忽略）：', first.overrideStat.skipped.join('、'))
  }

  const data = shallowRef(first.data)
  const allItemsRaw = first.items
  const allItems = shallowRef(allItemsRaw)

  // 全量数据下发（含 desc）；descMap 供 Interactivity 按 id 快速取回
  const renderItemsRef = shallowRef(allItemsRaw)
  const descMap = new Map(allItemsRaw.map((i) => [i.id, (i as { desc?: string }).desc || '']))

  const heroTitles = shallowRef(allItemsRaw.map((i) => i.title))

  // 引号风格切换：整条装配链按新风格重算，然后**换引用**下发。
  // 就地 push 不行 —— shallowRef 只比较引用，墙上拿到的还是旧数组。
  // 用 watchEffect 而不是 watch：它天然把 qStyle.value 记为依赖，不依赖 watch 的源解析。
  let lastStyle = qStyle.value as QuoteStyle
  if (typeof window !== 'undefined') {
    watchEffect(() => {
      const next = qStyle.value as QuoteStyle
      if (next === lastStyle) return
      lastStyle = next
      const rebuilt = assemble(next)
      data.value = rebuilt.data
      renderItemsRef.value = rebuilt.items
      allItems.value = rebuilt.items
      heroTitles.value = rebuilt.items.map((i) => i.title)
      descMap.clear()
      for (const i of rebuilt.items) descMap.set(i.id, (i as { desc?: string }).desc || '')
    })
  }

  // 全局注入：子组件不需要 JSON.parse props。
  // 这几个是静态字段（层级序 / 分类色 / 标签表 / 默认色），不随引号风格变化，取首帧值即可。
  provide(TIER_ORDER_KEY, first.data.tierOrder)
  provide(CATEGORY_COLORS_KEY, first.data.categoryColors)
  provide(TAG_MAP_KEY, first.data.tagMap)
  provide(DEFAULT_COLOR_KEY, first.data.defaultColor)
  provide(RENDER_ITEMS_KEY, renderItemsRef)
  provide(DESC_MAP_KEY, descMap)
  provide(HERO_TITLES_KEY, heroTitles.value)
  provide(RELATED_MAP_KEY, appendix.related)
  provide(REFERENCES_MAP_KEY, appendix.references)
  provide(READING_MAP_KEY, appendix.reading)
  provide(CONTRIBUTORS_MAP_KEY, appendix.contributors)
  provide(EXTRA_MAP_KEY, appendix.extra)
  provide(CATEGORIES_MAP_KEY, appendix.categories)
  provide(ENTITIES_MAP_KEY, appendix.entities)

  return {
    /** 首帧数据对象（静态字段如 categoryColors / tagMap 用它，不随引号风格变） */
    data: first.data,
    /** 随引号风格更新的完整数据对象 */
    dataRef: data,
    allItems,
    allItemsRaw,
    renderItemsRef,
    descMap,
    relatedMap: appendix.related,
    referencesMap: appendix.references,
    readingMap: appendix.reading,
    overridesMap: appendix.overrides,
    categoriesMap: appendix.categories,
    contributorsMap: appendix.contributors,
    extraMap: appendix.extra,
    entitiesMap: appendix.entities,
    appendix,
  }
}
