<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useI18n } from '../../lib/useI18n'
import { url } from '../../lib/baseUrl'
import { HERO_TITLES_KEY } from '../../lib/injectionKeys'

const { t } = useI18n()
const heroTitles = inject(HERO_TITLES_KEY, [])

const EXIT_MS = 1500
const RESOURCE_TIMEOUT_MS = 2400
const FONT_TIMEOUT_MS = 1600
const TICKER_ROWS = 5
const TICKER_COUNT = 10
const TICKER_SPEEDS = [138, 172, 154, 186, 146]
const TICKER_OPACITY = [0.08, 0.13, 0.19, 0.13, 0.08]
const SPOT_DIAMETER = 680
const SPOT_RENDER_SCALE = 0.5
const SPOT_INTRO_MS = 850

const heroRef = ref<HTMLElement | null>(null)
const icebergEl = ref<HTMLElement | null>(null)
const brandEl = ref<HTMLElement | null>(null)
const spotEl = ref<HTMLCanvasElement | null>(null)
const loaded = ref(false)
const exiting = ref(false)
const removed = ref(readHeroDone())
const fontsReady = ref(false)
const motionPaused = ref(false)

let exited = false
let exitTimer = 0
let resourceTimer = 0
let fontTimer = 0
let resizeTimer = 0
let transitionCleanup: (() => void) | null = null
let mediaQuery: MediaQueryList | null = null
let reduceMotion = false
let rAF = 0
let viewportWidth = 1920
let viewportHeight = 1080
let spotlightEnabled = false
let spotContext: CanvasRenderingContext2D | null = null
let spotBrush: HTMLCanvasElement | null = null
let spotIntroStart = 0
let spotIntroActive = false
let touchStartY = 0

const pointer = { x: -999, y: -999 }

function readHeroDone() {
  try { return sessionStorage.getItem('iceberg_hero_done') === '1' }
  catch { return false }
}

function makeTicker(count: number) {
  const source = heroTitles.length ? heroTitles : ['中文兔子洞', '奇闻异事', '都市传说', '未解之谜']
  const pool = source
    .map(title => title.match(/\p{Script=Han}/gu)?.join('') ?? '')
    .filter(Boolean)
  const chineseTitles = pool.length ? pool : ['中文兔子洞', '奇闻异事', '都市传说', '未解之谜']
  return Array.from(
    { length: count },
    () => chineseTitles[Math.floor(Math.random() * chineseTitles.length)] || '',
  ).join('')
}

const tickers = shallowRef(Array.from({ length: TICKER_ROWS }, () => makeTicker(TICKER_COUNT)))
const heroClass = computed(() => ({
  'hero--loaded': loaded.value,
  'hero--fonts-ready': fontsReady.value,
  'hero--exiting': exiting.value,
  'hero--motion-paused': motionPaused.value,
  'hero--reduced-motion': reduceMotion,
}))

function lockScroll() {
  const root = (document.scrollingElement || document.documentElement) as HTMLElement
  root.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  const root = (document.scrollingElement || document.documentElement) as HTMLElement
  root.style.overflow = ''
  document.body.style.overflow = ''
}

function stopMotion() {
  if (rAF) cancelAnimationFrame(rAF)
  rAF = 0
}

function finishExit() {
  removed.value = true
  unlockScroll()
}

function exit() {
  if (exited || removed.value) return
  exited = true
  exiting.value = true
  stopMotion()

  try { sessionStorage.setItem('iceberg_hero_done', '1') } catch {}
  document.dispatchEvent(new CustomEvent('hero-exit'))

  const hero = heroRef.value
  if (hero && !reduceMotion) {
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== hero || event.propertyName !== 'opacity') return
      transitionCleanup?.()
      unlockScroll()
    }
    transitionCleanup = () => {
      hero.removeEventListener('transitionend', onEnd)
      transitionCleanup = null
    }
    hero.addEventListener('transitionend', onEnd)
  } else {
    unlockScroll()
  }

  exitTimer = window.setTimeout(finishExit, reduceMotion ? 80 : EXIT_MS)
}

function onWheel(event: WheelEvent) {
  if (exiting.value) return
  event.preventDefault()
  if (event.deltaY > 0) exit()
}

function onKey(event: KeyboardEvent) {
  if (exiting.value) return
  if (['PageDown', 'ArrowDown', ' ', 'Spacebar', 'Enter', 'End', 'Escape'].includes(event.key)) {
    event.preventDefault()
    exit()
  }
}

