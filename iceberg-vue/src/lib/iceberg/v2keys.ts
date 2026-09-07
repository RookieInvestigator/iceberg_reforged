import type { InjectionKey } from 'vue'

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
