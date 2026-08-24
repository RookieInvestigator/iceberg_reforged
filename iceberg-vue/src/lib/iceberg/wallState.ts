import { shallowRef } from 'vue'

/**
 * 词条墙派生状态 —— **单一事实源**（研究一 · P2/P3 落地，见 docs/plans/WALL_STATE_UNIFICATION.md）。
 *
 * 生产点（仅两处）：
 *  - IndexView：文档序（sortMode 变化时重建）→ docOrder
 *  - useFilterPipeline：匹配集（hide/dim 均产出）→ wallMatched；可见文档序位置索引 → navIndex
 * 消费点（零计算）：
 *  - 模板：可见集合/层计数（另见 wallCounts.ts）
 *  - 交互：navIdsFor（O(1) 查表）/ 随机池（O(1) 随机）
 *
 * 注意：模块单例，仅冰山图墙使用；消费方不得写入。
 */

/** 词条墙 DOM 文档序 id（tierOrder × 层内声明式排序；IndexView 按 sortMode 重建） */
export const docOrder = shallowRef<string[]>([])

/** 过滤匹配集（hide/dim 皆为「命中」集合；随机池等语义用；管线 rAF 单遍产出） */
export const wallMatched = shallowRef<Set<string> | null>(null)

export interface NavIndex {
  /** id → 可见文档序位置 */
  map: Map<string, number>
  /** 可见文档序数组（O(1) 取相邻 id） */
  order: string[]
  length: number
}

/** 可见文档序位置索引：线性构建一次，前后导航 O(1)（替代每次开弹窗过滤） */
export function buildNavIndex(order: string[], visible: Set<string> | null): NavIndex {
  const map = new Map<string, number>()
  const list: string[] = []
  let n = 0
  for (const id of order) {
    if (visible && !visible.has(id)) continue
    map.set(id, n)
    list.push(id)
    n++
  }
  return { map, order: list, length: n }
}

/** 当前可见文档序索引（管线维护；diim 模式 visible=null → 全量序） */
export const navIndex = shallowRef<NavIndex>({ map: new Map(), order: [], length: 0 })