function onTouchStart(event: TouchEvent) {
  touchStartY = event.touches[0]?.clientY ?? 0
}

function onTouchMove(event: TouchEvent) {
  if (exiting.value) return
  const currentY = event.touches[0]?.clientY ?? touchStartY
  if (touchStartY - currentY > 20) {
    event.preventDefault()
    exit()
  }
}

function createSpotBrush() {
  const size = Math.round(SPOT_DIAMETER * SPOT_RENDER_SCALE)
  const radius = size / 2
  const brush = document.createElement('canvas')
  brush.width = size
  brush.height = size
  const context = brush.getContext('2d')
  if (!context) return null

  // 中心完整擦除暗场，外缘以更长的渐变区平滑回到环境亮度。
  const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.3, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.9)')
  gradient.addColorStop(0.7, 'rgba(0,0,0,0.58)')
  gradient.addColorStop(0.88, 'rgba(0,0,0,0.2)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return brush
}

function configureSpotlight() {
  const canvas = spotEl.value
  if (!canvas) return
  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  spotlightEnabled = !coarsePointer && viewportWidth > 640 && !reduceMotion
  canvas.style.display = spotlightEnabled ? '' : 'none'
  if (!spotlightEnabled) return

  canvas.width = Math.max(1, Math.round(viewportWidth * SPOT_RENDER_SCALE))
  canvas.height = Math.max(1, Math.round(viewportHeight * SPOT_RENDER_SCALE))
  spotContext = canvas.getContext('2d', { alpha: true })
  spotBrush = createSpotBrush()
  if (pointer.x < 0) {
    pointer.x = viewportWidth / 2
    pointer.y = viewportHeight / 2
  }
  if (!rAF) rAF = requestAnimationFrame(tick)
}

function tick() {
  rAF = 0
  if (exiting.value || removed.value || reduceMotion || pointer.x < 0) return
  const canvas = spotEl.value
  const context = spotContext
  const brush = spotBrush
  if (!canvas || !context || !brush || !spotlightEnabled) return

  // 半分辨率固定画布：每个 Pointer 帧只做一次纯色填充和一次预生成画刷拷贝。
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = 'rgba(1, 4, 10, 0.68)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.globalCompositeOperation = 'destination-out'
  let introScale = 1
  if (spotIntroActive) {
    const progress = Math.min(1, (performance.now() - spotIntroStart) / SPOT_INTRO_MS)
    introScale = 0.18 + (1 - Math.pow(1 - progress, 3)) * 0.82
    if (progress >= 1) spotIntroActive = false
  }
  const drawWidth = brush.width * introScale
  const drawHeight = brush.height * introScale
  const x = pointer.x * SPOT_RENDER_SCALE - drawWidth / 2
  const y = pointer.y * SPOT_RENDER_SCALE - drawHeight / 2
  context.drawImage(brush, x, y, drawWidth, drawHeight)
  context.globalCompositeOperation = 'source-over'

  // 冰山与标题同向反向视差，标题仅使用四分之一幅度形成轻微差速。
  const normalizedX = (pointer.x / viewportWidth) - 0.5
  const normalizedY = (pointer.y / viewportHeight) - 0.5
  const icebergX = normalizedX * -16
  const icebergY = normalizedY * -10
  const iceberg = icebergEl.value
  if (iceberg) {
    iceberg.style.setProperty('--hero-parallax-x', `${icebergX.toFixed(2)}px`)
    iceberg.style.setProperty('--hero-parallax-y', `${icebergY.toFixed(2)}px`)
  }
  const brand = brandEl.value
  if (brand) {
    brand.style.setProperty('--hero-brand-x', `${(icebergX * 0.25).toFixed(2)}px`)
    brand.style.setProperty('--hero-brand-y', `${(icebergY * 0.25).toFixed(2)}px`)
  }

  if (spotIntroActive && !rAF) rAF = requestAnimationFrame(tick)
}

function onPointerMove(event: PointerEvent) {
  if (reduceMotion || !spotlightEnabled || event.pointerType === 'touch') return
  pointer.x = event.clientX
  pointer.y = event.clientY
  if (!rAF) rAF = requestAnimationFrame(tick)
}

function onResize() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    configureSpotlight()
    if (!reduceMotion && pointer.x >= 0 && !rAF) rAF = requestAnimationFrame(tick)
  }, 160)
}

function onVisibilityChange() {
  motionPaused.value = document.hidden
  if (document.hidden) stopMotion()
  else if (!reduceMotion && pointer.x >= 0 && !exiting.value && !removed.value && !rAF) rAF = requestAnimationFrame(tick)
}

