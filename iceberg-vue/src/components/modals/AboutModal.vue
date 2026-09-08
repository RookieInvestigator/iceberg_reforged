<script setup>
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});
defineEmits(['close', 'open-copyright']);

const { t } = useI18n();

const GITHUB_URL = 'https://github.com/RookieInvestigator/iceberg_reforged';
</script>

<template>
  <BaseModal :title="t('aboutTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white-55 leading-relaxed">
      <p>{{ t('aboutDescription') }}</p>

      <div class="border-t border-white-05 pt-4 grid grid-cols-2 gap-2 text-center">
        <div class="rounded-lg bg-white-03 py-3">
          <div class="text-lg font-bold text-white-85">{{ props.entryCount }}</div>
          <div class="mt-0.5 text-xs text-white-40">{{ t('aboutEntries') }}</div>
        </div>
        <div class="rounded-lg bg-white-03 py-3">
          <div class="text-lg font-bold text-white-85">{{ props.buildDate || '—' }}</div>
          <div class="mt-0.5 text-xs text-white-40">{{ t('aboutBuildDate') }}</div>
        </div>
      </div>

      <div class="border-t border-white-05 pt-4 space-y-3">
        <button type="button" class="inline-flex items-center gap-2 text-xs text-white-50 no-underline bg-transparent border-none p-0 cursor-pointer transition-colors duration-200 hover:text-white-80" @click="$emit('open-copyright')">
          <span>{{ t('copyrightLink') }}</span>
          <span aria-hidden="true">→</span>
        </button>
        <a :href="GITHUB_URL" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-xs text-white-50 no-underline transition-colors duration-200 hover:text-white-80">
          <span>{{ t('aboutRepo') }}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  </BaseModal>
</template>