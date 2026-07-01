<script setup>
import BaseModal from '../modals/BaseModal.vue';
import { ref, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { favorites } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({ item: Object });
const emit = defineEmits(['close', 'navigate']);

const { t } = useI18n();

function onKey(e) {
  if (e.key === 'ArrowLeft' && props.item?.prevId) emit('navigate', { id: props.item.prevId });
  if (e.key === 'ArrowRight' && props.item?.nextId) emit('navigate', { id: props.item.nextId });
  if (e.key === 'Escape') emit('close');
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

const favs = useStore(favorites);
const copied = ref(false);

function toggleFav(id) {
  const cur = favorites.get();
  favorites.set(cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]);
}
async function copyShareLink(id) {
  const url = `${window.location.origin}${window.location.pathname}#${id}`
  await navigator.clipboard.writeText(url)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <BaseModal v-if="item" :title="copied ? '已复制链接' : item.title" :titleClick="() => copyShareLink(item.id)" size="lg" titleClass="!text-[1.25rem]" @close="$emit('close')">

    <template #header-actions>
      <div class="flex items-center gap-2 mr-1 pr-4 border-r border-white/10">
        
        <button @click="toggleFav(item.id)"
          class="flex items-center justify-center p-1.5 transition-colors cursor-pointer outline-none"
          :class="favs.includes(item.id) ? 'text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'text-white/30 hover:text-white/80'"
          :title="favs.includes(item.id) ? '取消收藏' : '收藏'">
          <svg width="17" height="17" viewBox="0 0 24 24" :fill="favs.includes(item.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>

        <template v-if="item.prevId || item.nextId">
          <div class="w-px h-3.5 bg-white/10 mx-1"></div> <button v-if="item.prevId" @click="emit('navigate', { id: item.prevId })"
            class="p-1 text-white/30 hover:text-white/90 text-sm leading-none transition-colors cursor-pointer" title="上一个">←</button>
          <button v-if="item.nextId" @click="emit('navigate', { id: item.nextId })"
            class="p-1 text-white/30 hover:text-white/90 text-sm leading-none transition-colors cursor-pointer" title="下一个">→</button>
        </template>
        
      </div>
    </template>

    <div class="flex flex-wrap items-center gap-3 mb-5">
      <span class="text-xs font-medium px-2 py-0.5 rounded border" :style="{ color: item.categoryColor, borderColor: item.categoryColor }">{{ item.category }}</span>
      <span v-for="tag in item.tags" :key="tag" class="text-[0.65rem] text-white/25">#{{ tag }}</span>
    </div>

    <p class="text-sm text-white/55 leading-relaxed whitespace-pre-wrap">{{ item.desc || t('noDescShort') }}</p>

    <div v-if="item.related.length > 0" class="mt-5 pt-4 border-t border-white/5">
      <div class="text-[0.6rem] font-bold text-white/20 uppercase tracking-[0.15em] mb-2">{{ t('relatedItem') }}</div>
      <div class="flex flex-wrap gap-1.5 mb-3">
        <button v-for="r in item.related" :key="r.id" @click="emit('navigate', r)"
          class="text-xs text-white/35 hover:text-white/70 px-2 py-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10">
          {{ r.title }}
        </button>
      </div>
    </div>

    <div v-if="item.recommended && item.recommended.length > 0" class="pt-3" :class="item.related.length > 0 ? '' : 'border-t border-white/5 mt-4'">
      <div class="text-[0.6rem] font-bold text-white/20 uppercase tracking-[0.15em] mb-2">{{ t('recommendedItem') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="r in item.recommended" :key="r.id" @click="emit('navigate', r)"
          class="text-xs text-white/35 hover:text-white/70 px-2 py-1 rounded-md hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10">
          {{ r.title }}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 mt-6">
      <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
        class="inline-flex items-center gap-1.5 py-2 px-5 border border-white/25 rounded-lg text-xs font-medium text-white/55 hover:bg-white/10 hover:text-white/85 hover:border-white/40 transition-colors">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
        {{ t('openLink') }}
      </a>
      <p v-if="!item.link" class="text-xs text-white/15 italic my-0">{{ t('noLink') }}</p>
    </div>

  </BaseModal>
</template>