function onMotionPreferenceChange(event: MediaQueryListEvent) {
  reduceMotion = event.matches
  configureSpotlight()
  if (reduceMotion) stopMotion()
  else if (pointer.x >= 0 && !exiting.value && !removed.value && !rAF) rAF = requestAnimationFrame(tick)
}

function preloadAsset(src: string) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = image.onerror = () => resolve()
    image.src = src
  })
}

function markReady() {
  if (loaded.value || removed.value) return
  loaded.value = true
  if (spotlightEnabled && !reduceMotion && !spotIntroStart) {
    spotIntroStart = performance.now()
    spotIntroActive = true
    if (!rAF) rAF = requestAnimationFrame(tick)
  }
  document.dispatchEvent(new CustomEvent('hero-ready'))
}

onMounted(() => {
  if (removed.value) return
  lockScroll()

  mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null
  reduceMotion = mediaQuery?.matches ?? false
  mediaQuery?.addEventListener?.('change', onMotionPreferenceChange)

  configureSpotlight()
  resourceTimer = window.setTimeout(markReady, RESOURCE_TIMEOUT_MS)
  Promise.all([
    preloadAsset(url('/assets/annie-spratt-Tno1Zd3T6yY-unsplash.webp')),
    preloadAsset(url('/assets/typede.svg')),
  ]).then(markReady)

  const revealText = () => { fontsReady.value = true }
  fontTimer = window.setTimeout(revealText, FONT_TIMEOUT_MS)
  document.fonts?.ready.then(revealText).catch(() => {})

  heroRef.value?.addEventListener('wheel', onWheel, { passive: false })
  heroRef.value?.addEventListener('touchstart', onTouchStart, { passive: true })
  heroRef.value?.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)

})

onUnmounted(() => {
  stopMotion()
  window.clearTimeout(exitTimer)
  window.clearTimeout(resourceTimer)
  window.clearTimeout(fontTimer)
  window.clearTimeout(resizeTimer)
  transitionCleanup?.()
  unlockScroll()

  heroRef.value?.removeEventListener('wheel', onWheel)
  heroRef.value?.removeEventListener('touchstart', onTouchStart)
  heroRef.value?.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  mediaQuery?.removeEventListener?.('change', onMotionPreferenceChange)
})
</script>

<template>
  <section
    v-if="!removed"
    ref="heroRef"
    class="hero"
    :class="heroClass"
    :aria-label="t('siteTitle')"
    @click="exit"
  >
    <div class="hero__gradient" aria-hidden="true"></div>

    <div class="hero__ticker-wall" aria-hidden="true">
      <div
        v-for="(text, index) in tickers"
        :key="index"
        class="hero__ticker-row"
        :style="{
          '--hero-ticker-opacity': TICKER_OPACITY[index],
          '--hero-ticker-duration': `${TICKER_SPEEDS[index]}s`,
        }"
      >
        <div class="hero__ticker-motion">
          <span class="hero__ticker-track">{{ text }}</span>
          <span class="hero__ticker-track" aria-hidden="true">{{ text }}</span>
        </div>
      </div>
    </div>

    <div
      ref="icebergEl"
      class="hero__iceberg"
      :style="{ backgroundImage: `url(${url('/assets/annie-spratt-Tno1Zd3T6yY-unsplash.webp')})` }"
      aria-hidden="true"
    ></div>

    <div class="hero__grain" aria-hidden="true"></div>
    <div class="hero__surface-light" aria-hidden="true"></div>
    <div class="hero__vignette" aria-hidden="true"></div>
    <div class="hero__dive" aria-hidden="true"></div>
    <canvas ref="spotEl" class="hero__spotlight" aria-hidden="true"></canvas>

    <div class="hero__content">
      <div ref="brandEl" class="hero__brand">
        <img :src="url('/assets/typede.svg')" :alt="t('siteTitle')" class="hero__logo" />
        <p class="hero__subtitle">Chinese Oddities Iceberg · Reforged</p>
      </div>

      <div class="hero__enter" aria-hidden="true">
        <i></i>
        <span>点击进入</span>
      </div>
    </div>

    <div class="hero__hint" aria-hidden="true">
      <span>滚动 · 点击 · 按 Enter</span>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: hidden;
  isolation: isolate;
  color: #fff;
  background: #0d0a08;
  opacity: 0;
  transition: opacity 0.7s ease;
}

