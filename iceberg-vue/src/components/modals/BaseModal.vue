<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, useId } from 'vue'
import { X } from '@lucide/vue'
import { lockOverlay } from '../../lib/overlayLock'
import { useI18n } from '../../lib/useI18n'

const props = defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg'
  showFooter?: boolean
  titleClass?: string
  titleClick?: () => void
  /** light：阅读层浅色表面（S13 实验项）；不传或 dark 时与现在逐字一致 */
  surface?: 'dark' | 'light'
  /**
   * 内容标识（词条 id）。关闭过渡还没走完时又打开了别的条目，父组件的 v-if
   * 一直为真、实例被复用 —— 旧定时器会把刚打开的新内容一起关掉。
   * 拿到新标识就撤销这次关闭、重新淡入。
   */
  token?: string
}>();

const emit = defineEmits(['close']);

const { t } = useI18n();

// 关闭分两步：先把内容淡出，再通知父组件卸载。
// 直接 emit('close') 的话，父组件的 `v-if` 会立刻销毁本组件，包在外层的 Transition
// 收不到 leave —— 于是「打开有淡入、关闭是硬消失」。现在关闭点（X / Esc / 点遮罩）
// 都走 requestClose，等 after-leave 再把 close 抛上去。
const shown = ref(true)
let closeTimer = 0
const CLOSE_FALLBACK_MS = 220

// 关闭途中又被要求打开：撤销这次关闭，重新淡入
const bodyRef = ref<HTMLElement | null>(null)

watch(
  () => props.token,
  (next, prev) => {
    if (next && !shown.value) {
      window.clearTimeout(closeTimer)
      shown.value = true
    }
    // 换内容要把滚动位置归零：弹窗被复用（父级 v-if 一直为真），
    // .modal-body 会把上一条的 scrollTop 带给新词条，开头半截在视野外
    if (next && prev && next !== prev) {
      nextTick(() => { if (bodyRef.value) bodyRef.value.scrollTop = 0 })
    }
  },
)

function finishClose() {
  window.clearTimeout(closeTimer)
  emit('close')
}

function requestClose() {
  if (!shown.value) return
  shown.value = false
  window.clearTimeout(closeTimer)
  // 兜底：过渡被 prefers-reduced-motion 关掉、或 after-leave 没触发时也要能关掉
  closeTimer = window.setTimeout(finishClose, CLOSE_FALLBACK_MS)
}

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
    requestClose()
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
  window.clearTimeout(closeTimer)
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
    <!-- Transition 要包在一直渲染的节点上、由内部的 v-if 触发 enter/leave。
        原先 v-if 在父组件（`<V2EntryCard v-if="modalItem">`），一 emit('close')
        整个组件就被销毁，Transition 根本来不及播 leave —— 打开有淡入、关闭硬消失。 -->
    <Transition name="fade-up" appear @after-leave="finishClose">
      <div v-if="shown" class="modal-overlay" @click.self="requestClose" @touchmove.self.prevent>
        <div ref="panelRef" :class="['modal-panel no-scrollbar', `modal-${size}`, { 'surface-light': surface === 'light' }]" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @click.stop>
          
          <div class="modal-header">
            <!-- 增加 truncate 防止标题过长挤压右侧按钮 -->
            <h2 :id="titleId" class="pr-4" :class="[titleClass, titleClick ? 'cursor-pointer hover:opacity-70' : '']" @click="titleClick"><MirrorText :text="title" /></h2>
            
            <!-- 动作按钮区（插槽 + 关闭按钮） -->
            <div class="flex items-center gap-3 shrink-0">
              <slot name="header-actions" />
              <button type="button" class="modal-close" :aria-label="t('close')" @click="requestClose"><X :size="20" :stroke-width="2" /></button>
            </div>
          </div>

          <div ref="bodyRef" class="modal-body no-scrollbar">
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
/* 弹窗过渡动画：打开「淡入 + 微微上浮」，关闭「淡出 + 微微下沉」。
   两条边必须对称 —— 只有淡入没有淡出，关闭会像被直接掐掉。
   时长取 0.16s / 0.18s：短到不阻塞操作，长到眼睛能看见它是「收起来了」。 */
.fade-up-enter-active { transition: opacity 0.16s ease-out, transform 0.16s var(--ease-out); }
.fade-up-leave-active { transition: opacity 0.18s ease-in, transform 0.18s ease-in; pointer-events: none; }
.fade-up-enter-from { opacity: 0; transform: translateY(8px) scale(0.985); }
.fade-up-leave-to { opacity: 0; transform: translateY(6px) scale(0.99); }
.fade-up-enter-to, .fade-up-leave-from { opacity: 1; transform: none; }
</style>