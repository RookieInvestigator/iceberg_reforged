<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../lib/useI18n';

const props = defineProps({
  tiers: String,
  tierOrder: String,
  allItems: String,
});

const { t } = useI18n();

const allItems = JSON.parse(props.allItems);

const SLOT_COUNT = 20;
const EXIT_DURATION_MS = 2000;

const exiting = ref(false);
const removed = ref((() => {
  try { return sessionStorage.getItem('iceberg_hero_done') === '1'; }
  catch { return false; }
})());
const exitingRef = ref(false);

const slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({
  key: i,
  top: 4 + Math.random() * 86,
  leftPct: Math.random() < 0.5 ? 5 + Math.random() * 40 : 55 + Math.random() * 40,
  dur: 7 + Math.random() * 5,
  delay: -Math.random() * 12,
  fontPx: 18 + Math.random() * 8,
}));

function pickTitle() {
  return allItems[Math.floor(Math.random() * allItems.length)]?.title || '';
}

const titles = ref(slots.map(() => pickTitle()));

function triggerExit() {
  if (exitingRef.value) return;
  exitingRef.value = true;
  exiting.value = true;
  window.scrollTo(0, 0);
  try { sessionStorage.setItem('iceberg_hero_done', '1'); } catch {}
  document.dispatchEvent(new CustomEvent('hero-exit'));
  setTimeout(() => {
    removed.value = true;
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.documentElement.style.overscrollBehavior = '';
  }, EXIT_DURATION_MS);
}

function onWheel(e) {
  if (exiting.value || removed.value) return;
  e.preventDefault();
  if (e.deltaY > 0) triggerExit();
}
function onKey(e) {
  if (exiting.value || removed.value) return;
  if (['PageDown','ArrowDown','Spacebar',' ','End','Enter'].includes(e.key)) {
    e.preventDefault(); triggerExit();
  }
}
let touchY = 0;
function onTouchStart(e) { if (!exiting.value && !removed.value) touchY = e.touches[0].clientY; }
function onTouchMove(e) {
  if (exiting.value || removed.value) return;
  e.preventDefault();
  if (touchY - e.touches[0].clientY > 5) triggerExit();
}

let interval = 0;
onMounted(() => {
  window.scrollTo(0, 0);
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overscrollBehavior = 'none';
  document.dispatchEvent(new CustomEvent('hero-ready'));
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  interval = setInterval(() => { titles.value = slots.map(() => pickTitle()); }, 8000);
});

onUnmounted(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.documentElement.style.overscrollBehavior = '';
  clearInterval(interval);
  window.removeEventListener('wheel', onWheel);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchmove', onTouchMove);
});
</script>

<template>
  <section v-if="!removed" class="hero-section" :class="{ 'hero-exiting': exiting }" :aria-label="t('siteTitle')" @click="triggerExit">
    <div class="hero-bg" />
    <div class="hero-mask-bottom" />
    <div class="hero-floats">
      <span v-for="(s, i) in slots" :key="s.key" class="hero-float-name"
            :style="{
              left: s.leftPct + '%', top: s.top + '%', fontSize: s.fontPx + 'px',
              animation: `hero-fade-float-up ${s.dur}s linear ${s.delay}s infinite`,
            }">
        {{ titles[i] }}
      </span>
    </div>
    <div class="hero-content">
      <div class="w-full mx-auto pt-20 max-sm:pt-10" style="max-width: var(--max-width)">
        <div class="hero-title-area text-center pt-10 pb-6" style="padding: 0 var(--header-padding-x)">
          <div class="mb-14 flex flex-col items-center">
            <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50">
              Chinese Oddities Iceberg
            </div>
            <div class="relative inline-flex items-start">
              <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-sm:text-[2.4rem]">
                {{ t('siteTitle') }}
              </h1>
              <span class="absolute -right-14 top-0 sm:-right-16 sm:text-[1.1rem] font-thin text-white/90 tracking-widest select-none max-sm:-top-2 max-sm:-right-10">
                {{ t('edition') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="hero-icon" aria-hidden="true">
      <img src="/assets/iceberg.svg" alt="" width="40" height="40" />
    </div>
    <div class="hero-arrow" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  </section>
</template>
