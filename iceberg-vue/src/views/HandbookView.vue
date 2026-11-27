<script setup lang="ts">
// 术语表 — 页首标签切换 + A-Z 快速跳转，词条采用百科式排版（不装卡片）
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Eye } from '@lucide/vue'
import type { IcebergMeta } from '../lib/data'
import { formatUnixDate } from '../lib/data'
import { activeCategories, activeTags, searchQuery } from '../lib/filterStore'
import { HANDBOOK_TABS, parseSections } from '../lib/handbook'
import RichText from '../components/ui/RichText.vue'
// 术语表只用到分类色 / 标签表 / 生成时间 / 词条总数 —— 走轻量 meta.json（~3.5KB），
// 不导入 iceberg.json（否则会拉下 ~800KB 的词条数据 chunk，而这些内容本页面一条都不显示）
import meta from '../data/meta.json'
import rawMd from '../data/handbook.md?raw'
import { getFirstInitial } from '../lib/pinyin'
import { isInNavHotZone, navShouldShowOnPointer, navShouldShowOnScroll } from '../lib/navVisibility'
import { useI18n } from '../lib/useI18n'
import FlowBackground from '../components/layout/FlowBackground.vue'

const { t } = useI18n()
const data = meta as IcebergMeta
const buildDate = formatUnixDate(data.generatedAt)

const LETTER_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')

interface GlossaryEntry { name: string; desc: string; initial: string; color?: string; emoji?: string }
interface TabDef { key: string; heading: string; labelKey: string; source?: 'criteria' }

// handbook.md 的二级标题即标签页；后续新增板块（组织、事件等）时在 md 加一节并在此注册
// tab 主键以 lib/handbook.ts 为单一事实源（徽章深链共用），source 标记分类/标签所在页
const TABS: TabDef[] = HANDBOOK_TABS.map((t) =>
  t.key === 'criteria' ? { ...t, source: 'criteria' as const } : { ...t },
)

const sections = parseSections(rawMd)

// 分类 / 标签从当前数据集自动生成，md 描述缺失时回退「待补充」，保证与冰山图实际分类标签一致
function buildEntries(def: TabDef): GlossaryEntry[] {
  const mdEntries = sections.get(def.heading) || {}
  const fallback = t('handbookPending')
  // 只留真的写过解释的词条：md 里还没有正文的（正文就是「待补充」占位）不展示。
  // 占位在 md 里常带句号（「待补充。」），与 i18n 的回退文案不一定同形，故用模式判断。
  const PLACEHOLDER = /^(?:待补充|待补|To be added|未記入)[。.！!]?$/iu
  const hasBody = (desc: string) => {
    const d = (desc || '').trim()
    return !!d && d !== fallback && !PLACEHOLDER.test(d)
  }
  if (def.source === 'criteria') {
    const cats = Object.entries(data.categoryColors).map(([name, color]) => ({
      name,
      desc: mdEntries[name] || fallback,
      initial: getFirstInitial(name),
      color,
    }))
    const tags = Object.entries(data.tagMap).map(([emoji, name]) => ({
      name,
      desc: mdEntries[name] || fallback,
      initial: getFirstInitial(name),
      emoji,
    }))
    return [...cats, ...tags]
      .filter((e) => hasBody(e.desc))
      .sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, 'zh-CN'))
  }
  return Object.entries(mdEntries)
    .filter(([, desc]) => hasBody(desc))
    .map(([name, desc]) => ({
      name,
      desc,
      initial: getFirstInitial(name),
    }))
    .sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, 'zh-CN'))
}

const tabs = computed(() => TABS.map(def => ({
  ...def,
  label: t(def.labelKey),
  entries: buildEntries(def),
})))
const activeKey = ref<string>(TABS[0].key)
const activeTab = computed(() => tabs.value.find(tab => tab.key === activeKey.value) || tabs.value[0])

const groups = computed(() => {
  const map = new Map<string, GlossaryEntry[]>()
  for (const entry of activeTab.value?.entries || []) {
    const list = map.get(entry.initial) || []
    list.push(entry)
    map.set(entry.initial, list)
  }
  return [...map.entries()].sort((a, b) => LETTER_ORDER.indexOf(a[0]) - LETTER_ORDER.indexOf(b[0]))
})

