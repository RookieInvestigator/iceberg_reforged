<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from '../lib/useI18n';
import { url } from '../lib/baseUrl';

defineEmits(['close']);

const { t } = useI18n();
const bulletins = ref([]);

onMounted(async () => {
  try {
    const res = await fetch(url('/data/bulletins.json'));
    if (res.ok) bulletins.value = await res.json();
  } catch {}
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel" style="max-width:400px" @click.stop>
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold text-white">{{ t('bulletinTitle') }}</h2>
            <button @click="$emit('close')" class="text-white/30 hover:text-white/60 text-xl leading-none">&times;</button>
          </div>
          <div v-if="bulletins.length === 0" class="text-sm text-white/30">暂无公告</div>
          <div v-for="(b, i) in bulletins" :key="i" :class="i > 0 ? 'mt-6 pt-6 border-t border-white/10' : ''">
            <h3 class="text-sm font-bold text-white/80 mb-1">{{ b.title }}</h3>
            <p v-if="b.date || b.author" class="text-[0.65rem] text-white/20 mb-2">{{ b.date }} · {{ b.author }}</p>
            <p class="text-sm text-white/55 leading-relaxed whitespace-pre-line">{{ b.content }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
