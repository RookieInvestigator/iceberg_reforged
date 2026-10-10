import { shallowRef } from 'vue'

/**
 * 词条墙派生状态（过滤管线**单遍产出**、宿主模板消费）。
 *
 * 层可见数必须与 matched 在同一次遍历里产出，不要再单独扫一遍词条。
 */

/** hide 模式下各层可见数；dim 模式 = null（层空提示语义不适用）。管线 rAF 内更新。 */
export const tierVisibleCounts = shallowRef<Map<string, number> | null>(null)