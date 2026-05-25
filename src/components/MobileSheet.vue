<script setup>
import { computed } from 'vue';
import { useI18n } from '../lib/useI18n';

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
      <div class="text-[1.3rem] font-black mb-4 text-white leading-snug">{{ item?.title }}</div>
      <div v-if="item?.desc" class="text-[1rem] leading-relaxed text-white/60 whitespace-pre-wrap">{{ item.desc }}</div>
      <div class="mt-5 pt-4 border-t text-[0.85rem] text-white/40" style="border-color: var(--color-surface-border, #333)">
        {{ t('categories') }}: <span :style="{ color: item?.color || '#fff' }">{{ item?.category }}</span>
        <template v-if="item?.tags"> &nbsp;|&nbsp; {{ t('tags') }}: {{ item.tags }}</template>
      </div>
      <a v-if="item?.link" :href="item.link" target="_blank" rel="noopener"
        class="block w-full mt-6 py-3.5 bg-white text-black text-center rounded-xl font-bold text-[1rem] shadow-md active:scale-[0.98] transition-transform cursor-pointer no-underline">
        {{ t('openLink') }}
      </a>
    </div>
  </Teleport>
</template>

<style>
.sheet-overlay {
  position: fixed; inset: 0; z-index: 99998;
  background: rgba(0,0,0,0.6);
  opacity: 0; pointer-events: none;
  transition: opacity 0.3s ease;
}
.sheet-overlay.show { opacity: 1; pointer-events: auto; }
.sheet-panel {
  position: fixed; bottom: 0; left: 0; width: 100%; z-index: 99999;
  background: #111; border-radius: 16px 16px 0 0;
  padding: 16px 24px 36px; max-height: 85vh; overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
  scrollbar-width: none;
}
.sheet-panel::-webkit-scrollbar { display: none; }
.sheet-panel.show { transform: translateY(0); }
.sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15); }
</style>
