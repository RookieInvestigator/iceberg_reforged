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
import { useSheetShell } from '../../lib/iceberg/v2/useSheetShell';
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
import type { EntryView } from '../../lib/iceberg/entryView';

const props = defineProps({ item: Object as PropType<EntryView | null> });
const emit = defineEmits<{ close: []; navigate: [{ id: string; from?: string }] }>();

const { t } = useI18n();
const surf = useStore(v2DetailSurface);
const open = computed(() => !!props.item);

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
let bodyObserver: ResizeObserver | null = null;

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
watch([open, () => props.item?.id, () => ia.commentsOpen], () => {
  nextTick(() => {
    if (open.value && bodyEl.value && bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver.observe(bodyEl.value);
      atBottom.value = false;
      refreshOverflow();
    } else {
      canScroll.value = false;
      atBottom.value = false;
    }
  });
});

onMounted(() => {
  bodyObserver = new ResizeObserver(refreshOverflow);
});
onUnmounted(() => {
  bodyObserver?.disconnect();
  bodyObserver = null;
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
      <div class="shrink-0 flex justify-center pt-3 pb-2 touch-none"
        @touchstart="onHandleTouchStart" @touchmove="onHandleTouchMove" @touchend="onHandleTouchEnd" @touchcancel="onHandleTouchCancel">
        <div class="sheet-handle"></div>
      </div>
      <template v-if="item">
        <!-- 滚动区与底栏分离：渐隐遮罩 (.sheet-fade) 现在钉在滚动区底部，不会再盖到底栏上 -->
        <div class="sheet-main">
          <div ref="bodyEl" class="sheet-body no-scrollbar overflow-y-auto pb-4 [-webkit-overflow-scrolling:touch]" @scroll="onBodyScroll">
            <div class="v2sheet-head">
              <button type="button" class="v2sheet-head__title" @click="copyTitle(item.title)"
                :aria-label="titleCopied ? t('titleCopied') : t('copyTitle')">
                <span class="v2-entry-title">{{ titleCopied ? t('titleCopied') : item.title }}</span>
              </button>
              <button type="button" class="modal-close v2sheet-head__close" :aria-label="t('close')" @click="$emit('close')">&times;</button>
            </div>

            <V2EntryBody :item="item" layout="sheet" @navigate="emit('navigate', $event)" @comment-el="setCommentEl" />
          </div>
          <div v-show="canScroll && !atBottom" class="sheet-fade" aria-hidden="true"></div>
        </div>
        <!-- 底栏：动作条在滚动区外，紧贴面板底部；外观参数与 card 的 .modal-footer 对齐 -->
        <div class="v2sheet-foot v2-dock">
          <V2EntryActions :item="item" layout="sheet" @navigate="emit('navigate', $event)" />
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
/* 标题行：间距沿用原值（上 2 / 下 8）；只补偿关闭按钮的垂直对齐 ——
   × 在 44px 内居中、中心在 22px，标题首行文字中心在 6+13=19px，故上移 4px 与首行齐平。 */
.v2sheet-head {
  display: flex;
  align-items: flex-start;
  gap: 4px;
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
/* 复用 modal.css 的 .modal-close 配色/字号，只补布局、44px 触控目标与对齐补偿 */
.v2sheet-head__close {
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
  margin-top: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* 滚动区 + 渐隐遮罩 同处一栏：渐隐遮罩现在钉在滚动区底部而不是面板底部，
   否则会盖到底栏上（底栏也是 modal-bg 不透明，遮罩会把动作条蒙住）。 */
.sheet-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
