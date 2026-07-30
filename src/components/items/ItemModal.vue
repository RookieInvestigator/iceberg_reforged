<script setup>
import BaseModal from '../modals/BaseModal.vue';
import CommentPanel from './CommentPanel.vue';
import { ref, onMounted, onUnmounted, watch, inject, computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { favorites } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { user } from '../../lib/authStore';
import { toggleInteraction, fetchInteractionCount, fetchMyInteractions } from '../../lib/supabaseData';
import { isSupabaseReady } from '../../lib/supabase'

const props = defineProps({ item: Object });
const emit = defineEmits(['close', 'navigate']);

const { t } = useI18n();

function onKey(e) {
  if (e.key === 'ArrowLeft' && props.item?.prevId) emit('navigate', { id: props.item.prevId });
  if (e.key === 'ArrowRight' && props.item?.nextId) emit('navigate', { id: props.item.nextId });
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

const u = useStore(user);
const favs = useStore(favorites);
const copied = ref(false);
const liked = ref(false);
const likeCount = ref(0);
const updatingLike = ref(false);
const supabaseReady = isSupabaseReady()
const referencesMap = inject('referencesMap', new Map())
const refLinks = computed(() => referencesMap.get(props.item?.id || '') || [])

watch(() => props.item?.id, (id) => {
  if (!id) return
  liked.value = false
  likeCount.value = 0
  if (isSupabaseReady()) {
    Promise.all([
      fetchInteractionCount('item', id, 'like'),
      fetchMyInteractions('item', [id], 'like'),
    ]).then(([count, likedSet]) => {
      likeCount.value = count
      liked.value = likedSet.has(id)
    })
  }
})

async function toggleItemLike() {
  if (!props.item?.id) return
  if (!isSupabaseReady()) return
  updatingLike.value = true
  try {
    const result = await toggleInteraction('item', props.item.id, 'like')
    liked.value = result
    likeCount.value += result ? 1 : -1
  } catch (e) {
    alert(e.message || '请先登录')
  }
  updatingLike.value = false
}

function toggleFav(id) {
  if (!id) return
  const cur = favorites.get();
  const newFavs = cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]
  favorites.set(newFavs)
  if (u.value) {
    toggleInteraction('item', id, 'favorite').catch(() => {})
  }
}
async function copyShareLink(id) {
  const url = `${window.location.origin}${window.location.pathname}#${id}`
  await navigator.clipboard.writeText(url)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <BaseModal v-if="item" :title="copied ? '已复制链接' : item.title" :titleClick="() => copyShareLink(item.id)" size="lg" titleClass="!text-[1.25rem] font-semibold tracking-wide" @close="$emit('close')">

    <template #header-actions>
      <div class="flex items-center gap-1.5 mr-1 pr-3 border-r border-white/10">
        
        <button @click="toggleFav(item.id)"
          class="flex items-center justify-center p-1.5 transition-colors cursor-pointer outline-none"
          :class="favs.includes(item.id) ? 'text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-white/30 hover:text-white/80'"
          :title="favs.includes(item.id) ? '取消收藏' : '收藏'">
          <svg width="17" height="17" viewBox="0 0 24 24" :fill="favs.includes(item.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>

        <template v-if="supabaseReady">
        <button @click="toggleItemLike()" :disabled="updatingLike"
          class="flex items-center gap-1 p-1.5 transition-colors cursor-pointer outline-none"
          :class="liked ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.4)]' : 'text-white/30 hover:text-white/80'"
          :title="liked ? '取消点赞' : '点赞'">
          <svg width="16" height="16" viewBox="0 0 24 24" :fill="liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span v-if="likeCount > 0" class="text-[0.65rem] font-medium">{{ likeCount }}</span>
        </button>
        </template>

        <template v-if="item.prevId || item.nextId">
          <div class="w-px h-3.5 bg-white/10 mx-1"></div> 
          <button v-if="item.prevId" @click="emit('navigate', { id: item.prevId })"
            class="p-1.5 text-white/30 hover:text-white/90 text-sm leading-none transition-colors cursor-pointer" title="上一个">←</button>
          <button v-if="item.nextId" @click="emit('navigate', { id: item.nextId })"
            class="p-1.5 text-white/30 hover:text-white/90 text-sm leading-none transition-colors cursor-pointer" title="下一个">→</button>
        </template>
        
      </div>
    </template>

    <!-- Meta Info: 分类与标签 (极度压缩体积，紧贴上方) -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-3.5">
      <span class="text-[0.65rem] font-medium px-1.5 py-[1px] rounded border bg-white/[0.03]" 
            :style="{ color: item.categoryColor, borderColor: item.categoryColor }">
        {{ item.category }}
      </span>
      <div class="flex flex-wrap items-center gap-1.5">
        <span v-for="tag in item.tags" :key="tag" class="text-[0.65rem] text-white/30">#{{ tag }}</span>
      </div>
    </div>

        <!-- Description: 正文主视野 (提亮、放大、增加行高，充满呼吸感) -->
    <p class="text-sm text-white/80 leading-[1.65] whitespace-pre-wrap mb-4 antialiased">
      {{ item.desc || t('noDescShort') }}
    </p>

    <!-- Action Link: 行为召唤 (降级为纯文本链接样式，弱化其体积) -->
    <div class="mb-4">
      <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
        class="inline-flex items-center gap-1 text-[0.75rem] text-white/40 hover:text-white/90 underline underline-offset-4 decoration-white/20 hover:decoration-white/50 transition-all">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
        {{ t('openLink') }}
      </a>
      <p v-if="!item.link" class="text-[0.7rem] text-white/20 italic my-0">{{ t('noLink') }}</p>
    </div>

    <!-- 参考链接（副表） -->
    <div v-if="refLinks.length > 0" class="mb-4">
      <span class="text-[0.55rem] font-bold text-white/20 uppercase tracking-[0.15em]">参考链接</span>
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1">
        <a v-for="(r, ri) in refLinks" :key="ri" :href="r.url" target="_blank" rel="noopener"
          class="text-[0.72rem] text-white/35 hover:text-white/75 underline underline-offset-4 decoration-white/15 hover:decoration-white/40 transition-all">
          {{ r.label }}
        </a>
      </div>
    </div>

    <!-- Related & Recommended: 延伸阅读 (超链接化、流式首尾相连、完全去色块化) -->
    <div v-if="(item.related && item.related.length > 0) || (item.recommended && item.recommended.length > 0)" 
         class="pt-3 border-t border-white/5 flex flex-wrap items-baseline gap-y-1.5 gap-x-1">
      
      <template v-if="item.related && item.related.length > 0">
        <span class="text-[0.55rem] font-bold text-white/20 uppercase tracking-widest mr-1">{{ t('relatedItem') }}</span>
        <button v-for="r in item.related" :key="'rel-'+r.id" @click="emit('navigate', r)"
          class="text-[0.7rem] text-white/40 hover:text-white/85 px-1.5 py-0.5 rounded-sm hover:bg-white/10 transition-colors cursor-pointer">
          {{ r.title }}
        </button>
      </template>

      <template v-if="item.recommended && item.recommended.length > 0">
        <span class="text-[0.55rem] font-bold text-white/20 uppercase tracking-widest mr-1" 
              :class="{'ml-2.5': item.related && item.related.length > 0}">{{ t('recommendedItem') }}</span>
        <button v-for="r in item.recommended" :key="'rec-'+r.id" @click="emit('navigate', r)"
          class="text-[0.7rem] text-white/40 hover:text-white/85 px-1.5 py-0.5 rounded-sm hover:bg-white/10 transition-colors cursor-pointer">
          {{ r.title }}
        </button>
      </template>

    </div>

    <!-- Comments: 评论区 (自然衔接) -->
    <CommentPanel :itemId="item.id" />

  </BaseModal>
</template>