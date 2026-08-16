<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { lang } from '../lib/i18nStore'
import { user as userAtom, isSupabaseReady } from '../lib/userState'
import { useI18n } from '../lib/useI18n'
import raw from '../data/iceberg.json'
import csvRaw from '../data/on-this-day.csv?raw'
import { parseCSV } from '../lib/csv'
import { normalizeData } from '../lib/data'
import LiquidGradient from '../components/layout/LiquidGradient.vue'
import IcebergParticles from '../components/home/IcebergParticles.vue'
import AboutModal from '../components/modals/AboutModal.vue'
import LinksModal from '../components/modals/LinksModal.vue'

const UserModal = defineAsyncComponent(() => import('../components/modals/UserModal.vue'))

const router = useRouter()
const { t } = useI18n()
const currentLang = useStore(lang)

const showAbout = ref(false)
const showLinks = ref(false)
const showUser = ref(false)
const u = useStore(userAtom)
const supReady = isSupabaseReady()

const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
  { code: 'ja', label: '日本語' },
]
function setLang(code: string) { lang.set(code as 'zh' | 'en' | 'ja') }

const loaded = ref(false)
onMounted(() => {
  requestAnimationFrame(() => { loaded.value = true })
  // P1-10: 空闲时加载 authStore（恢复会话/监听登录态），SDK 不进首屏关键路径
  if (supReady) {
    const preload = () => import('../lib/authStore')
    if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 3000 })
    else window.setTimeout(preload, 800)
  }
})

// 液态种子：每次进入页面（含 keep-alive 切回）重新随机，图案不重复
const bgSeed = ref(Math.floor(Math.random() * 1001))
function rerollSeed() { bgSeed.value = Math.floor(Math.random() * 1001) }

onActivated(() => { rerollSeed() })

// 数据统计
const data = normalizeData(raw)
const buildDate = new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN')
const entryCount = computed(() => Object.values(data.tiers).flat().length)
const tierCount = computed(() => data.tierOrder.length)
const categoryCount = computed(() => Object.keys(data.categoryColors).length)
const statsText = computed(() =>
  t('homeStats').replace('{count}', String(entryCount.value)).replace('{tiers}', String(tierCount.value)).replace('{cats}', String(categoryCount.value)))

// 历史上的今天：今天的事件（无则仅显示日期 + 名称）
const allEvents = parseCSV(csvRaw) as Record<string, string>[]
const today = new Date()
const mmdd = String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
const todayEvent = computed(() => allEvents.find(e => e.date === mmdd) || null)

// 光标圆环（桌面 pointer:fine，橙色淡环，跟随原 Hero 光标语言）
const ringEl = ref<HTMLDivElement | null>(null)
let ringRaf = 0
let ringMove: ((e: PointerEvent) => void) | null = null
let ringActive = false
function initCursorRing() {
  const el = ringEl.value
  if (!el || ringActive) return
  if (!window.matchMedia('(pointer: fine)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  ringActive = true
  let x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y
  function step() {
    if (!el || !ringActive) return
    ringRaf = 0
    x += (tx - x) * 0.16; y += (ty - y) * 0.16
    el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)'
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) ringRaf = requestAnimationFrame(step)
  }
  function schedule() { if (ringActive && !ringRaf) ringRaf = requestAnimationFrame(step) }
  ringMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; schedule() }
  window.addEventListener('pointermove', ringMove, { passive: true })
}
function stopCursorRing() {
  ringActive = false
  if (ringRaf) cancelAnimationFrame(ringRaf)
  ringRaf = 0
  if (ringMove) window.removeEventListener('pointermove', ringMove)
  ringMove = null
}

onMounted(initCursorRing)
// keep-alive 切走后停止光标圆环 RAF，切回再恢复
onActivated(() => { if (!ringActive) initCursorRing() })
onDeactivated(stopCursorRing)
onUnmounted(stopCursorRing)
</script>

