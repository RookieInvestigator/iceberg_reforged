import type { InjectionKey, ShallowRef } from 'vue'
import type { TrailNode } from '../useTrail'
import type { EntryIA } from '../../useEntryInteractions'

/**
 * v2 专用注入键（只新增不改旧：FACET_COUNTS_KEY 曾短暂放在 lib/injectionKeys.ts，
 * 为遵守「v2 不修改已有文件」已迁回此处；v1 侧无引用）。
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
 * 取代原先「把整个 ia 当 prop 传、再在子组件顶层解构」的写法 —— useEntryInteractions
 * 在 setup 阶段即发网络请求，必须单实例；provide/inject 比 prop 传对象更贴合这层关系。
 */
export const ENTRY_IA_KEY: InjectionKey<EntryIA> = Symbol('v2EntryIA')
