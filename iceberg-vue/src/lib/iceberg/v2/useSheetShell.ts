// 抽屉外壳行为：Esc 关闭 + Tab 焦点循环 + 背景滚动锁 + 焦点移入/还原。
//
// 与 BaseModal（components/modals/BaseModal.vue:22-80）逻辑同构，故**不要反向修改 BaseModal**；
// 本文件只服务 V2Sheet。
import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { lockOverlay } from '../../overlayLock'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/**
 * @param open  抽屉开合状态（响应式）
 * @param onClose Esc / 遮罩关闭回调
 * @returns panelRef —— 需绑到面板根元素，焦点陷阱以其为界
 */
export function useSheetShell(open: Ref<boolean>, onClose: () => void) {
  const panelRef = ref<HTMLElement | null>(null)
  let unlock: (() => void) | null = null
  let previousFocus: HTMLElement | null = null

  function onKey(e: KeyboardEvent) {
    if (!open.value) return
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.value
    if (!panel) return
    const focusable = getFocusable(panel)
    if (focusable.length === 0) {
      e.preventDefault()
      panel.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || !panel.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      unlock = lockOverlay()
      // 打开后焦点移入面板（首个可聚焦元素，无则面板本身）
      nextTick(() => {
        const panel = panelRef.value
        if (!panel) return
        const focusable = getFocusable(panel)
        if (focusable.length > 0) focusable[0].focus()
        else panel.focus()
      })
    } else {
      unlock?.()
      unlock = null
      try {
        previousFocus?.focus()
      } catch {
        // 触发元素可能已卸载（路由切换等），静默降级
      }
      previousFocus = null
    }
  })

  onMounted(() => document.addEventListener('keydown', onKey))
  onUnmounted(() => {
    document.removeEventListener('keydown', onKey)
    unlock?.()
    unlock = null
  })

  return { panelRef }
}
