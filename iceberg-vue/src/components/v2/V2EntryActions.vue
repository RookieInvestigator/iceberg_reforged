<script setup lang="ts">
// V2EntryActions（/v2 专用）：点赞 / 评论 / 收藏 / 复制 + 前后导航。
//
// 为什么从 V2EntryBody 里拆出来：
//   「紧贴面板底部」要求动作条位于**滚动容器之外**。放在 .modal-body 内只能靠
//   sticky + 负 margin 去抵消容器的 32px 底内边距 —— 既会被 sticky 的包含块约束
//   夹住，滚动时还会飘，数值也随宿主容器漂移。拆出后由外壳各自停靠，
//   内容区回到「只管内容」的单一职责。
//
// 自身不画分隔线/背景/留白：那是底栏（.modal-footer / .v2sheet-foot）的事，
// 本件只出「一行按钮」，因此 card 与 sheet 两种宿位共用同一份外观。
import { computed, inject, ref } from 'vue';
import { Heart, Star, Copy, Check, MessageCircle, ChevronLeft, ChevronRight, PencilLine } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import type { EntryView } from '../../lib/iceberg/entryView';
import { ENTRY_IA_KEY } from '../../lib/iceberg/v2/keys';
import FeedbackModal from '../modals/FeedbackModal.vue';

const props = defineProps<{
  item: EntryView
  /** card（弹窗底栏）/ sheet（抽屉底栏）—— 只决定按钮尺寸，与内容区同义 */
  layout: 'card' | 'sheet'
}>();
const emit = defineEmits<{ navigate: [{ id: string; from?: string }] }>();

const { t } = useI18n();
const ia = inject(ENTRY_IA_KEY)
if (!ia) throw new Error('[V2EntryActions] 缺少 ENTRY_IA_KEY：交互实例须由外壳 provide')
const {
  favs, copied, liked, likeCount, commentCount, updatingLike, supabaseReady,
  toggleItemLike, toggleFav, copyShareLink, openComments,
} = ia
const isFav = computed(() => (favs.value as string[]).includes(props.item.id))
const showFeedback = ref(false)
</script>

<template>
  <div class="v2act" :class="`v2act--${layout}`">
    <div class="v2act__main">
      <button v-if="supabaseReady" type="button" class="v2act-btn" :class="{ 'is-liked': liked }"
        :disabled="updatingLike" @click="toggleItemLike()"
        :title="liked ? t('unlike') : t('like')"
        :aria-label="liked ? t('unlike') : t('like')">
        <Heart :size="16" :stroke-width="1.7" :fill="liked ? 'currentColor' : 'none'" />
        <span v-if="likeCount > 0" class="v2act-btn__count">{{ likeCount }}</span>
      </button>

      <button v-if="supabaseReady" type="button" class="v2act-btn" @click="openComments"
        :title="t('commentsTitle')" :aria-label="t('commentsTitle')">
        <MessageCircle :size="16" :stroke-width="1.7" />
        <span v-if="commentCount > 0" class="v2act-btn__count">{{ commentCount }}</span>
      </button>

      <button type="button" class="v2act-btn" :class="{ 'is-fav': isFav }" @click="toggleFav(item.id)"
        :title="isFav ? t('unfavorite') : t('favorite')"
        :aria-label="isFav ? t('unfavorite') : t('favorite')">
        <Star :size="17" :stroke-width="1.7" :fill="isFav ? 'currentColor' : 'none'" />
      </button>

      <button type="button" class="v2act-btn" :class="{ 'is-copied': copied }" @click="copyShareLink(item.id)"
        :title="copied ? t('linkCopied') : t('copyLink')"
        :aria-label="copied ? t('linkCopied') : t('copyLink')">
        <Check v-if="copied" :size="16" :stroke-width="2.2" />
        <Copy v-else :size="16" :stroke-width="1.7" />
        <span v-if="copied" class="v2act-btn__count whitespace-nowrap">{{ t('linkCopied') }}</span>
      </button>

      <button v-if="supabaseReady" type="button" class="v2act-btn" @click="showFeedback = true"
        :title="t('feedback')" :aria-label="t('feedback')">
        <PencilLine :size="16" :stroke-width="1.7" />
      </button>
      <FeedbackModal v-if="showFeedback" :item="item" @close="showFeedback = false" />
    </div>

    <!-- 前后导航：抽屉里没有 ←/→ 语境，只在弹窗给 -->
    <div v-if="layout === 'card' && (item.prevId || item.nextId)" class="v2act__nav">
      <button v-if="item.prevId" type="button" class="v2act-btn" @click="emit('navigate', { id: item.prevId })"
        :title="t('prevEntry')" :aria-label="t('prevEntry')">
        <ChevronLeft :size="17" :stroke-width="1.7" />
      </button>
      <button v-if="item.nextId" type="button" class="v2act-btn" @click="emit('navigate', { id: item.nextId })"
        :title="t('nextEntry')" :aria-label="t('nextEntry')">
        <ChevronRight :size="17" :stroke-width="1.7" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.v2act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.v2act__main,
.v2act__nav { display: flex; align-items: center; gap: 4px; }

/* 按钮基础：尺寸与配色交给宿主（.v2act--card / --sheet），模板里不判 layout */
.v2act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--white-45);
  touch-action: manipulation;
  transition: color 0.15s, background-color 0.15s;
}
.v2act-btn:disabled { cursor: default; }
.v2act-btn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.v2act-btn__count { font-size: var(--font-tiny); font-weight: 500; }

/* card：36px 规格 */
.v2act--card .v2act-btn {
  min-width: 36px;
  min-height: 36px;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--white-60);
}
.v2act--card .v2act-btn:hover:not(:disabled) { background: var(--white-06); }
.v2act--card .v2act-btn:disabled { opacity: 0.5; }

/* sheet：44px 触控规格 */
.v2act--sheet .v2act-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 6px;
  border-radius: 8px;
  color: var(--white-45);
}
.v2act--sheet .v2act-btn:hover:not(:disabled) { background: var(--white-05); }
.v2act--sheet .v2act-btn:active:not(:disabled) { background: var(--white-08); }
.v2act--sheet .v2act-btn:disabled { opacity: 0.4; }

/* 状态色：两端同色，仅 card 额外带光晕 */
.v2act-btn.is-liked { color: var(--color-danger); }
.v2act-btn.is-fav { color: var(--color-fav); }
.v2act-btn.is-copied { color: var(--white-90); background: var(--white-10); }
.v2act--card .v2act-btn.is-liked {
  filter: drop-shadow(0 0 8px rgba(248, 113, 113, 0.4));
}
.v2act--card .v2act-btn.is-fav {
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--color-fav) 45%, transparent));
}

@media (max-width: 640px) {
  .v2act--card .v2act-btn { min-width: 40px; min-height: 40px; }
}
</style>
