import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { IcebergItem } from './data'

/**
 * IndexView 全量下发数据的注入键（codeq 第二波：11 个字符串 key 全部类型化，
 * 拼写错误从「静默回退默认值」变为编译期报错）。
 */

/** 词条筛选可见集合。null = 无筛选（全部可见）；非 null 的 Set 为当前命中词条 id 集合。 */
export const FILTER_VISIBLE_KEY: InjectionKey<ShallowRef<Set<string> | null>> = Symbol('filterVisible')

/** dim 模式（筛选变暗而非隐藏）下需要变暗的词条 id 集合；null = 无变暗。perf：模板 :class + v-memo 响应式下发，替代命令式 classList 循环 */
export const DIM_ITEMS_KEY: InjectionKey<ShallowRef<Set<string> | null>> = Symbol('dimItems')

/** 渲染词条 = 归一化词条 + 所属层级名（IndexView 组装） */
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
}
export const REFERENCES_MAP_KEY: InjectionKey<Map<string, ReferenceLink[]>> = Symbol('referencesMap')

export const OPEN_ON_THIS_DAY_KEY: InjectionKey<() => void> = Symbol('openOnThisDay')
export const ID_ALIASES_KEY: InjectionKey<Map<string, string>> = Symbol('idAliases')

/**
 * 词条墙 DOM 文档序 id（tierOrder × tierItems 声明式排序；IndexView 计算）。
 * 弹窗前后导航的数据源：替代 navIdsFor 的 1400 节点 querySelectorAll 扫描，
 * 且与分片挂载（wallMount）兼容——不依赖 DOM 是否已补齐。
 */
export const WALL_ORDER_KEY: InjectionKey<Ref<string[]>> = Symbol('wallOrder')
