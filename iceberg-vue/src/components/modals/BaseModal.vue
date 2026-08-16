<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useId } from 'vue'
import { lockOverlay } from '../../lib/overlayLock'
import { useI18n } from '../../lib/useI18n'

defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg'
  showFooter?: boolean
  titleClass?: string
  titleClick?: () => void
}>();

const emit = defineEmits(['close']);

const { t } = useI18n();

// P1-7：dialog 语义 + 焦点管理（打开时移入面板、Tab 循环、关闭后还原到触发元素）
const panelRef = ref<HTMLElement | null>(null)
const titleId = `modal-title-${useId()}`

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ))
}

let previousFocus: HTMLElement | null = null

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
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

// F20：模块级滚动锁（token 管理，任意叠加层数下最后一层释放才恢复滚动）+ Esc 键
let unlockOverlay: (() => void) | null = null
onMounted(() => {
  unlockOverlay = lockOverlay()
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', onKey);
  nextTick(() => {
    const panel = panelRef.value
    if (!panel) return
    const focusable = getFocusable(panel)
    if (focusable.length > 0) focusable[0].focus()
    else panel.focus()
  })
})
onUnmounted(() => {
  unlockOverlay?.()
  document.removeEventListener('keydown', onKey);
  try {
    previousFocus?.focus()
  } catch {
    // 触发元素可能已被移除（路由切换等），静默降级
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-up" appear>
      <div class="modal-overlay" @click.self="$emit('close')" @touchmove.self.prevent>
        <div ref="panelRef" :class="['modal-panel no-scrollbar', `modal-${size}`]" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @click.stop>
          
          <div class="modal-header">
            <!-- 增加 truncate 防止标题过长挤压右侧按钮 -->
            <h2 :id="titleId" class="pr-4" :class="[titleClass, titleClick ? 'cursor-pointer hover:opacity-70' : '']" @click="titleClick">{{ title }}</h2>
            
            <!-- 动作按钮区（插槽 + 关闭按钮） -->
            <div class="flex items-center gap-3 shrink-0">
              <slot name="header-actions" />
              <button type="button" class="modal-close" :aria-label="t('close')" @click="$emit('close')">&times;</button>
            </div>
          </div>

          <div class="modal-body no-scrollbar">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </footer>

          <div v-else-if="showFooter" class="modal-footer-hint">
            <slot name="footer-hint" />
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* 弹窗过渡动画 */
.fade-up-enter-active { transition: opacity 0.1s ease-out; }
.fade-up-leave-active { transition: opacity 0.06s ease-in; }
.fade-up-enter-from,
.fade-up-leave-to { opacity: 0; }
</style>