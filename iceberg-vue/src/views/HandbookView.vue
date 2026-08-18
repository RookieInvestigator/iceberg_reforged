<script setup lang="ts">
// 术语表 — 页首标签切换 + A-Z 快速跳转，词条采用百科式排版（不装卡片）
import { computed, nextTick, ref } from 'vue'
import { normalizeData } from '../lib/data'
import rawData from '../data/iceberg.json'
import rawMd from '../data/handbook.md?raw'
import { getFirstInitial } from '../lib/pinyin'
import { useI18n } from '../lib/useI18n'
import LiquidGradient from '../components/layout/LiquidGradient.vue'

const { t } = useI18n()
const data = normalizeData(rawData)
const allItems = Object.values(data.tiers).flat()
const buildDate = new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN')

// 橙蓝黑流体背景：每次进入页面重新随机，图案不重复
const bgSeed = ref(Math.floor(Math.random() * 1001))

const LETTER_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')

interface GlossaryEntry { name: string; desc: string; initial: string; color?: string; emoji?: string }
interface TabDef { key: string; heading: string; labelKey: string; source?: 'criteria' }

// handbook.md 的二级标题即标签页；后续新增板块（组织、事件等）时在 md 加一节并在此注册
const TABS: TabDef[] = [
  { key: 'criteria', heading: '划定标准', labelKey: 'handbookTabCriteria', source: 'criteria' },
  { key: 'concepts', heading: '各类概念', labelKey: 'handbookTabConcepts' },
  { key: 'people', heading: '人物作品', labelKey: 'handbookTabPeople' },
]

