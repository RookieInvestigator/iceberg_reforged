<script setup>
import { reactive, onMounted, onUnmounted } from 'vue';
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({
  bulletins: { type: Array, default: () => [] },
});
defineEmits(['close']);

const { t } = useI18n();
const expanded = reactive({});

function toggle(idx) { expanded[idx] = !expanded[idx]; }

onMounted(() => {
  document.getElementById('iceberg-bg')?.classList.add('paused');
  if (props.bulletins.length > 0) expanded[0] = true;
});
onUnmounted(() => {
  document.getElementById('iceberg-bg')?.classList.remove('paused');
});
</script>

<template>
  <BaseModal :title="t('bulletinTitle')" size="md" @close="$emit('close')">
    <div v-if="bulletins.length === 0" class="text-sm text-white/55 text-center py-4">暫無公告</div>
    <div v-else class="space-y-1">
      <div v-for="(b, i) in bulletins" :key="i" :class="i > 0 ? 'border-t border-white/10' : ''">
        <button class="w-full text-left py-3 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-white/[0.02] transition-colors" @click="toggle(i)">
          <span class="text-sm font-bold text-white/80 truncate">{{ b.title }}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            class="shrink-0 text-white/60 transition-transform duration-300"
            :style="{ transform: expanded[i] ? 'rotate(180deg)' : 'rotate(0deg)' }">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div v-if="expanded[i]" class="pb-4">
          <p v-if="b.date || b.author" class="text-[length:var(--font-micro)] text-white/45 mb-2">{{ b.date }} · {{ b.author }}</p>
          <p class="text-sm text-white/55 leading-relaxed whitespace-pre-line">{{ b.content }}</p>
        </div>
      </div>
    </div>
  </BaseModal>
</template>