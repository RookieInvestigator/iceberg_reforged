<script setup>
import { ref, onMounted, onUnmounted, inject, shallowRef } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

const { t } = useI18n();
const heroTitlesArr = inject('heroTitles', []);

const EXIT_MS = 2300;
const TICKER_ROWS = 8;

const loaded = ref(false);
const exiting = ref(false);
const removed = ref((() => {
  try { return sessionStorage.getItem('iceberg_hero_done') === '1'; }
  catch { return false; }
})());
let exited = false;

function buildTicker(count) {
  return Array.from({ length: count }, () =>
    heroTitlesArr[Math.floor(Math.random() * heroTitlesArr.length)] || ''
  ).join('    ') + '    ';
}

const tickers = shallowRef(Array.from({ length: TICKER_ROWS }, () => buildTicker(80)));

function exit() {
  if (exited) return;
  exited = true;
  exiting.value = true;
  
  // 1. 立即终止 JS 视差计算
  cancelAnimationFrame(rAF.current);
  
  // 2. 绕过 Vue 响应式延迟，同步强制加上动画 class
  if (heroRef.value) {
    heroRef.value.classList.add('hero-out');
  }
  
  try { sessionStorage.setItem('iceberg_hero_done', '1'); } catch {}
  document.dispatchEvent(new CustomEvent('hero-exit'));
  
  setTimeout(() => {
    removed.value = true;
    const root = document.scrollingElement || document.documentElement;
    root.style.overflow = '';
    document.body.style.overflow = '';
  }, EXIT_MS);
}

function onWheel(e)   { if (!exiting.value) { e.preventDefault(); if (e.deltaY > 0) exit(); } }
function onKey(e)     { if (!exiting.value && ['PageDown','ArrowDown','Spacebar',' ','End','Enter'].includes(e.key)) { e.preventDefault(); exit(); } }
let tY = 0;
function onTStart(e)  { tY = e.touches[0].clientY; }
function onTMove(e)   { if (!exiting.value) { e.preventDefault(); if (tY - e.touches[0].clientY > 5) exit(); } }

const heroRef = ref(null);
const spotEl = ref(null);
const bgLayerEl = ref(null);

const cursor = { x: -999, y: -999 };
const smooth = { x: -999, y: -999 };
const rAF = { current: 0 };
let winW = typeof window !== 'undefined' ? window.innerWidth : 1920;
let winH = typeof window !== 'undefined' ? window.innerHeight : 1080;

function onMouseMove(e) { cursor.x = e.clientX; cursor.y = e.clientY; }

function tick() {
  // 退场时停止一切 JS 样式更新，把控制权 100% 交给 CSS Transition
  if (exiting.value) return; 

  smooth.x += (cursor.x - smooth.x) * 0.08;
  smooth.y += (cursor.y - smooth.y) * 0.08;
  
  if (bgLayerEl.value) {
    const tx = ((smooth.x / winW) - 0.5) * -24;
    const ty = ((smooth.y / winH) - 0.5) * -16;
    // 使用 CSS 变量记录当前位置
    bgLayerEl.value.style.setProperty('--tx', `${tx}px`);
    bgLayerEl.value.style.setProperty('--ty', `${ty}px`);
  }
  
  if (spotEl.value) {
    spotEl.value.style.setProperty('--sx', smooth.x + 'px');
    spotEl.value.style.setProperty('--sy', smooth.y + 'px');
    spotEl.value.style.opacity = cursor.x > 0 ? '1' : '0';
  }
  rAF.current = requestAnimationFrame(tick);
}

function onResize() { winW = window.innerWidth; winH = window.innerHeight; }