.hero--loaded { opacity: 1; }
.hero--exiting {
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.55s ease 0.85s;
}

.hero__gradient,
.hero__ticker-wall,
.hero__iceberg,
.hero__grain,
.hero__surface-light,
.hero__vignette,
.hero__dive,
.hero__spotlight,
.hero__content { position: absolute; }

.hero__gradient {
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(circle at 50% 1%, rgba(255, 205, 138, 0.25), transparent 30%),
    linear-gradient(180deg, #e25b14 0%, #c85019 21%, #315f8b 52%, #081b39 100%);
  transform: scale(1.02);
  transition: opacity 1s ease, transform 1.5s var(--ease-hero);
}

.hero__ticker-wall {
  top: 0;
  right: 0;
  left: 0;
  height: 50vh;
  height: 50dvh;
  z-index: 1;
  display: grid;
  grid-template-rows: repeat(5, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  opacity: 0;
  transition: opacity 1.1s ease 0.15s, transform 1.4s var(--ease-hero), filter 1.2s ease;
}

.hero--fonts-ready .hero__ticker-wall { opacity: 1; }
.hero__ticker-row {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  white-space: nowrap;
  color: #fff;
  opacity: var(--hero-ticker-opacity, 0.12);
  font-family: 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
  font-size: calc(50vh / 5);
  font-size: calc(50dvh / 5);
  font-weight: 200;
  line-height: 1;
  letter-spacing: -0.025em;
}

.hero__ticker-motion {
  display: flex;
  width: max-content;
  transform: translate3d(0, 0, 0);
  animation: hero-ticker-forward var(--hero-ticker-duration, 160s) linear infinite;
  will-change: transform;
}

.hero__ticker-track {
  flex: none;
  min-width: max-content;
}

@keyframes hero-ticker-forward {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}

.hero__iceberg {
  inset: -6%;
  z-index: 3;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  transform: translate3d(var(--hero-parallax-x, 0), var(--hero-parallax-y, 0), 0) scale(1.06);
  filter:
    brightness(0.72)
    saturate(0.92);
  will-change: transform;
  transition: opacity 1s ease, filter 1s ease;
}

.hero__grain {
  inset: 0;
  z-index: 4;
  pointer-events: none;
  opacity: 0.055;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 160px 160px;
}

.hero__surface-light {
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: linear-gradient(0deg, rgba(222, 105, 31, 0.78) 0%, rgba(220, 105, 30, 0.3) 18%, transparent 39%);
}

.hero__vignette {
  inset: 0;
  z-index: 6;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 42%, rgba(2, 5, 12, 0.58) 100%);
}

.hero__dive {
  inset: 0;
  z-index: 19;
  pointer-events: none;
  opacity: 0;
  background:
    linear-gradient(180deg, rgba(4, 21, 48, 0) 0%, rgba(2, 20, 51, 0.4) 42%, rgba(0, 12, 36, 0.92) 100%),
    radial-gradient(ellipse at 50% 110%, rgba(26, 111, 168, 0.32), transparent 58%);
  transform: translate3d(0, 12%, 0);
  transition: opacity 0.85s ease, transform 1.15s var(--ease-hero);
}

.hero__spotlight {
  inset: 0;
  z-index: 20;
  width: 100%;
  height: 100%;
  pointer-events: none;
  image-rendering: auto;
}

.hero__content {
  inset: 0;
  z-index: 10;
  display: grid;
  grid-template-rows: 1fr auto;
  align-items: center;
  justify-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(1.25rem, 3vw, 2.5rem) clamp(1.25rem, 5vw, 5rem) max(1.5rem, env(safe-area-inset-bottom));
  pointer-events: none;
  transform: translate3d(0, 0, 0);
  transition: transform 1.1s var(--ease-hero), opacity 0.85s ease, filter 0.95s ease;
}

.hero__brand {
  width: min(82vw, 680px);
  text-align: center;
  transform: translate3d(var(--hero-brand-x, 0), calc(12px + var(--hero-brand-y, 0px)), 0);
  will-change: transform;
}

.hero__logo {
  display: block;
  width: min(78vw, 620px);
  height: auto;
  margin: 0 auto;
  filter: drop-shadow(0 16px 32px rgba(0,0,0,0.4));
  opacity: 0;
  transform: translateY(28px) scale(0.98);
  animation: hero-brand-in 1.15s 0.18s var(--ease-emphatic) forwards;
}

.hero__subtitle {
  opacity: 0;
  animation: hero-copy-in 0.9s var(--ease-emphatic) forwards;
}

.hero__subtitle {
  margin: clamp(0.8rem, 2vw, 1.35rem) 0 0;
  color: var(--white-58);
  font-size: clamp(0.62rem, 1.1vw, 0.78rem);
  font-weight: 300;
  letter-spacing: 0.38em;
  text-transform: uppercase;
  animation-delay: 0.34s;
}

.hero__enter {
  align-self: end;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: max(0.35rem, env(safe-area-inset-bottom));
  color: var(--white-48);
  font-size: var(--font-micro);
  font-weight: 300;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  animation: hero-prompt-breathe 2.4s ease-in-out infinite;
}

.hero__enter i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px var(--white-50);
}

