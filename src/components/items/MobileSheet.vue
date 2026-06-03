<script setup>
import { computed } from 'vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({ item: Object });
defineEmits(['close']);

const { t } = useI18n();
const open = computed(() => !!props.item);
</script>

<template>
  <Teleport to="body">
    <div class="sheet-overlay" :class="{ show: open }" @click="$emit('close')" />
    <div class="sheet-panel" :class="{ show: open }">
      <div class="flex justify-center py-3"><div class="sheet-handle"></div></div>
      <template v-if="item">
        <div class="text-[1.3rem] font-black mb-4 text-white leading-snug">{{ item.title }}</div>
        <div v-if="item.desc" class="text-[1rem] leading-relaxed text-white/60 whitespace-pre-wrap">{{ item.desc }}</div>
        <div class="mt-5 pt-4 border-t text-[0.85rem] text-white/40" style="border-color: var(--color-surface-border, #333)">
          {{ t('categories') }}: <span :style="{ color: item.color || '#fff' }">{{ item.category }}</span>
          <template v-if="item.tags"> &nbsp;|&nbsp; {{ t('tags') }}: {{ item.tags }}</template>
        </div>
        <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
          class="block w-full mt-6 py-3.5 bg-white text-black text-center rounded-xl font-bold text-[1rem] shadow-md active:scale-[0.98] transition-transform cursor-pointer no-underline">
          {{ t('openLink') }}
        </a>
      </template>
    </div>
  </Teleport>
</template>
