<script setup lang="ts">
// V2EntryCard：桌面详情弹窗外壳。
// 只负责：BaseModal chrome（标题/关闭/焦点陷阱/滚动锁）+ 交互单实例创建 + ←/→ 切换。
// 内容区全部在 V2EntryBody；交互实例经 ENTRY_IA_KEY provide 下发。
import BaseModal from '../modals/BaseModal.vue';
import V2EntryBody from './V2EntryBody.vue';
import V2EntryActions from './V2EntryActions.vue';
import EntrySearchButton from '../items/EntrySearchButton.vue';
import { computed, ref, toRef, provide, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { v2DetailSurface } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { useEntryInteractions } from '../../lib/useEntryInteractions';
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
import { useSwipeNav } from '../../lib/iceberg/v2/useSwipeNav';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import type { EntryView } from '../../lib/iceberg/entryView';

const props = defineProps<{ item: EntryView }>();

const emit = defineEmits<{
  close: []
  navigate: [{ id: string; from?: string }]
}>();

const { t } = useI18n();
const surf = useStore(v2DetailSurface);

// 交互单实例（useEntryInteractions setup 即发网络请求，不可双调）：创建后下发给内容区
const commentSectionEl = ref<HTMLElement | null>(null)
const itemId = toRef(() => props.item?.id)
const ia = useEntryInteractions(itemId, commentSectionEl)
provide(ENTRY_IA_KEY, ia)
// 标题区只需复制能力，无需下发整个 ia
const { titleCopied, copyTitle } = ia
function setCommentEl(el: HTMLElement | null) {
  commentSectionEl.value = el
}

// ←/→ 键盘切换相邻词条；触屏用左右滑动（语义一致：右滑上一条、左滑下一条）
const swipePrevHint = ref<HTMLElement | null>(null)
const swipeNextHint = ref<HTMLElement | null>(null)
const { swipeEl } = useSwipeNav({
  prevId: () => props.item?.prevId ?? null,
  nextId: () => props.item?.nextId ?? null,
  onNavigate: (id) => emit('navigate', { id }),
  prevHint: swipePrevHint,
  nextHint: swipeNextHint,
})

function onKey(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'ArrowLeft' && props.item?.prevId) emit('navigate', { id: props.item.prevId });
  if (e.key === 'ArrowRight' && props.item?.nextId) emit('navigate', { id: props.item.nextId });
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

</script>

<template>
  <BaseModal v-if="item" :token="item.id" :title="titleCopied ? t('titleCopied') : item.title" :titleClick="() => copyTitle(item.title)" size="lg" titleClass="v2-entry-title tracking-wide" :surface="surf === 'light' ? 'light' : 'dark'" @close="$emit('close')">
    <template #header-actions>
      <EntrySearchButton :title="item.title" />
    </template>
    <div class="v2card-wrap">
      <!-- 滑动方向提示：挂在 wrap 上，拖动时留在边缘 -->
      <div ref="swipePrevHint" class="v2swipe-hint v2swipe-hint--prev" aria-hidden="true">
        <ChevronRight :size="22" :stroke-width="1.8" />
      </div>
      <div ref="swipeNextHint" class="v2swipe-hint v2swipe-hint--next" aria-hidden="true">
        <ChevronLeft :size="22" :stroke-width="1.8" />
      </div>
      <div ref="swipeEl" class="v2card-swipe">
        <V2EntryBody :item="item" layout="card" @navigate="emit('navigate', $event)" @comment-el="setCommentEl" />
      </div>
    </div>
    <template #footer>
      <V2EntryActions :item="item" layout="card" @navigate="emit('navigate', $event)" />
    </template>
  </BaseModal>
</template>

<style scoped>
/* 详情卡收紧头部与内容区边距（无需 V2EntryBody 负 margin 回抽）。
   动作条紧贴面板底部，复用 styles/v2.css 的 --v2-dock-padding。 */
:deep(.modal-header) { padding: 14px 22px 12px; }
:deep(.modal-body) { padding: 14px 22px 20px; }
:deep(.modal-footer) { padding: var(--v2-dock-padding); }

@media (max-width: 640px) {
  :deep(.modal-header) { padding: 12px 18px 10px; }
  :deep(.modal-body) { padding: 12px 18px 18px; }
}

/* 箭头锚点：不参与平移，箭头才能留在边缘 */
.v2card-wrap { position: relative; }

/* 滑动容器：横向手势归 JS（左右滑动切换），纵向滚动归浏览器 */
.v2card-swipe {
  position: relative;
  touch-action: pan-y;
  overscroll-behavior-x: contain;
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