<template>
  <main class="ds-home" :class="{ 'ds-home--loaded': loaded }">
    <div ref="ringEl" class="ds-ring" aria-hidden="true"></div>

    <!-- 全页液态背景（头尾完全透明融入） -->
    <div class="ds-bg" aria-hidden="true">
      <LiquidGradient colorA="#000000" :seed="bgSeed" :turb-iter="7" />
      <span class="ds-bg-vignette"></span>
    </div>

    <!-- 左上角：登录/用户入口 + 语言切换 -->
    <div class="ds-top-left">
      <button v-if="supReady" type="button" class="ds-user" @click="showUser = true">
        <svg v-if="!u" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span v-else class="ds-user-dot" aria-hidden="true"></span>
        <span>{{ u ? u.displayName : t('login') }}</span>
      </button>

      <div class="ds-lang" role="group" aria-label="Language">
        <button v-for="l in LANGS" :key="l.code" type="button"
          :class="{ 'is-active': currentLang === l.code }"
          @click="setLang(l.code)">{{ l.label }}</button>
      </div>
    </div>

    <!-- Hero：全屏粒子冰山（包围盒=整个屏幕，放大出屏，屏幕边缘切割）+ 内容层 -->
    <section class="ds-hero">
      <div class="ds-berg-wrap">
        <IcebergParticles :label="t('homeIcebergCta')" />
      </div>
      <div class="ds-hero-inner">
        <!-- 左栏 -->
        <div class="ds-hero-left">
          <!-- 历史上的今天：一行文字（今天的事件 / 无事件仅日期 + 名称） -->
          <button class="group inline-flex items-baseline gap-2 border-none bg-transparent cursor-pointer p-0 text-sm text-white-52 text-left transition-colors duration-200 hover:text-accent-soft" @click="router.push('/on-this-day')">
            <span class="font-mono text-white-85 tracking-[0.04em]">{{ String(today.getMonth() + 1).padStart(2, '0') }}.{{ String(today.getDate()).padStart(2, '0') }}</span>
            <span class="text-white-22" aria-hidden="true">｜</span>
            <span v-if="todayEvent" class="max-w-[36ch] overflow-hidden text-ellipsis whitespace-nowrap">{{ todayEvent.year }} · {{ todayEvent.title }}</span>
            <span v-else class="max-w-[36ch] overflow-hidden text-ellipsis whitespace-nowrap">{{ t('navOnThisDay') }}</span>
            <span class="transition-transform duration-200 group-hover:translate-x-[3px]" aria-hidden="true">→</span>
          </button>

          <h1 class="m-0 font-sans text-[clamp(2.1rem,5.2vw,3rem)] max-[639px]:text-[2.3rem] font-bold tracking-[0.12em] leading-[1.3] text-text-primary">{{ t('siteTitle') }}</h1>

          <p class="m-0 text-xs text-white-35">{{ statsText }}</p>

          <!-- 主卡区：冰山图 2×2（左下），古籍 / 3D 各占右上右下 -->
          <div class="ds-cards">
            <button class="ds-cta ds-card--main" @click="router.push('/')">
              <span class="ds-main-top">
                <span class="ds-cta-title">{{ t('navIceberg') }}</span>
                <span class="ds-cta-desc">{{ t('homeDive') }}</span>
              </span>
              <span class="ds-cta-arrow" aria-hidden="true">→</span>
            </button>
            <button class="ds-cta" @click="router.push('/ancient-book')">
              <span class="ds-cta-title">{{ t('homeCta3Title') }}</span>
              <span class="ds-cta-desc">{{ t('homeCta3Desc') }}</span>
            </button>
            <button class="ds-cta" @click="router.push('/3d')">
              <span class="ds-cta-title">{{ t('homeCta2Title') }}</span>
              <span class="ds-cta-desc">{{ t('homeCta2Desc') }}</span>
            </button>
          </div>

          <!-- 文字入口 -->
          <nav class="flex flex-wrap gap-[1.1rem]" aria-label="Secondary">
            <button class="border-none bg-transparent p-0 text-left text-xs text-white-32 no-underline cursor-pointer transition-colors duration-200 hover:text-white-85" @click="router.push('/features')">{{ t('navFeatures') }}</button>
            <button class="border-none bg-transparent p-0 text-left text-xs text-white-32 no-underline cursor-pointer transition-colors duration-200 hover:text-white-85" @click="router.push('/handbook')">{{ t('homeGlossary') }}</button>
            <button type="button" class="border-none bg-transparent p-0 text-left text-xs text-white-32 no-underline cursor-pointer transition-colors duration-200 hover:text-white-85" @click="showAbout = true">{{ t('homeAbout') }}</button>
            <button type="button" class="border-none bg-transparent p-0 text-left text-xs text-white-32 no-underline cursor-pointer transition-colors duration-200 hover:text-white-85" @click="showLinks = true">{{ t('homeLinks') }}</button>
          </nav>
        </div>

        <!-- 右栏占位（保持左 52% / 右 48% 布局与底部对齐；视觉由全屏冰山承担） -->
        <div class="ds-berg-space" aria-hidden="true"></div>
      </div>
    </section>

    <AboutModal v-if="showAbout" :build-date="buildDate" :entry-count="entryCount" @close="showAbout = false" />
    <LinksModal v-if="showLinks" @close="showLinks = false" />
    <UserModal v-if="showUser" @close="showUser = false" />
  </main>
</template>

<style scoped>
/* ═══ 基调：原版暗色深海（黑蓝橙） × DeepSeek 布局 ═══ */
.ds-home {
  position: relative; min-height: 100dvh;
  display: flex; flex-direction: column;
  color: var(--color-text-primary);
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  -webkit-font-smoothing: antialiased;
  opacity: 0; transition: opacity 0.8s ease;
  --page-pad: clamp(1.25rem, 4vw, 2.5rem);
  --page-max: 1280px;
}
.ds-home--loaded { opacity: 1; }

.ds-ring {
  position: fixed; left: -20px; top: -20px;
  width: 40px; height: 40px; border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--color-accent-bright) 35%, transparent);
  pointer-events: none; z-index: 9998;
}

