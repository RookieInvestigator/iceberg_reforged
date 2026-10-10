import { onScopeDispose } from 'vue'

// 词条元素注册表：取代散落的 getElementById / querySelectorAll。
// 非响应式（不代理上千个元素）；新挂载节点注册时通知监听者，因此渐进挂载下不会漏元素。
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
