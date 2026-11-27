<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, toRef, watch } from 'vue'
import { useMediaQuery, useResizeObserver } from '@vueuse/core'
import { useStore } from '@nanostores/vue'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import { lockOverlay } from '../../lib/overlayLock'
import { v2DetailSurface } from '../../lib/v3/store'
import { useEntryInteractions } from '../../lib/useEntryInteractions'
import { useSwipeNav } from '../../lib/iceberg/v2/useSwipeNav'
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys'
import { V3_CTX_KEY } from '../../lib/v3/keys'
import V2EntryBody from '../v2/V2EntryBody.vue'
import V2EntryActions from '../v2/V2EntryActions.vue'
import EntrySearchButton from '../items/EntrySearchButton.vue'
import MirrorText from '../ui/MirrorText.vue'

const _ctx = inject(V3_CTX_KEY)
if (!_ctx) throw new Error('[V3EntryDialog] 缺少 V3_CTX_KEY')
const ctx = _ctx

const { t } = useI18n()
const surf = useStore(v2DetailSurface)
const isMobile = useMediaQuery('(max-width: 1023px)')
const layoutMode = computed<'card' | 'sheet'>(() => (isMobile.value ? 'sheet' : 'card'))
const view = computed(() => ctx.activeView.value)

// 保留离场帧内容直至 leave 过渡完成；并在打开期间持有一枚 overlayLock 令牌
const shown = ref(false)
const cachedView = ref(view.value)
const activeItem = computed(() => view.value ?? cachedView.value)

const dlgRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const commentSectionEl = ref<HTMLElement | null>(null)

// 单实例交互状态（点赞 / 评论 / 收藏 / 复制标题与链接），经 ENTRY_IA_KEY 下发至 V2EntryBody / V2EntryActions
const itemId = toRef(() => activeItem.value?.id)
const ia = useEntryInteractions(itemId, commentSectionEl)
provide(ENTRY_IA_KEY, ia)
const { titleCopied, copyTitle, toggleFav, commentsOpen } = ia

function setCommentEl(el: HTMLElement | null) {
  commentSectionEl.value = el
}

// 切词条滚回顶部 & 计算底部渐隐指示
const canScroll = ref(false)
const atBottom = ref(false)
function refreshOverflow() {
  const el = bodyRef.value
  canScroll.value = !!el && el.scrollHeight > el.clientHeight + 1
  if (el) atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
}
function onBodyScroll() {
  const el = bodyRef.value
  if (!el) return
  atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
}
useResizeObserver(bodyRef, refreshOverflow)

watch(() => [activeItem.value?.id, commentsOpen.value] as const, ([id], prev) => {
  const switched = !!prev && id !== prev[0]
  nextTick(() => {
    if (switched && bodyRef.value) bodyRef.value.scrollTop = 0
    refreshOverflow()
  })
})

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
}

let unlockOverlay: (() => void) | null = null
let previousFocus: HTMLElement | null = null
let closeFallbackTimer = 0

