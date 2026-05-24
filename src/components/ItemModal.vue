<script setup>
import { useI18n } from '../lib/useI18n';

defineProps({ item: Object });
defineEmits(['close']);

const { t } = useI18n();

function openLink(link) { window.open(link, '_blank', 'noopener'); }
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="item" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel">
          <button @click="$emit('close')" class="absolute top-4 right-4 text-white/30 hover:text-white/60 text-xl leading-none">&times;</button>
          <h2 class="text-xl font-bold text-white pr-8">{{ item.title }}</h2>
          <div class="text-sm mt-2" :style="{ color: item.categoryColor }">{{ item.category }}</div>
          <div class="flex flex-wrap gap-2 mt-3">
            <span v-for="tag in item.tags" :key="tag" class="text-xs text-white/25">#{{ tag }}</span>
          </div>
          <p class="text-white/60 mt-4 leading-relaxed text-sm">{{ item.desc || t('noDescShort') }}</p>
          <button v-if="item.link" @click="openLink(item.link)"
            class="inline-flex items-center gap-2 mt-6 py-2.5 px-5 bg-white text-black rounded-xl font-bold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-shadow cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
            {{ t('openLink') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