function parseSections(md: string): Map<string, Record<string, string>> {
  const sections = new Map<string, Record<string, string>>()
  const parts = md.split(/\r?\n## /)
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const entries: Record<string, string> = {}
    const blocks = body.split(/\r?\n### /)
    for (const block of blocks) {
      const sn = block.indexOf('\n')
      if (sn === -1) continue
      const name = block.slice(0, sn).trim()
      const rest = block.slice(sn + 1)
      const end = rest.search(/\n(?:### |## )/)
      const desc = end === -1 ? rest.trim() : rest.slice(0, end).trim()
      if (name && desc) entries[name] = desc
    }
    sections.set(title, entries)
  }
  return sections
}

const sections = parseSections(rawMd)

// 分类 / 标签从当前数据集自动生成，md 描述缺失时回退「待补充」，保证与冰山图实际分类标签一致
function buildEntries(def: TabDef): GlossaryEntry[] {
  const mdEntries = sections.get(def.heading) || {}
  const fallback = t('handbookPending')
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
      .sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name, 'zh-CN'))
  }
  return Object.entries(mdEntries).map(([name, desc]) => ({
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

const statsText = computed(() =>
  t('handbookStats')
    .replace('{total}', String(allItems.length))
    .replace('{shown}', String(activeTab.value?.entries.length || 0)))

function selectTab(key: string) {
  activeKey.value = key
  activeLetter.value = ''
  nextTick(() => window.scrollTo({ top: 0, behavior: 'auto' }))
}

function scrollToLetter(letter: string) {
  activeLetter.value = letter
  document.getElementById(`hb-letter-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 鼠标用户没有触控板横向滑动时，允许在 A-Z 行上滚动滚轮横向查看后面的字母；
// 只有在横向确实还能滚动时才拦截纵向滚轮，避免干扰整页滚动。
function onAZWheel(e: WheelEvent) {
  const el = e.currentTarget as HTMLElement
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return
  const canScroll = (e.deltaY > 0 && el.scrollLeft < maxScroll) || (e.deltaY < 0 && el.scrollLeft > 0)
  if (canScroll) {
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }
}

function onTabKeydown(e: KeyboardEvent, index: number) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const delta = e.key === 'ArrowRight' ? 1 : -1
  const next = tabs.value[(index + delta + tabs.value.length) % tabs.value.length]
  selectTab(next.key)
  nextTick(() => document.getElementById(`hb-tab-${next.key}`)?.focus())
}
</script>

<template>
  <div class="min-h-screen">
    <!-- 橙蓝黑流体背景：固定铺满视口，纯装饰不拦截交互 -->
    <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <LiquidGradient colorA="#000000" colorB="#012945" colorC="#045B8D" colorD="#0076A2" colorE="#B25512" :seed="bgSeed" :turb-iter="7" />
      <span class="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/70"></span>
    </div>

    <div class="relative z-10 mx-auto max-w-[1040px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-24">
      <header class="mb-8">
      <h1 class="text-[2rem] font-black text-white-92 mb-2 tracking-[0.03em]">{{ t('handbookTitle') }}</h1>
      <p class="max-w-2xl text-sm leading-[1.7] text-white-35 sm:text-base">{{ t('handbookIntro') }}</p>
    </header>

    <!-- 快速筛选跳转栏：毛玻璃圆角胶囊，标题之下、滚动时吸顶常驻
         注意：sticky 的包含块必须是整页容器，不能用只包住自身高度的 div 包裹，否则滚动后会一起滚出屏幕 -->
    <div class="h-6" aria-hidden="true"></div>
    <nav class="sticky top-3 z-20" :aria-label="t('handbookTitle')">
      <div class="overflow-hidden rounded-2xl border border-white-08 bg-black/45 backdrop-blur-md">
        <div class="flex items-center gap-2 px-4 pt-3">
          <div class="flex gap-2 overflow-x-auto no-scrollbar" role="tablist">
            <button v-for="(tab, i) in tabs" :key="tab.key" :id="`hb-tab-${tab.key}`" type="button"
              role="tab" :aria-selected="activeKey === tab.key" :aria-controls="`hb-panel-${tab.key}`"
              class="shrink-0 rounded-full border px-4 py-2 text-sm transition-colors duration-200 max-sm:min-h-11"
              :class="activeKey === tab.key
                ? 'border-white-16 bg-white-10 text-white-90'
                : 'border-transparent text-white-45 hover:bg-white-05 hover:text-white-75'"
              @click="selectTab(tab.key)" @keydown="onTabKeydown($event, i)">
              <span class="flex items-baseline gap-1.5">
                <span>{{ tab.label }}</span>
                <span class="text-tiny font-normal" :class="activeKey === tab.key ? 'text-white-55' : 'text-white-25'">{{ tab.entries.length }}</span>
              </span>
            </button>
          </div>

          <router-link to="/home"
            class="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-white-45 transition-colors duration-200 hover:text-white-85">
            <span aria-hidden="true">←</span><span>{{ t('backToHome') }}</span>
          </router-link>
        </div>

        <div class="hb-scroll-x flex gap-1 overflow-x-auto pl-4 pb-3 pt-1" aria-label="A-Z 快速跳转" @wheel="onAZWheel">
          <button v-for="l in letters" :key="l.letter" type="button" :disabled="!l.active"
            class="h-8 min-w-0 flex-1 rounded-full px-1 text-tiny font-semibold transition-colors duration-150 max-sm:h-11 max-sm:min-w-11"
            :class="activeLetter === l.letter
              ? 'bg-white-10 text-white-90'
              : l.active
                ? 'text-white-45 hover:bg-white-05 hover:text-white-75'
                : 'cursor-default text-white-12'"
            @click="scrollToLetter(l.letter)">{{ l.letter }}</button>
          <!-- 横向滚动容器的 padding/margin 在末尾可能被吞掉，用真实占位元素保证 # 不贴边 -->
          <span class="w-4 shrink-0" aria-hidden="true"></span>
        </div>
      </div>
    </nav>

    <Transition name="fade-up" mode="out-in">
      <div v-if="activeTab" :id="`hb-panel-${activeTab.key}`" :key="activeTab.key"
        role="tabpanel" :aria-labelledby="`hb-tab-${activeTab.key}`" class="pt-8">
        <template v-if="groups.length">
          <section v-for="[letter, entries] in groups" :key="letter" class="mb-8">
            <h2 :id="`hb-letter-${letter}`"
              class="mb-4 scroll-mt-36 border-b border-white-05 pb-2 text-xl font-extrabold tracking-[0.1em] text-white-55">{{ letter }}</h2>

            <!-- 词条百科式排版：只留标题与解释，不用卡片框住每个词条 -->
            <article v-for="e in entries" :key="e.name" class="mb-5 last:mb-0">
              <h3 class="mb-1.5 flex items-baseline gap-2 text-base font-bold leading-[1.4] text-white-85">
                <span v-if="e.emoji" class="inline-flex w-6 shrink-0 items-center justify-center text-sm leading-none" aria-hidden="true">{{ e.emoji }}</span>
                <span v-if="e.color" class="h-2 w-2 self-center rounded-full" :style="{ backgroundColor: e.color }" aria-hidden="true"></span>
                <span>{{ e.name }}</span>
              </h3>
              <p class="max-w-[640px] text-sm leading-[1.85] text-white-40">{{ e.desc }}</p>
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
/* A-Z 快速跳转横向滚动条：小屏可见、可拖动，避免「看不到后面字母也不知道能滚」 */
.hb-scroll-x {
  scrollbar-width: thin;
  scrollbar-color: var(--white-18) transparent;
}
.hb-scroll-x::-webkit-scrollbar {
  height: 6px;
}
.hb-scroll-x::-webkit-scrollbar-track {
  background: transparent;
}
.hb-scroll-x::-webkit-scrollbar-thumb {
  background: var(--white-18);
  border-radius: 9999px;
}
.hb-scroll-x::-webkit-scrollbar-thumb:hover {
  background: var(--white-35);
}
</style>
