<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { showRandomBtn, immersiveMode } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import SettingsPanel from '../modals/SettingsPanel.vue';

const props = defineProps({ sidebarOpen: Boolean });
const emit = defineEmits(['random', 'toggleSidebar']);

const fabBottom = computed(() => {
  if (typeof window === 'undefined') return undefined;
  return props.sidebarOpen && window.innerWidth < 1024 ? 'calc(70vh + 12px)' : undefined;
});

const { t } = useI18n();
const showSettings = ref(false);
const scrolled = ref(false);
const showRandom = useStore(showRandomBtn);
const immersive = useStore(immersiveMode);

function toggleFilter() { emit('toggleSidebar'); }
function doRandom() { emit('random'); }
function onScroll() { scrolled.value = window.scrollY > 400; }
function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollBottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }

onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onUnmounted(() => window.removeEventListener('scroll', onScroll));
</script>

<template>
  <div
    class="fab-group"
    :class="{ 'immersive-group': immersive }"
    :style="{
      right: '24px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      bottom: fabBottom,
    }"
  >
    <button class="fab-btn" :aria-label="t('filter')" @mousedown.stop @click="toggleFilter">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </button>

    <button v-if="showRandom" class="fab-btn" :aria-label="t('randomEntry')" @click="doRandom">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    </button>

    <button class="fab-btn" :aria-label="t('settings')" @click="showSettings = true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>

    <button class="fab-btn" :aria-label="t('backToTop')" @click="scrolled ? scrollTop() : scrollBottom()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="fab-nav-arrow"
        :class="{ 'fab-nav-down': !scrolled }">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  </div>
  <SettingsPanel v-if="showSettings" @close="showSettings = false" />
</template>

<style>
.fab-group {
  position: fixed;
  bottom: 24px;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (max-width: 639px) {
  .fab-group {
    bottom: 16px;
    right: 12px;
    gap: 8px;
  }
}
.fab-btn {
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  border: none;
  color: rgba(255,255,255,0.4);
  background: rgba(255,255,255,0.04);
  transition: color 0.15s, background 0.15s;
}
.fab-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
.fab-btn:active { transform: scale(0.94); transition: transform 0.1s ease; }
.fab-nav-arrow { transition: transform 0.4s cubic-bezier(0.2,0,0,1); }
.fab-nav-down { transform: rotate(180deg); }
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
