<script setup>
import { useI18n } from '../lib/useI18n';

defineProps({ item: Object });
const emit = defineEmits(['close', 'navigate']);

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="item" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel no-scrollbar" style="max-width:480px" @click.stop>

          <div class="flex items-center justify-between mb-5">
            <h2 class="text-base font-bold text-white tracking-wide">{{ item.title }}</h2>
            <button @click="$emit('close')" class="text-white/25 hover:text-white/60 text-lg leading-none transition-colors">&times;</button>
          </div>

          <div class="flex flex-wrap items-center gap-3 mb-5">
            <span class="text-xs font-medium px-2 py-0.5 rounded border" :style="{ color: item.categoryColor, borderColor: item.categoryColor }">{{ item.category }}</span>
            <span v-for="tag in item.tags" :key="tag" class="text-[0.65rem] text-white/25">#{{ tag }}</span>
          </div>

          <p class="text-sm text-white/55 leading-relaxed whitespace-pre-wrap">{{ item.desc || t('noDescShort') }}</p>

          <!-- 关联词条 & 推荐词条 -->
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

          <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 mt-6 py-2 px-5 border border-white/25 rounded-lg text-xs font-medium text-white/55 hover:bg-white/10 hover:text-white/85 hover:border-white/40 transition-colors">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
            {{ t('openLink') }}
          </a>
          <p v-else class="mt-6 text-xs text-white/15 italic">{{ t('noLink') }}</p>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
