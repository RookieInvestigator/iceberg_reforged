<script setup>
import { useI18n } from '../lib/useI18n';

defineProps({
  item: Object,
});

defineEmits(['close']);

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="item" class="fixed inset-0 z-[99998] bg-black/60" @click.self="$emit('close')" />
    </Transition>
    <Transition name="fade-up">
      <div v-if="item" class="fixed bottom-0 left-0 w-full z-[99999] px-6 pt-4 pb-9 rounded-t-3xl shadow-lg max-h-[85vh] overflow-y-auto text-left"
        style="background: var(--color-modal-bg, #111); box-shadow: 0 -10px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-5" />
        <div class="text-[1.3rem] font-black mb-4 text-white leading-snug">
          {{ item.title }}
        </div>
        <div v-if="item.desc" class="text-[1rem] leading-relaxed text-white/60 whitespace-pre-wrap">
          {{ item.desc }}
        </div>
        <div class="mt-5 pt-4 border-t text-[0.85rem] text-white/40"
          style="border-color: var(--color-surface-border, #333)">
          {{ t('categories') }}: <span :style="{ color: item.color || '#fff' }">{{ item.category }}</span>
          <template v-if="item.tags"> &nbsp;|&nbsp; {{ t('tags') }}: {{ item.tags }}</template>
        </div>
        <a v-if="item.link" :href="item.link" target="_blank" rel="noopener"
          class="block w-full mt-6 py-3.5 bg-white text-black text-center rounded-xl font-bold text-[1rem] shadow-md active:scale-[0.98] transition-transform cursor-pointer no-underline">
          {{ t('openLink') }}
        </a>
      </div>
    </Transition>
  </Teleport>
</template>