onMounted(() => {
  if (removed.value) return;
  const root = document.scrollingElement || document.documentElement;
  root.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const preload = new Image();
  preload.src = url('/assets/hero-bg.webp');
  const fireReady = () => {
    loaded.value = true;
    document.dispatchEvent(new CustomEvent('hero-ready'));
  };
  preload.onload = fireReady;
  preload.onerror = fireReady;
  setTimeout(fireReady, 2000);

  heroRef.value?.addEventListener('wheel', onWheel, { passive: false });
  heroRef.value?.addEventListener('touchstart', onTStart, { passive: true });
  heroRef.value?.addEventListener('touchmove', onTMove, { passive: false });
  window.addEventListener('keydown', onKey, { passive: false });
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  rAF.current = requestAnimationFrame(tick);
});

onUnmounted(() => {
  cancelAnimationFrame(rAF.current);
  heroRef.value?.removeEventListener('wheel', onWheel);
  heroRef.value?.removeEventListener('touchstart', onTStart);
  heroRef.value?.removeEventListener('touchmove', onTMove);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <section ref="heroRef" v-if="!removed" class="hero" :class="{ 'hero-loaded': loaded, 'hero-out': exiting }" :aria-label="t('siteTitle')" @click="exit">

    <div class="hero-bg-gradient"></div>

    <div class="hero-tickers-container">
      <div v-for="(text, i) in tickers" :key="i" class="hero-ticker-row">
        <span class="hero-ticker-track">{{ text }}</span>
        <span class="hero-ticker-track" aria-hidden="true">{{ text }}</span>
      </div>
    </div>

    <div ref="bgLayerEl" class="hero-bg-layer" :style="{ backgroundImage: `url(${url('/assets/hero-bg.webp')})` }"></div>

    <div class="hero-vignette"></div>
    <div class="hero-veil"></div>

    <div ref="spotEl" class="hero-spotlight"></div>

    <div class="hero-main">
      <div class="hero-masthead">
        <img :src="url('/assets/typede.svg')" alt="中文兔子洞冰山图" class="hero-logo" />
        <div class="hero-deck">
          <span class="hero-deck-line"></span>
          <span class="hero-deck-text">Chinese Oddities Iceberg</span>
          <span class="hero-deck-line"></span>
        </div>
        <p class="hero-edition">{{ t('edition') }}</p>
      </div>

      <div class="hero-cue">
        <div class="hero-cue-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.hero {
  position: fixed; inset: 0; z-index: 9999;
  background-color: #0d0a08;
  overflow: hidden; cursor: none;
  opacity: 0;
  transition: opacity 0.6s ease;
}
.hero-loaded { opacity: 1; }
.hero-out {
  pointer-events: none;
  opacity: 0;
  transition: opacity 1s ease 1.2s;
}

/* ── 视差层 1：主视觉 ── */
.hero-main {
  position: relative; z-index: 10; pointer-events: none;
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  
  /* 【关键修复】显式预热滤镜，避免点击瞬间构建产生的 1s 卡顿 */
  transform: translate3d(0, 0, 0) scale(1);
  filter: blur(0px);
  transition: transform 1.2s cubic-bezier(0.4,0,0.2,1), opacity 0.8s ease, filter 1s ease;
}
.hero-out .hero-main { transform: translate3d(0, -15vh, 0) scale(0.85); opacity: 0; filter: blur(12px); }
.hero-out .hero-cue { opacity: 0; transition: opacity 0.3s ease; }

/* ── 视差层 2：滚动词条 ── */
.hero-tickers-container {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  display: flex; flex-direction: column; overflow: hidden;
  
  transform: translate3d(0, 0, 0) scale(1);
  filter: blur(0px);
  transition: transform 1.5s cubic-bezier(0.25,1,0.5,1), opacity 1.2s ease, filter 1.2s ease;
}
.hero-out .hero-tickers-container { transform: translate3d(0, 12vh, 0) scale(0.95); opacity: 0; filter: blur(8px); }
.hero-ticker-row {
  display: flex; align-items: center; width: 100%; white-space: nowrap;
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
  font-size: calc(100dvh / 8); font-weight: 200; line-height: 1; letter-spacing: 0;
  color: #ffffff; opacity: 0.18; margin: 0; padding: 0;
}
.hero-ticker-track { flex-shrink: 0; min-width: 100%; animation: ticker-scroll 900s linear infinite; }
/* 【关键修复】退出时暂停文字滚动，极大节省模糊计算时的 GPU 消耗 */
.hero-out .hero-ticker-track { animation-play-state: paused; }
@keyframes ticker-scroll { 0% { transform: translate3d(0,0,0); } 100% { transform: translate3d(-100%,0,0); } }

/* ── 视差层 3：冰山背景 ── */
.hero-bg-layer {
  position: absolute; inset: -5%; z-index: 3;
  background-size: cover; background-position: center; background-repeat: no-repeat;
  
  /* 【关键修复】统一前后 Transform 的函数签名格式，让浏览器做纯数值过渡 */
  transform: translate3d(var(--tx, 0px), var(--ty, 0px), 0) translateY(0vh) scale(1.05);
  filter: brightness(0.7) blur(0px);
  transition: transform 1.8s cubic-bezier(0.25,1,0.5,1), opacity 1.5s ease, filter 1.5s ease;
}
.hero-out .hero-bg-layer { 
  transform: translate3d(var(--tx, 0px), var(--ty, 0px), 0) translateY(-5vh) scale(1.5); 
  opacity: 0; 
  filter: brightness(1.2) blur(16px); 
}

/* ── 氛围层 ── */
.hero-bg-gradient {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(to bottom, #e86010 0%, #d85010 25%, #4a90c8 55%, #0a1f45 100%);
  transition: opacity 1.2s ease;
}
.hero-out .hero-bg-gradient { opacity: 0; }
.hero-vignette {
  position: absolute; inset: 0; z-index: 5; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%);
  transition: opacity 0.8s ease;
}
.hero-out .hero-vignette { opacity: 0; }
.hero-veil {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(to top, #d87020 0%, rgba(216,112,32,0.6) 15%, transparent 35%);
  transition: opacity 1s ease;
}
.hero-out .hero-veil { opacity: 0; }
.hero-spotlight {
  position: fixed; inset: 0; z-index: 6; pointer-events: none;
  background: radial-gradient(circle 320px at var(--sx, -999px) var(--sy, -999px), transparent 0%, transparent 45%, rgba(0,0,0,0.75) 100%);
  contain: layout style paint;
  transition: opacity 0.5s ease;
}
.hero-out .hero-spotlight { opacity: 0; }

/* ── 内容样式 ── */
.hero-masthead { text-align: center; padding: 0 2rem; }
.hero-logo {
  display: block; width: min(80vw, 540px); height: auto; margin: 0 auto 3rem;
  animation: hero-reveal 1.2s cubic-bezier(0.16,1,0.3,1) both;
  filter: drop-shadow(0 0 20px rgba(0,0,0,0.5));
}
.hero-deck {
  display: flex; align-items: center; justify-content: center; gap: 1.25rem;
  margin-bottom: 0.75rem;
  animation: hero-reveal 1s 0.2s cubic-bezier(0.16,1,0.3,1) both;
}
.hero-deck-line { display: block; width: 3rem; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent); }
.hero-deck-text { font-size: 0.75rem; font-weight: 300; letter-spacing: 0.35em; text-transform: uppercase; color: rgba(255,255,255,0.45); }
.hero-edition { font-size: 0.65rem; letter-spacing: 0.3em; color: rgba(255,255,255,0.25); animation: hero-reveal 0.8s 0.3s cubic-bezier(0.16,1,0.3,1) both; }

@keyframes hero-reveal {
  from { opacity: 0; transform: translateY(24px); filter: blur(12px); }
  to   { opacity: 1; transform: translateY(0); filter: blur(0); }
}

.hero-cue { position: absolute; bottom: 2.5rem; left: 50%; transform: translateX(-50%); z-index: 20; }
.hero-cue-icon { color: rgba(255,255,255,0.55); animation: cue-pulse 2.5s ease-in-out infinite; }
@keyframes cue-pulse {
  0%, 100% { opacity: 0.4; transform: translateY(0); }
  50%      { opacity: 1; transform: translateY(8px); }
}
</style>