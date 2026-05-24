<script setup>
import { useI18n } from '../lib/useI18n';

defineEmits(['close']);

const { t } = useI18n();

const contacts = [
  { labelKey: 'contactEmail', url: '' },
  { labelKey: 'contactBilibili', url: '' },
  { labelKey: 'contactGitHub', url: '' },
];
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="true" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel" style="width: 360px" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-white">{{ t('contactTitle') }}</h3>
            <button @click="$emit('close')" class="text-white/30 hover:text-white/60 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/5">&times;</button>
          </div>

          <div class="space-y-4 text-sm text-white/55 leading-relaxed">
            <p>{{ t('contactIntro') }}</p>

            <div class="border-t border-white/5 pt-4 space-y-3 text-xs">
              <div v-for="(c, i) in contacts" :key="i" class="flex items-center gap-2">
                <span class="text-white/30 w-16 shrink-0">{{ t(c.labelKey) }}</span>
                <span v-if="!c.url" class="text-white/15 italic">—</span>
                <a v-else :href="c.url" target="_blank" rel="noopener noreferrer" class="text-white/50 hover:text-white/80 transition-colors truncate">{{ c.url }}</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
