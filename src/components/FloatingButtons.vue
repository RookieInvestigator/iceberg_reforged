<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { showRandomBtn, immersiveMode } from '../lib/settingsStore';
import { useI18n } from '../lib/useI18n';
import SettingsPanel from './SettingsPanel.vue';

defineEmits(['random', 'toggleSidebar']);

const { t } = useI18n();

const showSettings = ref(false);
const scrolled = ref(false);
const showRandom = useStore(showRandomBtn);
const immersive = useStore(immersiveMode);
const atTop = computed(() => !scrolled.value);

function onScroll() { scrolled.value = window.scrollY > 400; }
function scrollBottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }
function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <div
    class="fixed bottom-6 max-sm:bottom-4 max-sm:right-3 z-[10001] flex flex-col gap-3 max-sm:gap-2"
    :class="{ 'immersive-group': immersive }"
    style="right: 48px; padding-bottom: env(safe-area-inset-bottom, 0px)"
  >
    <!-- Filter — always visible, toggles sidebar -->
    <button class="fab-btn" :aria-label="t('filter')" @click="$emit('toggleSidebar')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </button>

    <div
      class="flex flex-col gap-3"
      style="transition: transform 0.3s ease-out"
      :style="{ transform: scrolled ? 'translateY(-12px)' : 'translateY(24px)' }"
    >
      <!-- Random -->
      <button v-if="showRandom" class="fab-btn" :aria-label="t('randomEntry')" @click="$emit('random')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      </button>

      <!-- Settings -->
      <button class="fab-btn" :aria-label="t('settings')" @click="showSettings = true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <!-- Back to top / go to bottom -->
      <div
        style="transition: all 0.3s ease-out"
        :style="{
          opacity: scrolled ? 1 : 0,
          transform: scrolled ? 'translateY(0)' : 'translateY(12px)',
          pointerEvents: scrolled ? 'auto' : 'none',
        }"
      >
        <button v-if="scrolled" class="fab-btn" :aria-label="t('backToTop')" @click="scrollTop">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Go to bottom (visible when at top) -->
    <button v-if="atTop" class="fab-btn" :aria-label="t('backToTop')" @click="scrollBottom"
      style="transition: all 0.3s ease-out">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  </div>
  <SettingsPanel v-if="showSettings" @close="showSettings = false" />
</template>

<style>
.fab-btn {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  border: 1px solid var(--color-surface-border, #333);
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