// A-Z 快速跳转：只点亮当前板块真实存在的首字母
const activeLetter = ref('')
const letters = computed(() => LETTER_ORDER.map(letter => ({
  letter,
  active: groups.value.some(([l]) => l === letter),
})))
const hasLetters = computed(() => letters.value.some(l => l.active))

const statsText = computed(() =>
  t('handbookStats')
    .replace('{total}', String(data.total))
    .replace('{shown}', String(activeTab.value?.entries.length || 0)))

function selectTab(key: string) {
  activeKey.value = key
  activeLetter.value = ''
  navHidden.value = false
  termEls.clear()
  nextTick(() => window.scrollTo({ top: 0, behavior: 'auto' }))
}

// A-Z 字母条：按钮引用表（滚动联动时用它把当前字母滚进可视区）
const azStrip = ref<HTMLElement | null>(null)
const letterEls = new Map<string, HTMLElement>()
const bindLetterEl = (letter: string) => (el: unknown) => {
  if (el instanceof HTMLElement) letterEls.set(letter, el)
  else letterEls.delete(letter)
}

let clickLock = 0
function scrollToLetter(letter: string) {
  activeLetter.value = letter
  navHidden.value = false
  clickLock = performance.now() + 600 // 平滑滚动期间不让联动抢走高亮
  document.getElementById(`hb-letter-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 当前视口顶部所在的首字母（吸顶导航下沿为准） */
function currentLetter(): string {
  const nav = document.querySelector('nav.sticky')
  const limit = (nav?.getBoundingClientRect().bottom ?? 120) + 12
  let current = ''
  for (const [letter] of groups.value) {
    const el = document.getElementById(`hb-letter-${letter}`)
    if (!el) continue
    if (el.getBoundingClientRect().top <= limit) current = letter
    else break
  }
  return current || groups.value[0]?.[0] || ''
}

/** 窄屏下把当前字母滚进可视区（内容放得下时不做任何事） */
function revealLetter(letter: string) {
  const strip = azStrip.value
  const btn = letterEls.get(letter)
  if (!strip || !btn || strip.scrollWidth <= strip.clientWidth) return
  const b = btn.getBoundingClientRect()
  const s = strip.getBoundingClientRect()
  if (b.left < s.left + 8 || b.right > s.right - 8) {
    strip.scrollTo({ left: strip.scrollLeft + (b.left - s.left) - (s.width - b.width) / 2, behavior: 'smooth' })
  }
}

// 导航变形：未贴住时透明，贴住后浮成卡片（与冰山图筛选栏同一语义）
const stuck = ref(false)

// 导航显隐：与冰山图筛选栏共用 lib/navVisibility 的规则（上滚显 / 下滚隐 / 热区直达）
const navHidden = ref(false)
const coarse = ref(false)
let hotY = -1
let lastY = 0
let spyRaf = 0

function onSpyPointer(e: MouseEvent) {
  hotY = e.clientY
  navHidden.value = navShouldShowOnPointer({
    inHotZone: isInNavHotZone(e.clientY),
    coarsePointer: coarse.value,
    forceVisible: false,
    alwaysVisible: !stuck.value,
  }) === 'hide'
}

function onSpyScroll() {
  if (spyRaf) return
  spyRaf = requestAnimationFrame(() => {
    spyRaf = 0
    const y = window.scrollY
    const dy = y - lastY
    lastY = y
    const decision = navShouldShowOnScroll({
      y,
      dy,
      inHotZone: isInNavHotZone(hotY),
      coarsePointer: coarse.value,
      forceVisible: false,
      alwaysVisible: !stuck.value,
    })
    if (decision === 'show') navHidden.value = false
    else if (decision === 'hide') navHidden.value = true

    const navEl = document.querySelector<HTMLElement>('nav.hb-nav')
    stuck.value = (navEl?.getBoundingClientRect().top ?? 999) <= 12
    if (performance.now() < clickLock) return
    const letter = currentLetter()
    if (letter && letter !== activeLetter.value) {
      activeLetter.value = letter
      revealLetter(letter)
    }
  })
}

function onTabKeydown(e: KeyboardEvent, index: number) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const delta = e.key === 'ArrowRight' ? 1 : -1
  const next = tabs.value[(index + delta + tabs.value.length) % tabs.value.length]
  selectTab(next.key)
  nextTick(() => document.getElementById(`hb-tab-${next.key}`)?.focus())
}

// L1：徽章深链（?tab=&term=）定位高亮。元素引用走 ref map，不污染 DOM id。
const route = useRoute()
const router = useRouter()
const termEls = new Map<string, HTMLElement>()
const bindTermEl = (name: string) => (el: unknown) => {
  if (el instanceof HTMLElement) termEls.set(name, el)
  else termEls.delete(name)
}
const flash = ref('')
let flashTimer = 0
async function applyDeepLink() {
  const q = route.query
  const tab = typeof q.tab === 'string' ? q.tab : ''
  if (tab && HANDBOOK_TABS.some((t) => t.key === tab) && tab !== activeKey.value) {
    activeKey.value = tab
    activeLetter.value = ''
    await nextTick()
  }
  const term = typeof q.term === 'string' ? q.term : ''
  if (!term) return
  await nextTick()
  const el = termEls.get(term)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flash.value = term
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    if (flash.value === term) flash.value = ''
  }, 1600)
}
onMounted(() => {
  applyDeepLink()
  coarse.value = window.matchMedia('(hover: none)').matches
  window.addEventListener('scroll', onSpyScroll, { passive: true })
  window.addEventListener('mousemove', onSpyPointer, { passive: true })
  onSpyScroll()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onSpyScroll)
  window.removeEventListener('mousemove', onSpyPointer)
  if (spyRaf) cancelAnimationFrame(spyRaf)
  if (flashTimer) window.clearTimeout(flashTimer)
})
watch(() => route.query, applyDeepLink)
watch(groups, () => nextTick(onSpyScroll))

// L2：反向联动 —— 术语表（仅分类/标签页）设筛选后跳回冰山图。
// 有色点的是分类（名即筛选值）；无色点有 emoji 的是标签，筛选值必须是 emoji
// 本身（墙上 item.emojis 存的是 emoji，tagMap 的显示名匹配不上），缺失时回退显示名。
// from 缺失时回主站。
function viewInIceberg(e: GlossaryEntry) {
  const from = typeof route.query.from === 'string' && route.query.from.startsWith('/') ? route.query.from : '/'
  if (e.color) activeCategories.set([e.name])
  else activeTags.set([e.emoji || e.name])
  searchQuery.set('')
  router.push(from)
}
</script>

<template>
  <div class="min-h-screen">
    <!-- 橙蓝黑流体背景：固定铺满视口，纯装饰不拦截交互 -->
    <FlowBackground />

    <div class="relative z-10 mx-auto max-w-[1040px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-24">
      <header class="mb-8">
      <router-link to="/home" class="hb-back">
        <ArrowLeft :size="14" :stroke-width="2" aria-hidden="true" />
        <span>{{ t('backToHome') }}</span>
      </router-link>
      <h1 class="h1-display">{{ t('handbookTitle') }}</h1>
      <p class="max-w-2xl text-sm leading-[1.7] text-white-35 sm:text-base">{{ t('handbookIntro') }}</p>
    </header>

    <!-- 快速筛选跳转栏：毛玻璃圆角胶囊，标题之下、滚动时吸顶常驻
         注意：sticky 的包含块必须是整页容器，不能用只包住自身高度的 div 包裹，否则滚动后会一起滚出屏幕 -->
    <div class="h-6" aria-hidden="true"></div>
    <!-- 吸顶导航：选项卡（移动端三等分铺满，保证三个都完整可见）+ A-Z（自动换行，不横向滚动）
         表面沿用全站的 v2 表面令牌（--v2-surface / --v2-r-lg / --v2-shadow-sm / --v2-blur） -->
    <nav class="hb-nav sticky top-3 z-20" :class="{ 'hb-hidden': navHidden, stuck }" :aria-label="t('handbookTitle')">
      <div class="hb-surface">
        <div class="hb-tabs" role="tablist">
          <button v-for="(tab, i) in tabs" :key="tab.key" :id="`hb-tab-${tab.key}`" type="button"
            role="tab" :aria-selected="activeKey === tab.key" :aria-controls="`hb-panel-${tab.key}`"
            class="hb-tab" :class="{ on: activeKey === tab.key }"
            @click="selectTab(tab.key)" @keydown="onTabKeydown($event, i)">
            <span class="hb-tab-label">{{ tab.label }}</span>
            <span class="hb-tab-count">{{ tab.entries.length }}</span>
          </button>
        </div>

        <div v-if="hasLetters" ref="azStrip" class="hb-az" aria-label="A-Z 快速跳转">
          <div class="hb-az-inner">
            <button v-for="l in letters" :key="l.letter" :ref="bindLetterEl(l.letter)" type="button" :disabled="!l.active"
              :aria-current="activeLetter === l.letter ? 'true' : undefined"
              class="hb-az-letter" :class="{ on: activeLetter === l.letter }"
              @click="scrollToLetter(l.letter)">{{ l.letter }}</button>
          </div>
        </div>
      </div>
    </nav>

    <Transition name="fade-up" mode="out-in">
      <div v-if="activeTab" :id="`hb-panel-${activeTab.key}`" :key="activeTab.key"
        role="tabpanel" :aria-labelledby="`hb-tab-${activeTab.key}`" class="pt-8">
        <template v-if="groups.length">
          <section v-for="[letter, entries] in groups" :key="letter" class="mb-8">
            <h2 :id="`hb-letter-${letter}`"
              class="mb-4 scroll-mt-36 border-b border-white-05 pb-2 text-xl font-black tracking-[0.1em] text-white-55">
              {{ letter }}<span class="ml-2 align-middle text-tiny font-normal tracking-normal text-white-25">{{ entries.length }}</span>
            </h2>

            <!-- 词条百科式排版：只留标题与解释，不用卡片框住每个词条 -->
            <article v-for="e in entries" :key="e.name" :ref="bindTermEl(e.name)" class="hb-term mb-7 last:mb-0" :class="{ 'hb-flash': flash === e.name }">
              <h3 class="mb-1.5 flex items-baseline gap-2 text-base font-bold leading-[1.4] text-white-85">
                <!-- 引导槽：emoji 与色点共用同一固定宽度（w-6），保证名字列在整张列表里对齐 -->
                <span v-if="e.emoji" class="inline-flex w-6 shrink-0 items-center justify-center self-center text-base leading-none" aria-hidden="true">{{ e.emoji }}</span>
                <span v-else-if="e.color" class="inline-flex w-6 shrink-0 items-center justify-center self-center" aria-hidden="true">
                  <span class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: e.color }"></span>
                </span>
                <span>{{ e.name }}</span>
                <button v-if="activeKey === 'criteria'" type="button" class="hb-viewin" :title="t('viewInIceberg')" :aria-label="`${t('viewInIceberg')}：${e.name}`" @click="viewInIceberg(e)">
                  <Eye :size="14" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </h3>
              <RichText class="hb-desc max-w-[640px] text-sm leading-[1.85] text-white-55" :text="e.desc" />
            </article>
          </section>
        </template>

        <div v-else class="rounded-xl border border-dashed border-white-08 bg-white-02 px-6 py-12 text-center">
          <p class="text-sm text-white-35">{{ t('handbookEmpty') }}</p>
        </div>
      </div>
    </Transition>

        <footer class="mt-14 border-t border-white-04 pt-4 text-xs text-white-30">
          {{ buildDate }} · {{ statsText }}
        </footer>
    </div>

  </div>
  </template>

<style scoped>
/* 深链定位目标：吸顶导航补偿 + 高亮描边 */
.hb-term { scroll-margin-top: 12rem; }
.hb-flash { outline: 1px solid var(--white-40); outline-offset: 6px; border-radius: 6px; }
/* 反向回跳（仅分类/标签页）：半透明眼睛，不抢目录阅读节奏 */
.hb-viewin {
  display: inline-flex; align-items: center;
  background: none; border: none; cursor: pointer; padding: 2px;
  color: var(--white-35); opacity: 0.45; transition: opacity 0.15s, color 0.15s;
}
.hb-viewin:hover { opacity: 1; color: var(--white-85); }
/* 词条描述：段落/引用块与段内硬换行由 ui/RichText 统一负责，
   这里只保留 .hb-desc 作为宿主类（排印用 Tailwind 工具类给） */

/* 返回：与 3D / 深潜页同款（lucide 箭头 + backToHome），放在标题上方当面包屑 */
.hb-back {
  display: inline-flex; align-items: center; gap: 0.35rem;
  margin-bottom: 0.35rem; font-size: var(--font-xs); color: var(--white-40);
  transition: color 0.2s;
}
.hb-back:hover { color: var(--white-85); }


/* 吸顶导航：上滚显、下滚隐 */
.hb-nav { transition: opacity 0.25s ease, transform 0.25s ease, visibility 0s; }
.hb-nav.hb-hidden {
  opacity: 0; transform: translateY(-8px); visibility: hidden;
  transition: opacity 0.25s ease, transform 0.25s ease, visibility 0s 0.25s;
  pointer-events: none;
}

/* 吸顶导航：沿用全站 v2 表面令牌，与 ICEBERG / 专题页的卡片表面同源 */
.hb-surface {
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--v2-r-lg);
  background: transparent;
  box-shadow: none;
  transition:
    background-color 0.5s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    border-color 0.5s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    box-shadow 0.5s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}
.hb-nav.stuck .hb-surface {
  background: var(--v2-surface);
  border-color: var(--white-10);
  box-shadow: var(--v2-shadow-sm);
  backdrop-filter: blur(var(--v2-blur));
  -webkit-backdrop-filter: blur(var(--v2-blur));
}

/* 选项卡：移动端三等分铺满（三个标签都完整可见），桌面端按内容宽度排 */
.hb-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25rem; padding: 0.35rem 0.5rem; }
.hb-tab {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem;
  min-height: 2.25rem; padding: 0.4rem 0.5rem; border-radius: var(--v2-r-md);
  width: 100%;
  font-size: var(--font-xs); font-weight: 500; color: var(--white-45);
  transition: color 0.2s, background-color 0.2s;
}
.hb-tab:hover { color: var(--white-85); background: var(--white-05); }
.hb-tab.on { color: var(--white-95); background: var(--white-08); }
.hb-tab-label { white-space: nowrap; }
.hb-tab-count { font-size: var(--font-micro); font-weight: 400; color: var(--white-30); font-variant-numeric: tabular-nums; }
.hb-tab.on .hb-tab-count { color: var(--white-55); }

/* A-Z：自动换行（宽屏一行、窄屏三行），全部字母始终可见，不做横向滚动 */
.hb-az {
  display: flex; gap: 0.125rem;
  padding: 0.3rem 0.5rem 0.4rem;
  border-top: 1px solid var(--white-05);
  overflow-x: auto;
  scrollbar-width: none;
}
.hb-az::-webkit-scrollbar { display: none; }
.hb-az-inner { display: flex; gap: 0.125rem; width: max-content; }
.hb-az-letter {
  height: 1.5rem; min-width: 1.25rem; padding: 0 0.15rem;
  border-radius: 6px; font-size: var(--font-tiny); font-weight: 600;
  color: var(--white-55); transition: color 0.15s, background-color 0.15s;
}
.hb-az-letter:hover { color: var(--white-90); background: var(--white-06); }
.hb-az-letter.on { color: var(--white-95); background: var(--white-10); }
.hb-az-letter:disabled { color: var(--white-20); cursor: default; background: none; }

@media (min-width: 640px) {
  .hb-tabs { grid-template-columns: repeat(3, 1fr); padding: 0.4rem 0.5rem; }
  .hb-tab { font-size: var(--font-sm); }
  .hb-az { padding: 0.3rem 0.5rem 0.4rem; }
  .hb-az-inner { width: 100%; justify-content: space-between; }
  .hb-az-letter { height: 1.5rem; min-width: 1.25rem; flex: 1; max-width: 2rem; font-size: var(--font-xs); }
}
@media (max-width: 639px) {
  /* 窄屏字母条可横向滚动：裁切边内缩到距外边界 10px，而不是贴着面板外沿切断；
     容器内留 12px 内距，保证静止时首尾字母不被内缩的裁切刀口切到 */
  .hb-az {
    padding: 0.25rem 0 0.3rem;
    -webkit-mask-image: linear-gradient(to right, transparent 0 10px, #000 10px, #000 calc(100% - 10px), transparent calc(100% - 10px) 100%);
    mask-image: linear-gradient(to right, transparent 0 10px, #000 10px, #000 calc(100% - 10px), transparent calc(100% - 10px) 100%);
  }
  .hb-az-inner { padding: 0 0.75rem; }
  .hb-az-letter { height: 1.75rem; min-width: 1.875rem; font-size: var(--font-tiny); }
}

</style>
