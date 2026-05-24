<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { showRandomBtn, immersiveMode } from '../lib/settingsStore';
import { useI18n } from '../lib/useI18n';
import SettingsPanel from './SettingsPanel.vue';

defineEmits(['random']);

const { t } = useI18n();

const showSettings = ref(false);
const showBackTop = ref(false);
const showRandom = useStore(showRandomBtn);
const immersive = useStore(immersiveMode);

function onScroll() { showBackTop.value = window.scrollY > 400; }
function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <div
    class="fixed bottom-6 z-[10001] flex flex-col gap-3"
    :class="{ 'immersive-group': immersive }"
    style="right: 48px"
  >
    <div
      class="flex flex-col gap-3"
      style="transition: transform 0.3s ease-out"
      :style="{ transform: showBackTop ? 'translateY(-12px)' : 'translateY(24px)' }"
    >
      <button v-if="showRandom" class="fab-btn" style="border: 1px solid var(--color-surface-border)" :aria-label="t('randomEntry')" @click="$emit('random')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <button class="fab-btn" style="border: 1px solid var(--color-surface-border)" :aria-label="t('settings')" @click="showSettings = true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="8" y1="18" x2="16" y2="18" />
          <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="14" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <div
        style="transition: all 0.3s ease-out"
        :style="{
          opacity: showBackTop ? 1 : 0,
          transform: showBackTop ? 'translateY(0)' : 'translateY(12px)',
          pointerEvents: showBackTop ? 'auto' : 'none',
        }"
      >
        <button class="fab-btn" style="border: 1px solid var(--color-surface-border)" :aria-label="t('backToTop')" @click="scrollTop">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>
  </div>
  <SettingsPanel v-if="showSettings" @close="showSettings = false" />
</template>

<style>
.fab-btn {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-surface-alt) 50%, transparent);
  transition: background 0.25s ease, color 0.25s ease;
}
.fab-btn:hover {
  background: color-mix(in srgb, var(--color-surface-alt) 75%, transparent);
  color: var(--color-text-primary);
}
.fab-btn:active {
  transform: scale(0.94);
  transition: transform 0.1s ease;
}
.immersive-group .fab-btn {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.5s ease, background 0.25s ease, color 0.25s ease, transform 0.2s ease;
}
.immersive-group:hover .fab-btn {
  opacity: 1;
  transform: translateY(0);
}
</style>
