/**
 * wallMount —— 词条墙分片挂载调度（纯函数）。
 *
 * 背景（docs/plans/PRODUCTION_WALL_PERF.md）：
 * 生产词条墙 1432 节点全部同步挂载构成首屏长任务；content-visibility 已把 layout/paint
 * 视口化，剩余大头 = 节点创建本身。把「一次性挂 8 层」拆成「首屏 2 层 + 逐帧补齐」，
 * 长任务碎成 ~6 帧小任务（补齐阶段 DOM/布局增长，paint 仍由 content-visibility 懒做）。
 *
 * 安全网（组件侧实现）：
 *  - 任何用户交互（pointerdown/keydown）、筛选/搜索、深链（?item=/#hash）、
 *    open-item-modal 事件 → 立即 flush 全部层级（pointerdown 先于 click，
 *    Vue 微任务刷新保证事件处理时序内墙已完整）；
 *  - prerender 为手工快照（src/prerender.ts 不渲染本组件），无 SSR 分支。
 */

/** 首屏直接挂载的层级数（视口 + 缓冲；其余逐帧补齐） */
export const MOUNT_INITIAL_TIERS = 2

/** 初始挂载数：viewportOnly=false（深链/筛选取向等需要完整墙的场景）→ 全量 */
export function initialMountCount(total: number, viewportOnly: boolean): number {
  return viewportOnly ? Math.min(MOUNT_INITIAL_TIERS, total) : total
}

/** 下一帧挂载数：逐层递增直至全量（幂等封顶） */
export function nextMountCount(current: number, total: number): number {
  return current >= total ? total : current + 1
}