function acquireOpenState() {
  window.clearTimeout(closeFallbackTimer)
  closeFallbackTimer = 0
  if (!unlockOverlay) {
    unlockOverlay = lockOverlay()
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  shown.value = true
  nextTick(() => {
    const el = dlgRef.value
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    refreshOverflow()
    if (!el.contains(document.activeElement)) {
      el.focus({ preventScroll: true })
    }
  })
}

function finalizeClose() {
  window.clearTimeout(closeFallbackTimer)
  closeFallbackTimer = 0
  if (shown.value) return
  cachedView.value = null
  if (unlockOverlay) {
    const unlock = unlockOverlay
    unlockOverlay = null
    unlock()
  }
  if (dlgRef.value) {
    dlgRef.value.style.transition = ''
    dlgRef.value.style.transform = ''
  }
  try {
    previousFocus?.focus({ preventScroll: true })
  } catch {
    // 触发元素可能已被销毁，静默跳过
  }
  previousFocus = null
}

watch(view, (next) => {
  if (next) {
    cachedView.value = next
    acquireOpenState()
  } else if (shown.value) {
    shown.value = false
    window.clearTimeout(closeFallbackTimer)
    closeFallbackTimer = window.setTimeout(finalizeClose, 260)
  }
}, { immediate: true })

function onDocKeydown(e: KeyboardEvent) {
  if (!shown.value) return
  // 上方若叠有 BaseModal（如反馈弹窗 / 账户弹窗），让最顶层弹窗先处理 Escape 与 Tab
  if (document.querySelector('.modal-overlay')) return
  if (e.key === 'Escape') {
    e.preventDefault()
    ctx.closeEntry()
    return
  }
  if (e.key !== 'Tab') return
  const panel = dlgRef.value
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

onMounted(() => {
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  window.clearTimeout(closeFallbackTimer)
  document.removeEventListener('keydown', onDocKeydown)
  if (unlockOverlay) {
    unlockOverlay()
    unlockOverlay = null
  }
  previousFocus = null
})

// 左右触屏滑动切换上一条/下一条
const swipePrevHint = ref<HTMLElement | null>(null)
const swipeNextHint = ref<HTMLElement | null>(null)
const { swipeEl } = useSwipeNav({
  prevId: () => view.value?.prevId ?? null,
  nextId: () => view.value?.nextId ?? null,
  onNavigate: (id) => ctx.openEntryDialog(id, view.value?.id),
  prevHint: swipePrevHint,
  nextHint: swipeNextHint,
})

// 移动端顶部把手下滑关闭手势
let dragStartY = 0
let dragPanY = 0
let dragTick = false
function onHandleTouchStart(e: TouchEvent) {
  dragStartY = e.touches[0].clientY
  dragPanY = 0
  dragTick = false
}
function onHandleTouchMove(e: TouchEvent) {
  dragPanY = e.touches[0].clientY - dragStartY
  if (dragPanY > 10 && !dragTick) {
    dragTick = true
    requestAnimationFrame(() => {
      if (dlgRef.value) {
        dlgRef.value.style.transition = 'none'
        dlgRef.value.style.transform = `translateY(${dragPanY}px)`
      }
      dragTick = false
    })
  }
}
function onHandleTouchEnd() {
  const el = dlgRef.value
  if (!el) return
  el.style.transition = ''
  el.style.transform = ''
  if (dragPanY > 80) ctx.closeEntry()
}
function onHandleTouchCancel() {
  dragPanY = 0
  dragTick = false
  if (dlgRef.value) {
    dlgRef.value.style.transition = ''
    dlgRef.value.style.transform = ''
  }
}

// 详情内作用域快捷键：仅当弹窗开启时响应 ← / → 与 F，不穿透至底层面板
function onDialogKeydown(e: KeyboardEvent) {
  const cur = view.value
  if (!cur) return
  const tag = (e.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft' && cur.prevId) {
    e.preventDefault()
    e.stopPropagation()
    ctx.openEntryDialog(cur.prevId, cur.id)
  } else if (e.key === 'ArrowRight' && cur.nextId) {
    e.preventDefault()
    e.stopPropagation()
    ctx.openEntryDialog(cur.nextId, cur.id)
  } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    e.stopPropagation()
    toggleFav(cur.id)
  }
}
</script>

<template>
  <Transition name="v3-dlg" @after-leave="finalizeClose">
    <div
      v-if="shown && activeItem"
      class="v3-dlg-overlay"
      @click.self="ctx.closeEntry()"
      @touchmove.self.prevent
    >
      <div
        ref="dlgRef"
        class="v3-dialog"
        :class="{ 'surface-light': surf === 'light' }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v3-dlg-title"
        tabindex="-1"
        @click.stop
        @keydown="onDialogKeydown"
      >
        <div class="v3-dlg-shell">
          <div
            class="v3-sheet-handle-wrap"
            @touchstart="onHandleTouchStart"
            @touchmove="onHandleTouchMove"
            @touchend="onHandleTouchEnd"
            @touchcancel="onHandleTouchCancel"
          >
            <div class="sheet-handle" />
          </div>

          <header class="v3-dlg-head">
            <button
              type="button"
              class="v3-dlg-title-btn"
              :aria-label="titleCopied ? t('titleCopied') : t('copyTitle')"
              :title="titleCopied ? t('titleCopied') : t('copyTitle')"
              @click="copyTitle(activeItem.title)"
            >
              <h2 id="v3-dlg-title" class="v2-entry-title v3-dlg-title">
                <MirrorText :text="titleCopied ? t('titleCopied') : activeItem.title" />
              </h2>
            </button>

            <div class="v3-dlg-head-actions">
              <EntrySearchButton :title="activeItem.title" :touch="isMobile" />
              <button type="button" class="v3-dlg-x v3-dlg-close" :aria-label="t('close')" @click="ctx.closeEntry()">
                <X :size="18" :stroke-width="2" />
              </button>
            </div>
          </header>

          <div class="v3-dlg-main">
            <div ref="swipePrevHint" class="v3-swipe-hint v3-swipe-hint--prev" aria-hidden="true">
              <ChevronRight :size="22" :stroke-width="1.8" />
            </div>
            <div ref="swipeNextHint" class="v3-swipe-hint v3-swipe-hint--next" aria-hidden="true">
              <ChevronLeft :size="22" :stroke-width="1.8" />
            </div>

            <div ref="swipeEl" class="v3-dlg-swipe">
              <div ref="bodyRef" class="v3-dlg-body no-scrollbar" @scroll="onBodyScroll">
                <V2EntryBody :item="activeItem" :layout="layoutMode" @navigate="({ id, from }) => ctx.openEntryDialog(id, from ?? activeItem?.id)" @comment-el="setCommentEl" />
              </div>
            </div>
            <div v-show="canScroll && !atBottom" class="v3-dlg-fade" aria-hidden="true" />
          </div>

          <footer class="v3-dlg-foot v2-dock">
            <V2EntryActions :item="activeItem" :layout="layoutMode" @navigate="({ id, from }) => ctx.openEntryDialog(id, from ?? activeItem?.id)" />
          </footer>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.v3-dlg-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--color-modal-bg);
  color: var(--color-text-primary);
  transition: background-color var(--v3-t-base, 200ms) var(--v3-ease, ease-out),
    color var(--v3-t-base, 200ms) var(--v3-ease, ease-out);
}
.v3-sheet-handle-wrap {
  display: none;
  flex-shrink: 0;
  justify-content: center;
  padding: 0.625rem 0 0.25rem;
  touch-action: none;
}
.v3-dlg-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.375rem 0.75rem;
  border-bottom: 1px solid var(--white-08);
  flex-shrink: 0;
}
.v3-dlg-title-btn {
  flex: 1;
  min-width: 0;
  padding: 0.05rem 0;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--color-text-primary);
  cursor: pointer;
  transition: opacity var(--v3-t-fast, 140ms) var(--v3-ease, ease-out);
}
.v3-dlg-title-btn:hover { opacity: 0.78; }
.v3-dlg-title {
  margin: 0;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.v3-dlg-head-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: none;
}
.v3-dlg-x {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--v3-r-sm);
  background: transparent;
  color: var(--white-45);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: color var(--v3-t-fast, 140ms), background-color var(--v3-t-fast, 140ms);
}
.v3-dlg-x:hover {
  color: var(--white-90);
  background: var(--white-06);
}
.v3-dlg-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.v3-dlg-swipe {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
  overscroll-behavior-x: contain;
}
.v3-dlg-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0.875rem 1.375rem 1.25rem;
}
.v3-dlg-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 34px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(to top, var(--color-modal-bg) 0%, transparent 100%);
}
.v3-swipe-hint {
  position: absolute;
  top: 50%;
  margin-top: -17px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: var(--white-92);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--v3-t-fast, 140ms) linear;
}
.v3-swipe-hint--prev { left: 8px; }
.v3-swipe-hint--next { right: 8px; }

@media (max-width: 1023px) {
  .v3-sheet-handle-wrap { display: flex; }
  .v3-dlg-close { display: none; }
  .v3-dlg-head {
    align-items: center;
    padding: 0.15rem 1.125rem 0.5rem;
    border-bottom-color: var(--white-05);
  }
  .v3-dlg-title-btn {
    padding: 0.25rem 0;
  }
  .v3-dlg-head-actions {
    margin-right: -10px;
  }
  .v3-dlg-body {
    padding: 0.75rem 1.125rem 1.125rem;
  }
}
</style>
