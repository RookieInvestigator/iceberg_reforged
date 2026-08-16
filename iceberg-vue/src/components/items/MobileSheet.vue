<script setup lang="ts">
import { computed, ref, watch, inject, toRef, onMounted, onUnmounted, nextTick } from 'vue';
import { Star, Heart, MessageCircle, Copy } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { lockOverlay } from '../../lib/overlayLock';
import { REFERENCES_MAP_KEY, type ReferenceLink } from '../../lib/injectionKeys';
import { useEntryInteractions } from '../../lib/useEntryInteractions';
import CommentPanel from './CommentPanel.vue';
import EntryRelatedLinks from './EntryRelatedLinks.vue';
import EntryMetaBadges from './EntryMetaBadges.vue';

const props = defineProps({ item: Object });
const emit = defineEmits(['close', 'navigate']);

const { t } = useI18n();
const open = computed(() => !!props.item);

// P2-14：交互逻辑收敛至 useEntryInteractions（收藏/点赞/评论计数/复制/评论区开关）
const commentSectionEl = ref<HTMLElement | null>(null)
const itemId = toRef(() => (props.item as { id?: string } | null | undefined)?.id)
const { favs, copied, liked, likeCount, commentCount, updatingLike, commentsOpen, supabaseReady, toggleItemLike, toggleFav, copyShareLink, openComments } = useEntryInteractions(itemId, commentSectionEl)

const panelRef = ref<HTMLElement | null>(null);
let sheetUnlock: (() => void) | null = null; // F20：overlay 滚动锁 token 释放函数

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

// ===== M-B: Esc 键关闭 + 焦点陷阱（P2-6：打开移焦入面板、Tab 循环、关闭还原焦点） =====
let previousFocus: HTMLElement | null = null;

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const panel = panelRef.value;
  if (!panel) return;
  const focusable = getFocusable(panel);
  if (focusable.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || !panel.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last || !panel.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

// ===== M-C: 背景滚动锁（F20：模块级 overlayLock，token 管理，与 BaseModal 协调） =====
function lockScroll() {
  sheetUnlock = lockOverlay()
}
function unlockScroll() {
  sheetUnlock?.()
  sheetUnlock = null
}

watch(open, (isOpen) => {
  // M-B: 每次开/关复位拖拽残留的 inline transform（避免下次打开面板停留在半途）
  if (panelRef.value) {
    panelRef.value.style.transition = '';
    panelRef.value.style.transform = '';
  }
  if (isOpen) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockScroll();
    // P2-6：打开后焦点移入面板（首个可聚焦元素或面板本身）
    nextTick(() => {
      const panel = panelRef.value;
      if (!panel) return;
      const focusable = getFocusable(panel);
      if (focusable.length > 0) focusable[0].focus();
      else panel.focus();
    });
  } else {
    unlockScroll();
    try {
      previousFocus?.focus();
    } catch {
      // 触发元素可能已卸载（路由切换等），静默降级
    }
    previousFocus = null;
  }
});