.hero__hint {
  position: absolute;
  right: clamp(1.25rem, 3vw, 2.5rem);
  bottom: max(1.5rem, env(safe-area-inset-bottom));
  z-index: 11;
  color: var(--white-28);
  font-size: var(--font-micro);
  letter-spacing: 0.2em;
  writing-mode: vertical-rl;
  text-transform: uppercase;
}

@keyframes hero-brand-in {
  from { opacity: 0; transform: translateY(28px) scale(0.98); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes hero-copy-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes hero-prompt-breathe {
  0%, 100% { opacity: 0.42; }
  50% { opacity: 0.86; }
}

.hero--exiting .hero__gradient { opacity: 0; transform: translate3d(0, -4vh, 0) scale(1.1); }
.hero--exiting .hero__ticker-wall { opacity: 0; transform: translate3d(0, -9vh, 0) scale(0.98); filter: blur(7px); }
.hero--exiting .hero__ticker-motion,
.hero--motion-paused .hero__ticker-motion { animation-play-state: paused; }
.hero--exiting .hero__iceberg {
  opacity: 0;
  transform: translate3d(0, -12vh, 0) scale(1.32);
  filter: brightness(0.62) saturate(1.08) blur(10px);
  transition: transform 1.35s var(--ease-hero), opacity 1s ease 0.22s, filter 1s ease;
}
.hero--exiting .hero__dive { opacity: 1; transform: translate3d(0, 0, 0); }
.hero--exiting .hero__grain,
.hero--exiting .hero__surface-light,
.hero--exiting .hero__vignette,
.hero--exiting .hero__spotlight { opacity: 0; transition: opacity 0.58s ease; }
.hero--exiting .hero__content { opacity: 0; transform: translate3d(0, -14vh, 0) scale(0.9); filter: blur(9px); transition-delay: 0.1s; }

@media (pointer: fine) {
  .hero { cursor: none; }
  .hero__enter { cursor: none; }
}

@media (max-width: 640px) {
  .hero__ticker-row {
    font-size: calc(50vh / 5);
    font-size: calc(50dvh / 5);
    letter-spacing: -0.04em;
  }

  .hero__content {
    padding: max(1.1rem, env(safe-area-inset-top)) 1.1rem max(1.25rem, env(safe-area-inset-bottom));
  }

  .hero__brand {
    width: min(90vw, 32rem);
    transform: translateY(2vh);
  }

  .hero__logo { width: min(91vw, 35rem); }
  .hero__subtitle {
    max-width: 88vw;
    margin-left: auto;
    margin-right: auto;
    font-size: var(--font-micro);
    letter-spacing: 0.22em;
    line-height: 1.8;
  }

  .hero__enter {
    margin-bottom: max(0.15rem, env(safe-area-inset-bottom));
    font-size: var(--font-micro);
    letter-spacing: 0.24em;
  }

  .hero__hint { display: none; }
  .hero__spotlight { display: none; }
  .hero__iceberg { inset: -4% -18%; background-position: 52% center; }
}

@media (max-height: 560px) and (orientation: landscape) {
  .hero__hint { display: none; }
  .hero__brand { width: min(62vw, 560px); transform: none; }
  .hero__logo { width: min(58vw, 520px); }
  .hero__subtitle { margin-top: 0.6rem; }
  .hero__enter { margin-bottom: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .hero,
  .hero__gradient,
  .hero__ticker-wall,
  .hero__iceberg,
  .hero__dive,
  .hero__content,
  .hero__spotlight { transition-duration: 0.01ms !important; transition-delay: 0ms !important; }
  .hero__ticker-motion,
  .hero__logo,
  .hero__subtitle,
  .hero__enter { animation: none !important; }
  .hero__logo,
  .hero__subtitle { opacity: 1; transform: none; }
}
</style>
