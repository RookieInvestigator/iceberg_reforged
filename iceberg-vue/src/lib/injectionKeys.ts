import type { InjectionKey, ShallowRef } from 'vue'
import type { IcebergItem } from './data'
import type { CategoryRecord, ContributorRecord, ExtraRecord } from './iceberg/appendix'

/**
 * 主冰山图（IndexNextView）全量下发数据的注入键（codeq 第二波：11 个字符串 key 全部类型化，
 * 拼写错误从「静默回退默认值」变为编译期报错）。
 */

/** 词条筛选可见集合。null = 无筛选（全部可见）；非 null 的 Set 为当前命中词条 id 集合。 */
export const FILTER_VISIBLE_KEY: InjectionKey<ShallowRef<Set<string> | null>> = Symbol('filterVisible')

/** dim 模式（筛选变暗而非隐藏）下需要变暗的词条 id 集合；null = 无变暗。perf：模板 :class + v-memo 响应式下发，替代命令式 classList 循环 */
export const DIM_ITEMS_KEY: InjectionKey<ShallowRef<Set<string> | null>> = Symbol('dimItems')

/** 渲染词条 = 归一化词条 + 所属层级名（主图 IndexNextView 组装） */
export type RenderItem = IcebergItem & { tier: string }

export const TIER_ORDER_KEY: InjectionKey<string[]> = Symbol('tierOrder')
export const CATEGORY_COLORS_KEY: InjectionKey<Record<string, string>> = Symbol('categoryColors')
export const TAG_MAP_KEY: InjectionKey<Record<string, string>> = Symbol('tagMap')
export const DEFAULT_COLOR_KEY: InjectionKey<string> = Symbol('defaultColor')
export const RENDER_ITEMS_KEY: InjectionKey<ShallowRef<RenderItem[]>> = Symbol('renderItems')
export const DESC_MAP_KEY: InjectionKey<Map<string, string>> = Symbol('descMap')
export const HERO_TITLES_KEY: InjectionKey<string[]> = Symbol('heroTitles')
export const RELATED_MAP_KEY: InjectionKey<Map<string, string[]>> = Symbol('relatedMap')

export interface ReferenceLink {
  label: string
  url: string
  /** 链接副表角色：main = 覆盖词条主链接；缺省/ref = 附加参考链接（见 lib/iceberg/entryLinks.ts） */
  role?: 'main' | 'ref'
}
export const REFERENCES_MAP_KEY: InjectionKey<Map<string, ReferenceLink[]>> = Symbol('referencesMap')

/** 署名副表（contributors.csv）：`item_id → [{by,at}]`，供词条卡片的「社区贡献」图标 tooltip */
export const CONTRIBUTORS_MAP_KEY: InjectionKey<Map<string, ContributorRecord[]>> = Symbol('contributorsMap')

/** 标记副表（extra.csv）：`item_id → [{flag,note}]`（警示 / 需补充），供词条卡片的标记图标行 */
export const EXTRA_MAP_KEY: InjectionKey<Map<string, ExtraRecord[]>> = Symbol('extraMap')

/** 分类副表（categories.csv）全量记录：`item_id → CategoryRecord[]`（role=main 覆盖主分类 / extra 追加副分类，见 lib/iceberg/appendix.ts） */
export const CATEGORIES_MAP_KEY: InjectionKey<Map<string, CategoryRecord[]>> = Symbol('categoriesMap')

export const OPEN_ON_THIS_DAY_KEY: InjectionKey<() => void> = Symbol('openOnThisDay')
export const ID_ALIASES_KEY: InjectionKey<Map<string, string>> = Symbol('idAliases')
