<script setup lang="ts">
// V2Sheet（/v2 专用）：移动详情抽屉外壳。
// 外壳行为（Esc / Tab 焦点循环 / 背景滚动锁 / 焦点移入还原）已抽到 useSheetShell，
// 本文件只留抽屉专属部分：handle 下滑关闭、底部渐隐遮罩、标题行。
// 交互单实例在此创建并经 ENTRY_IA_KEY 下发内容区（内容区在 V2EntryBody）。
import { computed, ref, watch, toRef, nextTick, provide, onMounted, onUnmounted, type PropType } from 'vue';
import { useStore } from '@nanostores/vue';
import { v2DetailSurface } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { useEntryInteractions } from '../../lib/useEntryInteractions';
import V2EntryBody from './V2EntryBody.vue';
import V2EntryActions from './V2EntryActions.vue';
import EntrySearchButton from '../items/EntrySearchButton.vue';
import { useSheetShell } from '../../lib/iceberg/v2/useSheetShell';
import { useSwipeNav } from '../../lib/iceberg/v2/useSwipeNav';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
import type { EntryView } from '../../lib/iceberg/entryView';
import { useResizeObserver } from '@vueuse/core';

const props = defineProps({ item: Object as PropType<EntryView | null> });
const emit = defineEmits<{ close: []; navigate: [{ id: string; from?: string }] }>();

const { t } = useI18n();
const surf = useStore(v2DetailSurface);
const open = computed(() => !!props.item);

// 关闭时保住最后一条内容：父级把 item 置 null 的那一刻，面板才开始下滑，
// 若直接 v-if="item"，滑走的是一条空面板（内容瞬间消失、只剩圆角空壳）。
// 面板下滑 0.35s 走完再清空，与打开时滑入对称。
const CLOSE_MS = 380;
const rendered = ref<EntryView | null>(props.item ?? null);
let clearTimer = 0;
watch(
  () => props.item,
  (it) => {
    window.clearTimeout(clearTimer);
    if (it) rendered.value = it;
    else clearTimer = window.setTimeout(() => { rendered.value = null }, CLOSE_MS);
  },
  { immediate: true },
);

// 交互单实例（抽屉自身不直接用，只创建并下发给内容区）
const commentSectionEl = ref<HTMLElement | null>(null)
const itemId = toRef(() => (props.item as EntryView | null | undefined)?.id)
const ia = useEntryInteractions(itemId, commentSectionEl)
provide(ENTRY_IA_KEY, ia)
const { titleCopied, copyTitle } = ia
function setCommentEl(el: HTMLElement | null) {
  commentSectionEl.value = el
}

// 外壳：Esc / Tab 焦点循环 / 背景滚动锁 / 焦点移入与还原（与 BaseModal 同构的实现）
const { panelRef } = useSheetShell(open, () => emit('close'));

// 每次开/关复位拖拽残留的 inline transform（避免下次打开面板停留在半途）
watch(open, () => {
  if (panelRef.value) {
    panelRef.value.style.transition = '';
    panelRef.value.style.transform = '';
  }
});

// ===== 底部渐隐遮罩：正文可滚动且未滚到底时显示，滚到底后收起 =====
const bodyEl = ref<HTMLElement | null>(null);
const canScroll = ref(false);
const atBottom = ref(false);
// 内容高度变化（换词条/字体加载）要重算「能否滚动」；useResizeObserver 跟着 bodyEl 走

function refreshOverflow() {
  const el = bodyEl.value;
  canScroll.value = !!el && el.scrollHeight > el.clientHeight + 1;
}

function onBodyScroll() {
  const el = bodyEl.value;
  if (!el) return;
  atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
}

