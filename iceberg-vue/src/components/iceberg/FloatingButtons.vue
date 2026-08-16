<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { showRandomBtn, immersiveMode } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import SettingsPanel from '../modals/SettingsPanel.vue';

const props = defineProps({ sidebarOpen: Boolean });
const emit = defineEmits(['random', 'toggleSidebar']);

// 响应式窗口宽度：resize / orientationchange 时重算 fabBottom（避免旋转或缩放后位置过期）
const winWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);

const fabBottom = computed(() => {
  if (typeof window === 'undefined') return undefined;
  return props.sidebarOpen && winWidth.value < 1024 ? 'calc(70vh + 12px)' : undefined;
});

const { t } = useI18n();
const showSettings = ref(false);
const scrolled = ref(false);
const showRandom = useStore(showRandomBtn);
const immersive = useStore(immersiveMode);

function toggleFilter() { emit('toggleSidebar'); }
function doRandom() { emit('random'); }
function onScroll() { scrolled.value = window.scrollY > 400; }
function onResize() { winWidth.value = window.innerWidth; }
function scrollTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function scrollBottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); }

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize);
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
});
</script>

<template>
  <div
    class="fab-group fixed z-[10001] flex flex-col gap-3 bottom-6 max-sm:gap-2 max-sm:bottom-4"
    :class="{ 'immersive-group': immersive }"
    :style="{
      right: '24px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      bottom: fabBottom,
    }"
  >
    <button class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]" :aria-label="t('filter')" @mousedown.stop @click="toggleFilter">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    </button>

    <button v-if="showRandom" class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]" :aria-label="t('randomEntry')" @click="doRandom">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    </button>

    <button class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]" :aria-label="t('settings')" @click="showSettings = true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>

    <button class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]" :aria-label="t('backToTop')" @click="scrolled ? scrollTop() : scrollBottom()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="transition-transform duration-[400ms] ease-out"
        :class="{ 'rotate-180': !scrolled }">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  </div>
  <SettingsPanel v-if="showSettings" @close="showSettings = false" />
</template>

<style>
/* M-A：触屏设备（无 hover 能力）沉浸模式 FAB 常显；仅桌面保留悬浮隐现。
   .fab-btn 类同时是 index.css 入场动画（.content-enter .fab-btn）的选择器钩子，故保留类名 */
@media (hover: hover) {
  .immersive-group .fab-btn {
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.5s ease, background 0.25s ease, color 0.25s ease, transform 0.2s ease;
  }
  .immersive-group:hover .fab-btn { opacity: 1; transform: translateY(0); }
}
</style>
