<script setup lang="ts">
// 术语表 — 页首标签切换 + A-Z 快速跳转，词条采用百科式排版（不装卡片）
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye } from '@lucide/vue'
import type { IcebergMeta } from '../lib/data'
import { formatUnixDate } from '../lib/data'
import { activeCategories, activeTags, searchQuery } from '../lib/filterStore'
import { HANDBOOK_TABS, parseSections } from '../lib/handbook'
// 术语表只用到分类色 / 标签表 / 生成时间 / 词条总数 —— 走轻量 meta.json（~3.5KB），
// 不导入 iceberg.json（否则会拉下 ~800KB 的词条数据 chunk，而这些内容本页面一条都不显示）
import meta from '../data/meta.json'
import rawMd from '../data/handbook.md?raw'
import { getFirstInitial } from '../lib/pinyin'
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

// 描述里用 ==...== 标记强调：双等号包裹的内容会被高亮，标记本身不显示（可嵌套）。
// 另外「」『』“”‘’《》引号包裹的内容也会自动微微高亮，作为便捷写法。
const QUOTE_OPEN: Record<string, string> = {
  '「': '」', '『': '』', '“': '”', '‘': '’', '《': '》',
}
const QUOTE_CLOSE = new Set(Object.values(QUOTE_OPEN))

interface DescSeg { text: string; em: boolean }

function segmentDesc(text: string): DescSeg[] {
  const segs: DescSeg[] = []
  const stack: string[] = [] // 当前生效的强调定界符（'==' 或引号闭字符）
  let buf = ''
  let em = false
  const flush = () => {
    if (buf) { segs.push({ text: buf, em }); buf = '' }
  }
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    // ==...== 显式强调：标记不进入输出，仅切换高亮状态
    if (two === '==') {
      flush()
      if (stack[stack.length - 1] === '==') stack.pop()
      else stack.push('==')
      em = stack.length > 0
      i += 2
      continue
    }
    const ch = text[i]
    if (QUOTE_OPEN[ch]) {
      flush(); stack.push(QUOTE_OPEN[ch]); em = true; buf += ch; i++
    } else if (QUOTE_CLOSE.has(ch)) {
      buf += ch; flush()
      if (stack[stack.length - 1] === ch) stack.pop()
      em = stack.length > 0; i++
    } else {
      buf += ch; i++
    }
  }
  flush()
  return segs
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
    .replace('{total}', String(data.total))
    .replace('{shown}', String(activeTab.value?.entries.length || 0)))

function selectTab(key: string) {
  activeKey.value = key
  activeLetter.value = ''
  termEls.clear()
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
onMounted(applyDeepLink)
watch(() => route.query, applyDeepLink)

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
      <h1 class="h1-display">{{ t('handbookTitle') }}</h1>
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
            class="h-8 min-w-0 flex-1 rounded-full px-1 text-tiny font-bold transition-colors duration-150 max-sm:h-11 max-sm:min-w-11"
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
              class="mb-4 scroll-mt-36 border-b border-white-05 pb-2 text-xl font-black tracking-[0.1em] text-white-55">{{ letter }}</h2>

            <!-- 词条百科式排版：只留标题与解释，不用卡片框住每个词条 -->
            <article v-for="e in entries" :key="e.name" :ref="bindTermEl(e.name)" class="hb-term mb-5 last:mb-0" :class="{ 'hb-flash': flash === e.name }">
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
              <p class="hb-desc max-w-[640px] text-sm leading-[1.85] text-white-40">
                <span v-for="(seg, si) in segmentDesc(e.desc)" :key="si" :class="seg.em ? 'hb-em' : ''">{{ seg.text }}</span>
              </p>
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
/* 词条描述：保留 md 里的换行（pre-line 折叠多余空格但保留 \n）；==...== 或引号包裹的内容微微高亮 */
.hb-desc {
  white-space: pre-line;
}
.hb-em {
  color: var(--white-72);
  background: rgba(245, 158, 11, 0.12);
  border-radius: 4px;
  padding: 0 0.18em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

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
