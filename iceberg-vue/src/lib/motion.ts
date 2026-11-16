/**
 * 动效偏好：全站唯一的「减弱动效」来源。
 *
 * 早先 7 个文件各自写一遍
 *   `typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches`
 * —— 每次都要处理 SSR/无 matchMedia 的兜底，改一处口径要改七处。
 * 现在统一由 vueuse 的 `usePreferredReducedMotion` 订阅（系统设置变化即时生效），
 * 组件外的命令式代码（3D 引擎 / shader / tween）直接调 `prefersReducedMotion()` 读快照。
 */
import { computed } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

/** 'reduce' | 'no-preference'；模块级单例，整个应用只订阅一次 */
const preference = usePreferredReducedMotion()

/** 响应式版本（模板/组件里用） */
export const reducedMotion = computed(() => preference.value === 'reduce')

/** 快照版本（组件外的一次性判断，如引擎初始化、动画循环里） */
export function prefersReducedMotion(): boolean {
  return preference.value === 'reduce'
}