// 渐隐遮罩显隐：词条切换 / 评论展开 / 关联词条渲染后重新测量是否可滚动
watch([open, () => props.item?.id, commentsOpen], () => {
  nextTick(() => {
    if (open.value && bodyEl.value && bodyObserver) {
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
  document.addEventListener('keydown', onKey);
  bodyObserver = new ResizeObserver(refreshOverflow);
});
onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
  if (open.value) unlockScroll();
  bodyObserver?.disconnect();
  bodyObserver = null;
});

// ===== M-B: handle 下滑拖拽关闭（rAF 节流，仿 IcebergApp.vue:80-99 抽屉拖拽） =====
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

const referencesMap = inject(REFERENCES_MAP_KEY, new Map<string, ReferenceLink[]>())
const refLinks = computed(() => referencesMap.get(props.item?.id || '') || [])
// 关联/推荐词条是否存在（与 PC 弹窗一致，控制分区显隐）
const hasRelated = computed(() => !!((props.item as any)?.related?.length || (props.item as any)?.recommended?.length))
// 兼容 tags 可能是数组或字符串（旧数据/历史 payload）的情况，统一转成数组再交给徽章组件
type TagValue = string | string[]
const tagList = computed<string[]>(() => {
  const raw = (props.item as any)?.tags as TagValue | undefined
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
    return raw.split(/[,，|]/).map(s => s.trim()).filter(Boolean)
  }
  return []
})
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩（P2-17：close key 已入字典） -->
    <div class="sheet-overlay" :class="{ show: open }" :aria-label="t('close')" @click="$emit('close')" @touchmove.self.prevent />
    <div ref="panelRef" class="sheet-panel flex flex-col overflow-hidden" :class="{ show: open }" role="dialog" aria-modal="true" :aria-hidden="!open" :inert="!open" tabindex="-1">
      <div class="shrink-0 flex justify-center pt-3 pb-2 touch-none"
        @touchstart="onHandleTouchStart" @touchmove="onHandleTouchMove" @touchend="onHandleTouchEnd" @touchcancel="onHandleTouchCancel">
        <div class="sheet-handle"></div>
      </div>
      <template v-if="item">
        <div ref="bodyEl" class="sheet-body no-scrollbar flex-1 min-h-0 overflow-y-auto pb-6 [-webkit-overflow-scrolling:touch]" @scroll="onBodyScroll">
          <div class="mt-0.5 mb-2">
            <button type="button" class="block w-full py-1.5 bg-transparent border-none text-text-primary text-left cursor-pointer touch-manipulation" @click="copyShareLink(item.id)"
              :aria-label="copied ? t('linkCopied') : t('copyLink')">
              <span class="block text-xl font-black leading-[1.3] tracking-[0.01em] [overflow-wrap:anywhere]">{{ copied ? t('linkCopied') : item.title }}</span>
            </button>
          </div>

          <!-- PC 弹窗同款：先元信息徽章，再描述 -->
          <div class="mb-2.5">
            <EntryMetaBadges :tier="item.tier" :category="item.category" :categoryColor="item.color || '#fff'" :tags="tagList" />
          </div>

          <p class="text-base leading-[1.7] text-white-85 whitespace-pre-wrap m-0 mb-3" :class="item.desc ? '' : 'text-white-55 italic'">
            {{ item.desc || t('noDescShort') }}
          </p>

          <!-- 链接区：与 PC 弹窗一致，弱化、和描述同区 -->
          <div v-if="item.link || refLinks.length" class="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-0.5 pt-1 pb-2">
            <a v-if="item.link" :href="item.link" target="_blank" rel="noopener" class="inline-flex items-center min-h-11 px-0.5 text-xs text-white-60 underline decoration-white-20 underline-offset-[3px] transition-colors duration-150 hover:text-white-90 hover:decoration-white-50">
              {{ t('openLink') }}
            </a>
            <template v-if="refLinks.length">
              <span class="text-micro font-bold text-white-50 uppercase tracking-[0.15em]">{{ t('referenceLinks') }}</span>
              <a v-for="(r, ri) in refLinks" :key="ri" :href="r.url" target="_blank" rel="noopener" class="inline-flex items-center min-h-11 px-0.5 text-xs text-white-60 underline decoration-white-20 underline-offset-[3px] transition-colors duration-150 hover:text-white-90 hover:decoration-white-50">
                {{ r.label }}
              </a>
            </template>
          </div>

          <!-- 拓展信息区：关联/推荐词条，PC 弹窗同款分区 -->
          <div v-if="hasRelated" class="mt-1.5 pt-2 border-t border-white-05">
            <EntryRelatedLinks variant="sheet" :related="item.related" :recommended="item.recommended" @navigate="emit('navigate', $event)" />
          </div>

          <!-- 参与区：评论区 -->
          <div v-if="commentsOpen" ref="commentSectionEl" class="mt-1.5 pt-2 border-t border-white-05">
            <CommentPanel v-if="supabaseReady && item" :itemId="item.id" :opened="commentsOpen" />
          </div>

          <!-- 操作区：弱化的内联操作（点赞/评论/收藏/复制），随正文滚动，不再固定底部 -->
          <div class="flex items-center justify-start gap-0.5 mt-2.5 pt-2 border-t border-white-05">
            <button v-if="supabaseReady" type="button" class="min-w-11 min-h-11 inline-flex items-center justify-center gap-1 px-1.5 text-white-45 bg-transparent border-none rounded-lg cursor-pointer touch-manipulation transition-colors duration-150 enabled:hover:bg-white-05 enabled:active:bg-white-08 disabled:opacity-40 disabled:cursor-default" @click="toggleItemLike()" :disabled="updatingLike"
              :title="liked ? t('unlike') : t('like')"
              :aria-label="liked ? t('unlike') : t('like')"
              :class="liked ? 'text-danger' : ''">
              <Heart :size="16" :stroke-width="1.7" :fill="liked ? 'currentColor' : 'none'" />
              <span v-if="likeCount > 0" class="text-tiny font-medium leading-none">{{ likeCount }}</span>
            </button>
            <button v-if="supabaseReady" type="button" class="min-w-11 min-h-11 inline-flex items-center justify-center gap-1 px-1.5 text-white-45 bg-transparent border-none rounded-lg cursor-pointer touch-manipulation transition-colors duration-150 enabled:hover:bg-white-05 enabled:active:bg-white-08 disabled:opacity-40 disabled:cursor-default" @click="openComments"
              :title="t('commentsTitle')" :aria-label="t('commentsTitle')">
              <MessageCircle :size="16" :stroke-width="1.7" />
              <span v-if="commentCount > 0" class="text-tiny font-medium leading-none">{{ commentCount }}</span>
            </button>
            <button type="button" class="min-w-11 min-h-11 inline-flex items-center justify-center gap-1 px-1.5 text-white-45 bg-transparent border-none rounded-lg cursor-pointer touch-manipulation transition-colors duration-150 enabled:hover:bg-white-05 enabled:active:bg-white-08 disabled:opacity-40 disabled:cursor-default" @click="toggleFav(item.id)"
              :title="favs.includes(item.id) ? t('unfavorite') : t('favorite')"
              :aria-label="favs.includes(item.id) ? t('unfavorite') : t('favorite')"
              :class="favs.includes(item.id) ? 'text-fav' : ''">
              <Star :size="16" :stroke-width="1.7" :fill="favs.includes(item.id) ? 'currentColor' : 'none'" />
            </button>
            <button type="button" class="min-w-11 min-h-11 inline-flex items-center justify-center gap-1 px-1.5 text-white-45 bg-transparent border-none rounded-lg cursor-pointer touch-manipulation transition-colors duration-150 enabled:hover:bg-white-05 enabled:active:bg-white-08 disabled:opacity-40 disabled:cursor-default" @click="copyShareLink(item.id)"
              :title="copied ? t('linkCopied') : t('copyLink')"
              :aria-label="copied ? t('linkCopied') : t('copyLink')"
              :class="copied ? 'text-white-90' : ''">
              <Copy :size="16" :stroke-width="1.7" />
            </button>
          </div>
        </div>
      </template>
      <div v-show="canScroll && !atBottom" class="sheet-fade" aria-hidden="true"></div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 底部半透明渐隐遮罩：钉在面板底边（位于滚动区之外，不随内容滚动），内容滚过时渐隐。
   颜色混合较复杂（color-mix + token），保留 scoped 而非冗长任意值 */
.sheet-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 104px;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-modal-bg) 60%, transparent) 45%, var(--color-modal-bg));
  pointer-events: none;
}
</style>
