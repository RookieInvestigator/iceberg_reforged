<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

const { t } = useI18n();
const heroTitlesArr = inject('heroTitles', []);

const EXIT_MS = 2000;
const SLOT_COUNT = 20;

const exiting = ref(false);
const removed = ref((() => {
  try { return sessionStorage.getItem('iceberg_hero_done') === '1'; }
  catch { return false; }
})());
let exited = false;

const slots = Array.from({ length: SLOT_COUNT }, (_, i) => ({
  key: i, top: 4 + Math.random() * 86,
  leftPct: Math.random() < 0.5 ? 5 + Math.random() * 40 : 55 + Math.random() * 40,
  dur: 7 + Math.random() * 5, delay: -Math.random() * 12, fontPx: 18 + Math.random() * 8,
}));
function pickTitle() { return heroTitlesArr[Math.floor(Math.random() * heroTitlesArr.length)] || ''; }
const titles = ref(slots.map(() => pickTitle()));

function exit() {
  if (exited) return;
  exited = true;
  exiting.value = true;
  window.scrollTo(0, 0);
  try { sessionStorage.setItem('iceberg_hero_done', '1'); } catch {}
  document.dispatchEvent(new CustomEvent('hero-exit'));
  setTimeout(() => {
    removed.value = true;
    window.scrollTo(0, 0);
    const root = document.scrollingElement || document.documentElement;
    root.style.overflow = '';
    document.body.style.overflow = '';
  }, EXIT_MS);
}

// Wheel/touch on hero element — works even with html overflow:hidden
function onWheel(e)   { if (!exiting.value) { e.preventDefault(); if (e.deltaY > 0) exit(); } }
function onKey(e)     { if (!exiting.value && ['PageDown','ArrowDown','Spacebar',' ','End','Enter'].includes(e.key)) { e.preventDefault(); exit(); } }
let tY = 0;
function onTStart(e)  { tY = e.touches[0].clientY; }
function onTMove(e)   { if (!exiting.value) { e.preventDefault(); if (tY - e.touches[0].clientY > 5) exit(); } }

const heroRef = ref(null);
let interval = 0;
onMounted(() => {
  if (removed.value) return;
  window.scrollTo(0, 0);
  const root = document.scrollingElement || document.documentElement;
  root.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.dispatchEvent(new CustomEvent('hero-ready'));
  heroRef.value?.addEventListener('wheel', onWheel, { passive: false });
  heroRef.value?.addEventListener('touchstart', onTStart, { passive: true });
  heroRef.value?.addEventListener('touchmove', onTMove, { passive: false });
  window.addEventListener('keydown', onKey, { passive: false });
  // delay floating text init to idle
		const startTitles = () => { interval = setInterval(() => titles.value = slots.map(() => pickTitle()), 8000) }
		if ('requestIdleCallback' in window) requestIdleCallback(startTitles)
		else setTimeout(startTitles, 200)
});
onUnmounted(() => {
  clearInterval(interval);
  heroRef.value?.removeEventListener('wheel', onWheel);
  heroRef.value?.removeEventListener('touchstart', onTStart);
  heroRef.value?.removeEventListener('touchmove', onTMove);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <section ref="heroRef" v-if="!removed" class="hero-section" :class="{ 'hero-exiting': exiting }" :aria-label="t('siteTitle')" @click="exit">
    <div class="hero-bg" /><div class="hero-mask-bottom" />
    <div class="hero-floats">
      <span v-for="(s, i) in slots" :key="s.key" class="hero-float-name"
        :style="{ left: s.leftPct + '%', top: s.top + '%', fontSize: s.fontPx + 'px', animation: `hero-fade-float-up ${s.dur}s linear ${s.delay}s infinite` }">
        {{ titles[i] }}
      </span>
    </div>
    <div class="hero-content">
      <div class="w-full mx-auto pt-20 max-sm:pt-10" style="max-width: var(--max-width)">
        <div class="hero-title-area text-center pt-10 pb-6" style="padding: 0 var(--header-padding-x)">
          <div class="mb-14 flex flex-col items-center">
            <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50 max-sm:text-xs max-sm:tracking-[0.5em]">Chinese Oddities Iceberg</div>
            <div class="relative inline-flex items-start">
              <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-sm:text-[2.2rem] max-sm:tracking-wide">{{ t('siteTitle') }}</h1>
              <span class="absolute -right-14 top-0 sm:-right-16 sm:text-[1.1rem] font-thin text-white/90 tracking-widest select-none max-sm:text-[0.7rem] max-sm:-top-1 max-sm:-right-8">{{ t('edition') }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="hero-icon" aria-hidden="true"><img :src="url('/assets/iceberg.svg')" alt="" width="40" height="40" /></div>
    <div class="hero-arrow" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
    </div>
  </section>
</template>