// 渐隐遮罩显隐：词条切换 / 评论展开 / 关联词条渲染后重新测量是否可滚动
// 同时把滚动位置归零：滑动/键盘切到下一条时面板是同一个 DOM，浏览器会把
// 原来的 scrollTop 原封不动带给新词条（实测滚到 197px 切过去，新词条开头看不见）
// immediate 不能省：抽屉首次打开就带着 item 挂载，watch 收不到那次变化 →
// canScroll 永远是 false，底部渐隐一次都不会出现（实测 display:none）
watch([open, () => props.item?.id, () => ia.commentsOpen], ([isOpen, id], prev) => {
  const switched = !!prev && id !== prev[1];
  nextTick(() => {
    if (open.value && bodyEl.value) {
      if (switched && bodyEl.value) bodyEl.value.scrollTop = 0;
      atBottom.value = false;
      refreshOverflow();
    } else {
      canScroll.value = false;
      atBottom.value = false;
    }
  });
}, { immediate: true });

// 正文区尺寸变化（换词条 / 字体加载 / 评论展开）→ 重算能否滚动。
// useResizeObserver 会跟着 bodyEl 这个 ref 走，目标变了自动重新观察。
useResizeObserver(bodyEl, refreshOverflow);

// ===== 左右滑动切换相邻词条（与桌面键盘 ←/→ 语义一致） =====
// 手势实现全在 useSwipeNav：passive 监听 + rAF 写 transform，不经过 Vue 响应式；
// 容器 CSS 带 touch-action: pan-y，纵向滚动/下滑关闭照旧
const swipePrevHint = ref<HTMLElement | null>(null);
const swipeNextHint = ref<HTMLElement | null>(null);
const { swipeEl } = useSwipeNav({
  prevId: () => (props.item as EntryView | null)?.prevId ?? null,
  nextId: () => (props.item as EntryView | null)?.nextId ?? null,
  onNavigate: (id) => emit('navigate', { id }),
  prevHint: swipePrevHint,
  nextHint: swipeNextHint,
});

// ===== handle 下滑拖拽关闭（rAF 节流，仿 IcebergApp.vue:80-99 抽屉拖拽） =====
let dragStartY = 0;
let dragPanY = 0;
let dragTick = false;
function onHandleTouchStart(e: TouchEvent) { dragStartY = e.touches[0].clientY; dragPanY = 0; dragTick = false; }
function onHandleTouchMove(e: TouchEvent) {
  dragPanY = e.touches[0].clientY - dragStartY;
  if (dragPanY > 10 && !dragTick) {
    dragTick = true;
    requestAnimationFrame(() => {
      if (panelRef.value) {
        panelRef.value.style.transform = `translateY(${dragPanY}px)`;
        panelRef.value.style.transition = 'none';
      }
      dragTick = false;
    });
  }
}
function onHandleTouchEnd() {
  if (!panelRef.value) return;
  panelRef.value.style.transition = '';
  if (dragPanY > 80) emit('close');
  else panelRef.value.style.transform = '';
}
function onHandleTouchCancel() {
  // 系统手势打断（通知栏下拉等）：位移清零、transform 复位，不残留
  dragPanY = 0;
  dragTick = false;
  if (panelRef.value) {
    panelRef.value.style.transition = '';
    panelRef.value.style.transform = '';
  }
}

</script>

