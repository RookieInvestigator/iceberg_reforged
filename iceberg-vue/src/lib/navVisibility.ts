// 吸顶导航显隐规则（冰山图筛选栏与术语表导航共用，保证两处行为完全一致）。
// 只放纯函数与常量：调用方各自保留自己的 rAF 循环（不要为共用逻辑再拆第二条循环）。
export const NAV_HOT_ZONE = 96
export const NAV_TOP_ZONE = 80
export const NAV_SCROLL_THRESHOLD = 10

export type NavVisibilityDecision = 'show' | 'hide' | 'keep'

export interface NavScrollState {
  /** 距页顶的滚动位移 */
  y: number
  /** 本帧滚动增量（正=向下） */
  dy: number
  /** 指针是否在顶部热区（NAV_HOT_ZONE 内） */
  inHotZone: boolean
  /** 触屏 / 无悬停设备：常显 */
  coarsePointer: boolean
  /** 临时状态要求常显（面板展开、下拉打开、搜索聚焦…） */
  forceVisible: boolean
  /** 结构性常显（如尚未贴住、仍处于文档流） */
  alwaysVisible: boolean
}

/** 滚动帧的显隐判定：方向感知为主（上滚显 / 下滚隐，±阈值防抖） */
export function navShouldShowOnScroll(s: NavScrollState): NavVisibilityDecision {
  if (s.alwaysVisible || s.forceVisible) return 'show'
  if (s.y < NAV_TOP_ZONE) return 'show'
  if (s.coarsePointer || s.inHotZone) return 'show'
  if (s.dy < -NAV_SCROLL_THRESHOLD) return 'show'
  if (s.dy > NAV_SCROLL_THRESHOLD) return 'hide'
  return 'keep'
}

export interface NavPointerState {
  inHotZone: boolean
  coarsePointer: boolean
  forceVisible: boolean
  alwaysVisible: boolean
}

/** 指针离开顶部热区时的显隐判定（热区直达：进来立刻显形） */
export function navShouldShowOnPointer(s: NavPointerState): NavVisibilityDecision {
  if (s.inHotZone || s.alwaysVisible || s.forceVisible || s.coarsePointer) return 'show'
  return 'hide'
}

/** 指针是否落在顶部热区（clientY < 0 视为未知，不算热区） */
export function isInNavHotZone(clientY: number): boolean {
  return clientY >= 0 && clientY < NAV_HOT_ZONE
}
