import { shallowRef } from 'vue'

/**
 * 词条墙派生状态（过滤管线**单遍产出**、宿主模板消费；「派生状态单一化」的最小落地）。
 *
 * 背景（2026-08-21）：层可见数此前由 IndexView 独立 computed 再做一次 1432 词条扫描，
 * 与管线的 matched 计算重复；收敛为管线同一次遍历产出，过滤器之外零二次扫描。
 * 完整方案见 docs/plans/WALL_STATE_UNIFICATION.md（研究一）。
 */

/** hide 模式下各层可见数；dim 模式 = null（层空提示语义不适用）。管线 rAF 内更新。 */
export const tierVisibleCounts = shallowRef<Map<string, number> | null>(null)