<script setup>
import { useI18n } from '../lib/useI18n';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});
defineEmits(['close']);

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="true" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel no-scrollbar" style="width: 380px" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-base font-bold text-white tracking-wide">{{ t('aboutTitle') }}</h2>
            <button @click="$emit('close')" class="text-white/25 hover:text-white/60 text-lg leading-none transition-colors">&times;</button>
          </div>

          <div class="space-y-4 text-sm text-white/55 leading-relaxed">
            <p>{{ t('aboutDescription') }}</p>

            <div class="border-t border-white/5 pt-4 space-y-2 text-xs text-white/30">
              <div class="flex justify-between">
                <span>{{ t('aboutVersion') }}</span>
                <span class="text-white/50">{{ t('edition') }}</span>
              </div>
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
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
