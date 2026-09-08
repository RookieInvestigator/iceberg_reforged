import { computed, shallowRef } from 'vue'

// 探索轨迹 Trail（审计 A3）：记录用户自己走出来的下潜路径（A → 相关 → B → …），
// 与静态 tier 层级并置。单个 shallowRef，无性能影响。
export interface TrailNode {
  id: string
  title: string
}

export function useTrail() {
  const trail = shallowRef<TrailNode[]>([])

  /** 入栈：已在栈中则截断到该节点（回跳），否则追加 */
  function push(node: TrailNode) {
    const i = trail.value.findIndex((n) => n.id === node.id)
    trail.value = i >= 0 ? trail.value.slice(0, i + 1) : [...trail.value, node]
  }

  /** 新起一段（墙上直点 / 随机 / 深链）：清空后以该节点为起点 */
  function reset(node: TrailNode) {
    trail.value = [node]
  }

  /** 当前深度 = 栈长 - 1（起点为 0） */
  const depth = computed(() => Math.max(0, trail.value.length - 1))

  function up(): TrailNode | null {
    const next = trail.value.slice(0, -1)
    trail.value = next
    return next[next.length - 1] ?? null
  }

  /** 浮出水面（弹窗关闭时调用，URL 由调用方同步清理） */
  function surface() {
    trail.value = []
  }

  return { trail, depth, push, reset, up, surface }
}

/** ?trail= 参数编解码（点分隔 8 位 id；非法段丢弃） */
const TRAIL_ID_RE = /^[a-f0-9]{8}$/
export function encodeTrail(ids: string[]): string {
  return ids.filter((id) => TRAIL_ID_RE.test(id)).join('.')
}
export function decodeTrail(param: string | null | undefined): string[] {
  if (typeof param !== 'string' || !param) return []
  return param.split('.').filter((id) => TRAIL_ID_RE.test(id))
}
