<script setup lang="ts">
// V2EntryCard（/v2 专用）：桌面详情弹窗外壳。
// 只负责：BaseModal chrome（标题/关闭/焦点陷阱/滚动锁）+ 交互单实例创建 + ←/→ 切换。
// 内容区全部在 V2EntryBody；交互实例经 ENTRY_IA_KEY 下发，不再当 prop 传。
import BaseModal from '../modals/BaseModal.vue';
import V2EntryBody from './V2EntryBody.vue';
import V2EntryActions from './V2EntryActions.vue';
import { ref, toRef, provide, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { v2DetailSurface } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { useEntryInteractions } from '../../lib/useEntryInteractions';
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
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

// ←/→ 键盘切换相邻词条（聚焦输入时不响应；Esc 由 BaseModal 处理）
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
  <BaseModal v-if="item" :title="titleCopied ? t('titleCopied') : item.title" :titleClick="() => copyTitle(item.title)" size="lg" titleClass="v2-entry-title tracking-wide" :surface="surf === 'light' ? 'light' : 'dark'" @close="$emit('close')">
    <V2EntryBody :item="item" layout="card" @navigate="emit('navigate', $event)" @comment-el="setCommentEl" />
    <template #footer>
      <V2EntryActions :item="item" layout="card" @navigate="emit('navigate', $event)" />
    </template>
  </BaseModal>
</template>

<style scoped>
/* 动作条「紧贴面板底部」：默认 .modal-footer 的 8px 上下 padding 偏松，
   改用与 sheet 的 .v2sheet-foot 共享的 --v2-dock-padding 变量（见 styles/v2.css）。 */
:deep(.modal-footer) { padding: var(--v2-dock-padding); }
</style>