<template>
  <Teleport to="body">
    <!-- 遮罩 -->
    <div class="sheet-overlay" :class="{ show: open }" :aria-label="t('close')" @click="$emit('close')" @touchmove.self.prevent />
    <div ref="panelRef" class="sheet-panel flex flex-col overflow-hidden" :class="{ show: open, 'surface-light': surf === 'light' }" role="dialog" aria-modal="true" :aria-hidden="!open" :inert="!open" tabindex="-1">
      <!-- 滑动方向提示：跟手淡入（左滑看下一条 → 右边缘 ‹；右滑看上一条 → 左边缘 ›）。
           挂在面板层级而不是滚动内容里，拖动时箭头留在屏幕边缘不跟着跑 -->
      <div ref="swipePrevHint" class="v2swipe-hint v2swipe-hint--prev" aria-hidden="true">
        <ChevronRight :size="22" :stroke-width="1.8" />
      </div>
      <div ref="swipeNextHint" class="v2swipe-hint v2swipe-hint--next" aria-hidden="true">
        <ChevronLeft :size="22" :stroke-width="1.8" />
      </div>
      <div class="shrink-0 flex justify-center pt-3 pb-2 touch-none"
        @touchstart="onHandleTouchStart" @touchmove="onHandleTouchMove" @touchend="onHandleTouchEnd" @touchcancel="onHandleTouchCancel">
        <div class="sheet-handle"></div>
      </div>
      <template v-if="rendered">
        <!-- 滚动区与底栏分离：渐隐遮罩 (.sheet-fade) 现在钉在滚动区底部，不会再盖到底栏上 -->
        <div ref="swipeEl" class="sheet-main">
          <div ref="bodyEl" class="sheet-body no-scrollbar overflow-y-auto pb-4 [-webkit-overflow-scrolling:touch]" @scroll="onBodyScroll">
            <div class="v2sheet-head">
              <button type="button" class="v2sheet-head__title" @click="copyTitle(rendered.title)"
                :aria-label="titleCopied ? t('titleCopied') : t('copyTitle')">
                <span class="v2-entry-title"><MirrorText :text="titleCopied ? t('titleCopied') : rendered.title" /></span>
              </button>
              <EntrySearchButton :title="rendered.title" touch />
            </div>

            <V2EntryBody :item="rendered" layout="sheet" @navigate="emit('navigate', $event)" @comment-el="setCommentEl" />
          </div>
          <div v-show="canScroll && !atBottom" class="sheet-fade" aria-hidden="true"></div>
        </div>
        <!-- 底栏：动作条在滚动区外，紧贴面板底部；外观参数与 card 的 .modal-footer 对齐 -->
        <div class="v2sheet-foot v2-dock">
          <V2EntryActions :item="rendered" layout="sheet" @navigate="emit('navigate', $event)" />
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 标题行：间距沿用原值（上 2 / 下 8）；移动端无 × 关闭键（下滑/点遮罩关闭），标题占满行宽 */
.v2sheet-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0 8px;
}
.v2sheet-head__title {
  flex: 1;
  min-width: 0;              /* 允许收缩：长标题不挤走关闭按钮 */
  padding: 6px 0;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--color-text-primary);
  cursor: pointer;
  touch-action: manipulation;
}
.v2sheet-head__title .v2-entry-title {
  display: block;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
/* 滚动区 + 渐隐遮罩 同处一栏：渐隐遮罩现在钉在滚动区底部而不是面板底部，
   否则会盖到底栏上（底栏也是 modal-bg 不透明，遮罩会把动作条蒙住）。 */
.sheet-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* 横向手势归 JS（左右滑动切换词条），纵向滚动与下滑关闭照旧；
     contain 同时挡掉 Chrome 横滑前进/后退的系统手势与箭头 UI */
  touch-action: pan-y;
  overscroll-behavior-x: contain;
}

/* 底部渐隐：正文还能往下滚时提示「下面还有」。原先模板里挂了 .sheet-fade 节点，
   但全仓库从来没有对应样式 —— 这个提示从上线起就没显示过，滚到中途也没有任何
   「下面还有内容」的视觉反馈。渐隐用 mask 而不是叠一层半透明遮罩：
   叠层会把正文压暗一层，mask 是让正文自己淡出，边缘更干净。 */
.sheet-fade {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 40px;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(to top, var(--color-modal-bg) 0%, transparent 100%);
}

/* 滑动方向提示：默认透明，由 useSwipeNav 按拖动进度写 opacity */
.v2swipe-hint {
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
  transition: opacity 0.12s linear;
}
.v2swipe-hint--prev { left: 8px; }
.v2swipe-hint--next { right: 8px; }
</style>
