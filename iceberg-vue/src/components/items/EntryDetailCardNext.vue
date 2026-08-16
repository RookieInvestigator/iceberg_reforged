<script setup lang="ts">
import { Heart, Star, Copy, MessageCircle, ChevronLeft, ChevronRight, ExternalLink } from '@lucide/vue';
import BaseModal from '../modals/BaseModal.vue';
import CommentPanel from './CommentPanel.vue';
import EntryMetaBadges from './EntryMetaBadges.vue';
import EntryRelatedLinks from './EntryRelatedLinks.vue';
import { ref, computed, inject, toRef, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { useEntryInteractions } from '../../lib/useEntryInteractions';

export interface EntryDetailCardLink {
  label: string
  url: string
}

export interface EntryDetailCardRelated {
  id: string
  title: string
  category?: string
}

export interface EntryDetailCardItem {
  id: string
  title: string
  tier?: string
  category: string
  categoryColor: string
  tags: string[]
  desc: string
  link?: string
  references?: EntryDetailCardLink[]
  related?: EntryDetailCardRelated[]
  recommended?: EntryDetailCardRelated[]
  prevId?: string
  nextId?: string
}

const props = defineProps<{ item: EntryDetailCardItem }>();

const emit = defineEmits<{
  close: []
  navigate: [{ id: string }]
}>();

const { t } = useI18n();

// P2-14：交互逻辑收敛至 useEntryInteractions（收藏/点赞/评论计数/复制/评论区开关）
const commentSectionEl = ref<HTMLElement | null>(null)
const itemId = toRef(() => props.item?.id)
const { favs, copied, liked, likeCount, commentCount, updatingLike, commentsOpen, supabaseReady, toggleItemLike, toggleFav, copyShareLink, openComments } = useEntryInteractions(itemId, commentSectionEl)

// 参考链接：显式 references 优先，否则回退副表 referencesMap（同 ItemModal）
const referencesMap = inject<Map<string, EntryDetailCardLink[]>>('referencesMap', new Map())
const refLinks = computed(() => {
  const id = props.item?.id
  if (!id) return []
  return props.item.references?.length ? props.item.references : (referencesMap.get(id) || [])
})

// 关联词条：副表精选 related 与相似度推荐 recommended 分两组展示（同 ItemModal）
const hasRelated = computed(() => !!(props.item?.related?.length || props.item?.recommended?.length))

// 描述间距自适应：短描述（<=100 字，约 1-3 行）上下保底 32px 呼吸空间；长描述内容本身占空间，回归紧凑
const descSpacing = computed(() => ((props.item?.desc || '').length > 100 ? 'my-4' : 'my-8'))

// ←/→ 键盘切换相邻词条（同 ItemModal，聚焦输入时不响应）
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
  <BaseModal v-if="item" :title="copied ? t('linkCopied') : item.title" :titleClick="() => copyShareLink(item.id)" size="lg" titleClass="!text-[1.25rem] font-semibold tracking-wide" @close="$emit('close')">

    <!-- ── 描述区：核心（阅读）；-mt-3 抵消 modal-body 顶部 padding，压缩头部下方留白 ── -->
    <div class="-mt-3">
      <EntryMetaBadges :tier="item.tier" :category="item.category" :categoryColor="item.categoryColor" :tags="item.tags" />
    </div>

    <!-- 描述自带上下留白（descSpacing 自适应：短描述保底大留白，长描述回归紧凑）；占位为灰色斜体 -->
    <p class="text-[15px] leading-[1.8] whitespace-pre-wrap antialiased"
       :class="[descSpacing, item.desc ? 'text-white/85' : 'italic text-white/55']">
      {{ item.desc || t('noDescShort') }}
    </p>

    <!-- 链接：词条内容的延伸，与描述同区（弱化、无线分隔）；作为滚动流末尾时压缩底部留白 -->
    <div :class="!hasRelated && !commentsOpen ? '-mb-4' : ''">
      <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
        class="inline-flex items-center gap-1 text-[length:var(--font-xs)] text-white/60 hover:text-white/90 underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-colors">
        <ExternalLink :size="11" :stroke-width="2" />
        {{ t('openLink') }}
      </a>

      <div v-if="refLinks.length" :class="item.link ? 'mt-1.5' : ''">
        <span class="text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.15em]">{{ t('referenceLinks') }}</span>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          <a v-for="(r, i) in refLinks" :key="i" :href="r.url" target="_blank" rel="noopener"
            class="text-[length:var(--font-xs)] text-white/60 hover:text-white/90 underline underline-offset-4 decoration-white/15 hover:decoration-white/40 transition-colors">
            {{ r.label }}
          </a>
        </div>
      </div>
    </div>

    <!-- ── 拓展信息区：关联词条（跳板，沉底弱化）；评论收起时作为末尾压缩底部留白 ── -->
    <div v-if="hasRelated" class="mt-3 pt-1 border-t border-white/5" :class="commentsOpen ? '' : '-mb-4'">
      <EntryRelatedLinks :related="item.related" :recommended="item.recommended" @navigate="emit('navigate', $event)" />
    </div>

    <!-- ── 参与区：评论区（v-if 受控：未展开时不渲染，推荐词条下方不留空位；-mb-4 压缩末尾留白）── -->
    <div v-if="commentsOpen" ref="commentSectionEl" class="mt-2.5 pt-2 border-t border-white/5 -mb-4 max-sm:mt-3.5 max-sm:pt-2.5">
      <CommentPanel :itemId="item.id" :opened="commentsOpen" />
    </div>

    <!-- ── 交互区：底部常驻动作条（不随滚动）── -->
    <template #footer>
      <div class="entry-action-bar">
        <div class="flex items-center gap-1">
          <button v-if="supabaseReady" @click="toggleItemLike()" :disabled="updatingLike"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] transition-colors cursor-pointer disabled:opacity-50"
            :class="liked ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]' : 'text-white/60 hover:text-white/90'"
            :title="liked ? t('unlike') : t('like')">
            <Heart :size="16" :stroke-width="1.7" :fill="liked ? 'currentColor' : 'none'" />
            <span v-if="likeCount > 0" class="text-[length:var(--font-tiny)] font-medium">{{ likeCount }}</span>
          </button>

          <button v-if="supabaseReady" @click="openComments"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] transition-colors cursor-pointer text-white/60 hover:text-white/90"
            :title="t('commentsTitle')">
            <MessageCircle :size="16" :stroke-width="1.7" />
            <span v-if="commentCount > 0" class="text-[length:var(--font-tiny)] font-medium">{{ commentCount }}</span>
          </button>

          <button @click="toggleFav(item.id)"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] transition-colors cursor-pointer"
            :class="favs.includes(item.id) ? 'fav-on' : 'text-white/60 hover:text-white/90'"
            :title="favs.includes(item.id) ? t('unfavorite') : t('favorite')">
            <Star :size="17" :stroke-width="1.7" :fill="favs.includes(item.id) ? 'currentColor' : 'none'" />
          </button>

          <button @click="copyShareLink(item.id)"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] transition-colors cursor-pointer"
            :class="copied ? 'text-white/80' : 'text-white/60 hover:text-white/90'"
            :title="copied ? t('linkCopied') : t('copyLink')">
            <Copy :size="16" :stroke-width="1.7" />
          </button>
        </div>

        <div v-if="item.prevId || item.nextId" class="flex items-center">
          <button v-if="item.prevId" @click="emit('navigate', { id: item.prevId })"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] text-white/60 hover:text-white/90 transition-colors cursor-pointer" :title="t('prevEntry')">
            <ChevronLeft :size="17" :stroke-width="1.7" />
          </button>
          <button v-if="item.nextId" @click="emit('navigate', { id: item.nextId })"
            class="entry-action-btn max-sm:min-w-[40px] max-sm:min-h-[40px] text-white/60 hover:text-white/90 transition-colors cursor-pointer" :title="t('nextEntry')">
            <ChevronRight :size="17" :stroke-width="1.7" />
          </button>
        </div>
      </div>
    </template>

  </BaseModal>
</template>

<style scoped>
.entry-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.entry-action-btn {
  min-width: 36px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  color: var(--white-60);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.entry-action-btn.fav-on { color: var(--color-fav); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--color-fav) 45%, transparent)); }
.entry-action-btn:hover:not(:disabled) { background: var(--white-06); }
.entry-action-btn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
</style>
