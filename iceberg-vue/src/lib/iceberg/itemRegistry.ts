import { onScopeDispose } from 'vue'

// 词条元素注册表（审计 A4）：替掉散落的 getElementById / querySelectorAll。
// 非响应式（不代理 1432 个元素）；新挂载节点注册时通知监听者，
// 渐进挂载下的覆盖问题结构性消失（错落已前移渲染层，此处服务随机定位与已读标记）。
const els = new Map<string, HTMLElement>()
const listeners = new Set<(id: string, el: HTMLElement) => void>()

export function registerItem(id: string, el: HTMLElement | null) {
  if (el) {
    els.set(id, el)
    listeners.forEach((fn) => fn(id, el))
  } else els.delete(id)
}

export const getItemEl = (id: string) => els.get(id)

export function onItemMount(fn: (id: string, el: HTMLElement) => void) {
  listeners.add(fn)
  onScopeDispose(() => listeners.delete(fn))
}

/** 测试/调试用：清空注册表 */
export function clearItemRegistry() {
  els.clear()
}
