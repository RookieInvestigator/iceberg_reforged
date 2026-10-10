import type { InjectionKey, ShallowRef } from 'vue'
import type { TrailNode } from '../useTrail'
import type { EntryIA } from '../../useEntryInteractions'

/**
 * v2 专用注入键（v2 自己的键都放这里，不改动 lib/injectionKeys.ts 的公共键）。
 */

/** v2 筛选面计数：分类名 → 词条数；标签 emoji → 词条数（数据静态、零响应式开销） */
export interface FacetCounts {
  cats: Record<string, number>
  tags: Record<string, number>
}
export const FACET_COUNTS_KEY: InjectionKey<FacetCounts> = Symbol('v2facetCounts')

/** v2 探索轨迹（A3）：面包屑读取的栈（V2Interactivity 持有并下发） */
export interface TrailState {
  trail: ShallowRef<TrailNode[]>
}
export const TRAIL_KEY: InjectionKey<TrailState> = Symbol('v2trail')

/**
 * 词条交互单实例：由外壳（V2EntryCard / V2Sheet）创建并 provide，内容区（V2EntryBody）消费。
 * useEntryInteractions 在 setup 阶段即发网络请求，必须单实例，故用 provide/inject 而非 prop 传。
 */
export const ENTRY_IA_KEY: InjectionKey<EntryIA> = Symbol('v2EntryIA')
