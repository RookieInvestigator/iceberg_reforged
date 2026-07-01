<script setup>
import { computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { favorites } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({ item: Object });
const emit = defineEmits(['close', 'navigate']);

const { t } = useI18n();
const favs = useStore(favorites);
const open = computed(() => !!props.item);

function toggleFav(id) {
  const cur = favorites.get();
  favorites.set(cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id]);
}
</script>

<template>
  <Teleport to="body">
    <div class="sheet-overlay" :class="{ show: open }" @click="$emit('close')" />
    <div class="sheet-panel" :class="{ show: open }">
      <div class="flex justify-center pt-3 pb-2"><div class="sheet-handle"></div></div>
      <template v-if="item">
        <div class="flex items-center gap-2 mb-4">
          <div class="text-[1.3rem] font-black text-white leading-snug flex-1">{{ item.title }}</div>
          <button @click="toggleFav(item.id)"
            :style="{color: favs.includes(item.id) ? '#f59e0b' : 'rgba(255,255,255,.2)', cursor:'pointer',background:'none',border:'none',fontSize:'1.3rem',lineHeight:1,padding:0,flexShrink:0}">
            {{ favs.includes(item.id) ? '★' : '☆' }}
          </button>
        </div>
        <div v-if="item.desc" class="text-[1rem] leading-relaxed text-white/60 whitespace-pre-wrap">{{ item.desc }}</div>
        <div class="mt-5 pt-4 border-t text-[0.85rem] text-white/40" style="border-color: var(--color-surface-border, #333)">
          {{ t('categories') }}: <span :style="{ color: item.color || '#fff' }">{{ item.category }}</span>
          <template v-if="item.tags"> &nbsp;|&nbsp; {{ t('tags') }}: {{ item.tags }}</template>
        </div>

        <!-- 关联词条 -->
        <div v-if="item.related && item.related.length > 0" class="mt-4 pt-3 border-t" style="border-color:var(--color-surface-border,#333)">
          <div class="text-[0.7rem] font-bold text-white/20 uppercase tracking-[0.15em] mb-2">{{ t('relatedItem') }}</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="r in item.related" :key="r.id" @click="emit('navigate', r)"
              class="text-xs text-white/35 hover:text-white/70 px-2 py-1 rounded-md hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
              {{ r.title }}
            </button>
          </div>
        </div>
        <div v-if="item.recommended && item.recommended.length > 0" class="mt-3 pt-3 border-t" style="border-color:var(--color-surface-border,#333)">
          <div class="text-[0.7rem] font-bold text-white/20 uppercase tracking-[0.15em] mb-2">{{ t('recommendedItem') }}</div>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="r in item.recommended" :key="r.id" @click="emit('navigate', r)"
              class="text-xs text-white/35 hover:text-white/70 px-2 py-1 rounded-md hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
              {{ r.title }}
            </button>
          </div>
        </div>

        <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
          class="inline-block mt-5 px-5 py-2 rounded-full text-sm text-white/60 hover:text-white/90 border border-white/15 hover:border-white/30 transition-all no-underline">
          {{ t('openLink') }}
        </a>
      </template>
    </div>
  </Teleport>
</template>
