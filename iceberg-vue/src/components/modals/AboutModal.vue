<script setup>
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});
defineEmits(['close']);

const { t } = useI18n();

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged';
</script>

<template>
  <BaseModal :title="t('aboutTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white/55 leading-relaxed">
      <p>{{ t('aboutDescription') }}</p>

      <div class="border-t border-white/5 pt-4 space-y-2 text-xs text-white/50">
        <div class="flex justify-between">
          <span>{{ t('aboutBuildDate') }}</span>
          <span class="text-white/50">{{ props.buildDate }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ t('aboutEntries') }}</span>
          <span class="text-white/50">{{ props.entryCount }}</span>
        </div>
      </div>

      <div class="border-t border-white/5 pt-4 text-xs text-white/55 text-center space-y-1">
        <p>{{ t('aboutCommunity') }}</p>
        <p>Chinese Oddities Iceberg · Community Curated</p>
        <p class="mt-1" style="color: var(--white-12)">{{ t('aboutVibeCoding') }}</p>
      </div>

      <div class="border-t border-white/5 pt-4">
        <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-xs text-white-50 no-underline transition-colors duration-200 hover:text-white-80">
          <span>{{ t('aboutRepo') }}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  </BaseModal>
</template>