/* 左上角工具组：语言切换 + 登录/用户入口 */
.ds-top-left {
  position: absolute; top: 0.9rem; left: calc(max(var(--page-pad), calc((100vw - var(--page-max)) / 2 + var(--page-pad))) - 0.675rem);
  z-index: 5;
  display: flex; align-items: center; gap: 0.5rem;
}

/* 悬浮语言切换（外缘对齐区块文字左缘，再左移内 padding 使文字光学对齐） */
.ds-lang {
  display: inline-flex; padding: 2px; gap: 1px;
  background: var(--white-07); border-radius: 999px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.ds-lang button {
  border: none; background: none; cursor: pointer;
  padding: 0.18rem 0.55rem; border-radius: 999px;
  font-size: var(--font-tiny); font-weight: 400; color: var(--white-45);
  transition: all 0.2s ease;
}
.ds-lang button.is-active { background: var(--white-14); color: var(--color-text-primary); }
.ds-lang button:focus-visible {
  outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 6px;
}

/* 登录 / 用户入口（与语言按钮同尺寸） */
.ds-user {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.18rem 0.55rem; border-radius: 999px;
  border: none; background: var(--white-07);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  font-size: var(--font-tiny); font-weight: 400; color: var(--white-55);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}
.ds-user:hover {
  color: var(--color-accent-soft); background: var(--white-14);
}
.ds-user:focus-visible {
  outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 999px;
}
.ds-user-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-accent-soft);
  box-shadow: 0 0 8px rgba(255, 179, 111, 0.6);
}

/* ═══ 全页背景（头尾透明融入） ═══ */
.ds-bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; }
.ds-bg-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 120% 80% at 50% 40%, transparent 58%, rgba(0, 0, 10, 0.32) 100%),
    linear-gradient(180deg, rgba(0, 0, 10, 0.22) 0%, transparent 20%, transparent 80%, rgba(0, 0, 10, 0.34) 100%);
}

/* ═══ Hero ═══ */
.ds-hero { position: relative; z-index: 1; flex: 1; display: flex; align-items: center; }
.ds-hero-inner {
  position: relative; z-index: 2;
  max-width: 1280px; width: 100%; margin: 0 auto;
  padding: clamp(2.4rem, 7vh, 4.5rem) clamp(1.25rem, 4vw, 2.5rem) clamp(2.5rem, 7vh, 5rem);
  display: flex; flex-direction: column; align-items: center; gap: clamp(2rem, 5vh, 3.5rem);
  pointer-events: none;
}
.ds-hero-left {
  width: 100%; max-width: 640px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 1.6rem;
  pointer-events: auto;
}

/* 主卡区：冰山图 2×2（左下）+ 古籍/3D（右上右下），同一玻璃卡语言 */
.ds-cards { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; gap: 0.75rem; width: 100%; }
.ds-card--main { grid-row: 1 / 3; justify-content: space-between; }
.ds-card--main .ds-cta-title { font-size: 1.25rem; }
.ds-card--main .ds-cta-desc { font-size: var(--font-sm); }
.ds-main-top {
  display: flex; flex-direction: column; gap: 0.35rem;
}
.ds-cta-arrow {
  align-self: flex-end;
  font-size: 1.1rem; line-height: 1;
  color: var(--white-60);
  transition: transform 0.25s ease;
}
.ds-card--main:hover .ds-cta-arrow { transform: translateX(4px); }
.ds-cta {
  display: flex; flex-direction: column; gap: 0.3rem; text-align: left;
  padding: 0.95rem 1.05rem;
  border-radius: 14px;
  border: 1px solid var(--white-14);
  background: var(--white-055);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
}
.ds-cta:hover {
  transform: translateY(-2px);
  background: var(--white-09);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.35);
}
.ds-cta:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.ds-cta-title { font-size: var(--font-base); font-weight: 600; color: var(--color-text-primary); }
.ds-cta-desc { font-size: var(--font-xs); line-height: 1.55; color: var(--white-45); white-space: pre-line; }

/* ═══ 全屏粒子冰山层（纯装饰：不可点击，不拦截事件） ═══ */
.ds-berg-wrap {
  position: absolute; inset: 0; z-index: 1;
  width: 100%; height: 100%;
  pointer-events: none;
}
.ds-berg-space {
  width: 46%; max-width: min(520px, 44vw);
  aspect-ratio: 1 / 1;
  pointer-events: none;
}

/* ═══ 桌面分栏 ═══ */
@media (min-width: 860px) {
  .ds-hero-inner {
    flex-direction: row; align-items: flex-end; justify-content: space-between;
    gap: clamp(2rem, 5vw, 5rem);
  }
  .ds-hero-left { width: 52%; max-width: 640px; justify-content: flex-end; }
}


/* ═══ 移动端 ═══ */
@media (max-width: 639px) {
  .ds-berg-space { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ds-home { transition: none; opacity: 1; }
  .ds-ring { display: none; }
}
</style>