<script setup>
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});
defineEmits(['close']);

const { t } = useI18n();
</script>

<template>
  <BaseModal :title="t('aboutTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white/55 leading-relaxed">
      <p>{{ t('aboutDescription') }}</p>

      <div class="border-t border-white/5 pt-4 space-y-2 text-xs text-white/30">
        <div class="flex justify-between">
          <span>{{ t('aboutBuildDate') }}</span>
          <span class="text-white/50">{{ props.buildDate }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ t('aboutEntries') }}</span>
          <span class="text-white/50">{{ props.entryCount }}</span>
        </div>
      </div>

      <div class="border-t border-white/5 pt-4 text-xs text-white/25 text-center space-y-1">
        <p>{{ t('aboutCommunity') }}</p>
        <p>Chinese Oddities Iceberg · Community Curated</p>
        <p class="mt-1" style="color: rgba(255,255,255,0.12)">{{ t('aboutVibeCoding') }}</p>
      </div>
    </div>
  </BaseModal>
</template>