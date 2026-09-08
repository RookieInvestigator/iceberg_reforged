<script setup lang="ts">
// IndexNext（/v2，仅 DEV）：主冰山图换代实验 —— v2 全套专用组件
// （V2Header / V2FilterBar / V2Wall / V2TierChapter / V2Interactivity /
// V2EntryCard / V2Sheet / V2Tooltip），v1 文件一律不动。
// 数据 provide / 深链 / 入场 / 背景沿用 IndexView 模式；过滤管线与搜索 Worker 复用 lib 层。
// 通过验收后：用本文件替换 IndexView.vue，并把 V2* 组件转正更名。
import { shallowRef, ref, computed, onMounted, provide, watch, watchEffect, onUnmounted } from 'vue'
import OnThisDayModal from '../../components/calendar/OnThisDayModal.vue'
import { useRoute } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { bgMode, scatterMode, fontSize } from '../../lib/settingsStore'
import raw from '../../data/iceberg.json'
import relatedRaw from '../../data/appendix/related.csv?raw'
import referencesRaw from '../../data/appendix/references.csv?raw'
import { normalizeData, isSafeHttpUrl, formatUnixDate } from '../../lib/data'
import { parseCSV } from '../../lib/csv'
import { useI18n } from '../../lib/useI18n'
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY, TIER_ORDER_KEY, CATEGORY_COLORS_KEY, TAG_MAP_KEY, DEFAULT_COLOR_KEY, RENDER_ITEMS_KEY, DESC_MAP_KEY, HERO_TITLES_KEY, RELATED_MAP_KEY, REFERENCES_MAP_KEY, OPEN_ON_THIS_DAY_KEY, ID_ALIASES_KEY } from '../../lib/injectionKeys'
import { FACET_COUNTS_KEY, type FacetCounts } from '../../lib/iceberg/v2/keys'
import IcebergBg from '../../components/layout/IcebergBg.vue'
import V2Colophon from '../../components/v2/V2Colophon.vue'
// TEMP：hero 页暂时移除
// import HeroSection from '../../components/iceberg/HeroSection.vue'
import V2Header from '../../components/v2/V2Header.vue'
import V2FilterBar from '../../components/v2/V2FilterBar.vue'
import V2Interactivity from '../../components/v2/V2Interactivity.vue'
import FloatingButtons from '../../components/iceberg/FloatingButtons.vue'
import ScatterField from '../../components/iceberg/ScatterField.vue'
import V2Wall from '../../components/v2/V2Wall.vue'

import { useIcebergDataSource } from '../../lib/iceberg/useIcebergDataSource'

// 数据源（normalize + 副表 + 全套 provide，见 useIcebergDataSource；facetCounts 为 v2 专有，留在此处）
const { data, allItems, allItemsRaw } = useIcebergDataSource()

// v2 筛选面计数：分类 / 标签词条数（数据静态，单遍产出，顶栏展示用）
const facetCounts: FacetCounts = (() => {
  const cats: Record<string, number> = {}
  const tags: Record<string, number> = {}
  const nameToEmoji: Record<string, string> = {}
  for (const [emoji, name] of Object.entries(data.tagMap || {})) nameToEmoji[name] = emoji
  for (const it of allItemsRaw) {
    cats[it.category] = (cats[it.category] || 0) + 1
    for (const t of it.tags || []) {
      const e = nameToEmoji[t] || t
      tags[e] = (tags[e] || 0) + 1
    }
  }
  return { cats, tags }
})()
provide(FACET_COUNTS_KEY, facetCounts)

// ═══ v2 安全网：任何用户交互 / 筛选 / 深链 / 弹窗 → V2Wall 全量挂载 ═══
// （observer 常驻方案已因滚动不连贯回退；现用 wallMount 渐进挂载，见 V2Wall）
const wallRef = ref<{ flushWall: () => void } | null>(null)
let entranceDoneTimer = 0
function flushWall() { wallRef.value?.flushWall() }
function onWallFlushSignal() { wallRef.value?.flushWall() }
let wallListenersBound = false
function bindWallListeners() {
  if (wallListenersBound) return
  wallListenersBound = true
  document.addEventListener('pointerdown', onWallFlushSignal, true)
  document.addEventListener('keydown', onWallFlushSignal, true)
  document.addEventListener('open-item-modal', onWallFlushSignal)
}
function unbindWallListeners() {
  if (!wallListenersBound) return
  wallListenersBound = false
  document.removeEventListener('pointerdown', onWallFlushSignal, true)
  document.removeEventListener('keydown', onWallFlushSignal, true)
  document.removeEventListener('open-item-modal', onWallFlushSignal)
}

// 字号设置 → 词条字号 CSS 变量（v1 由 IcebergApp 承担，v2 无侧边栏，收归本视图）
const FONT_SCALE: Record<string, string> = { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' }
const fsVal = useStore(fontSize)
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--item-font-size', FONT_SCALE[fsVal.value] || '1rem')
})

// 顶栏 + 随机入口接线（v1 由 IcebergApp 承担）
const filterBarRef = ref<{ togglePanel: (source?: 'fab' | 'bar') => void } | null>(null)
const interactivityRef = ref<{ showRandom: () => void } | null>(null)
function onRandom() { interactivityRef.value?.showRandom() }
function onToggleFilter() { filterBarRef.value?.togglePanel('fab') }

const buildDate = formatUnixDate(data.generatedAt)

// Bulletins
const bulletinModules = import.meta.glob('../data/bulletins/*.md', { query: '?raw', import: 'default', eager: true })
const bulletins = computed(() =>
  Object.entries(bulletinModules).map(([p, raw]) => {
    const m = (raw as string).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!m) return null
    const fm: Record<string, string> = {}
    for (const line of m[1].split('\n')) {
      const [k, ...v] = line.split(':')
      if (k) fm[k.trim()] = v.join(':').trim()
    }
    return { title: fm.title, date: fm.date, author: fm.author, content: m[2].trim() }
  }).filter(Boolean).sort((a: any, b: any) => (b?.date || '').localeCompare(a?.date || '')) as any[]
)

// 背景模式
const bg = useStore(bgMode)
const showBg = computed(() => bg.value !== 'black')

// 实验功能：非冰山图模式（无层级，随机散落）
const scatter = useStore(scatterMode)
const showOnThisDay = ref(false)
provide(OPEN_ON_THIS_DAY_KEY, () => { showOnThisDay.value = true })

// 声明式过滤：null=全部显示，Set<string>=仅这些ID可见（替代命令式DOM操作）
const filterVisible = shallowRef(null as Set<string> | null)
provide(FILTER_VISIBLE_KEY, filterVisible)
// perf：dim 模式变暗集合（null=无变暗），模板 :class + v-memo 响应式消费
const dimItems = shallowRef(null as Set<string> | null)
provide(DIM_ITEMS_KEY, dimItems)

// 层空/全空提示（声明式，替代原 useFilterPipeline 命令式 createElement 路径；
//   仅 hide 模式可见——dim 模式全部词条仍在 DOM，提示会造成误读）
// 层可见数由过滤管线单遍产出（wallCounts——不再单独扫 1432 词条）
const { t } = useI18n()

// F30：旧 ID → 新 ID 重定向表（分享 hash / 深链 / 收藏旧 id 解析用）
provide(ID_ALIASES_KEY, new Map(Object.entries(data.idAliases || {})))

// 从历史上的今天/?item=xxx 跳转：触发弹窗
const route = useRoute()
// 监听 ?item=xxx 触发词条弹窗（支持从其他地方跳转过来）；定时器在卸载/重复触发时清理
let itemTimer = 0
watch(() => route.query.item, (itemId) => {
  // 只在主冰山图（/）消费 ?item=；/legacy 与 3D 等页面各管各的 query，不能串台
  if (route.path !== '/') return
  if (itemId) {
    clearTimeout(itemTimer)
    itemTimer = window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent('open-item-modal', { detail: itemId }))
    }, 300)
  }
}, { immediate: true })
onUnmounted(() => clearTimeout(itemTimer))

onMounted(() => {
  const content = document.getElementById('iceberg-content')
  if (!content) return
  // TEMP：hero 页暂时移除 —— 不再等待 hero-exit，直接播放入场动画
  content.classList.add('content-enter')
  // （原逻辑，恢复 hero 时还原：）
  // try {
  //   if (sessionStorage.getItem('iceberg_hero_done') === '1') {
  //     content.classList.add('content-enter')
  //   } else {
  //     document.addEventListener('hero-exit', () => content.classList.add('content-enter'), { once: true })
  //   }
  // } catch {}

  // 入场动画全部结束（最晚 ~0.3 + 7×0.08 + 0.5 ≈ 1.36s）后移除 content-enter：
  // 释放 fill-mode:both 动画对 .iceberg-tier 的变换层持有（合成层+估算盒会裁剪 tooltip，
  // 详见 index.css content-enter 注释；曾用 will-change 提升合成层 → 引入裁剪回归）
  entranceDoneTimer = window.setTimeout(() => content.classList.remove('content-enter'), 1500)

  // 视口窗口挂载：IO 接管前首屏 2 层已就绪（useTierWindow 初始值）；深链/弹窗定向需要完整墙 → 直接全量
  bindWallListeners()
  if (route.query.item || window.location.hash) {
    flushWall()
  }
  document.dispatchEvent(new CustomEvent('vue-ready'))
})
onUnmounted(() => {
  unbindWallListeners()
  window.clearTimeout(entranceDoneTimer)
  clearTimeout(itemTimer)
})
</script>

<template>
  <div id="capture-area" class="w-full min-h-screen relative overflow-x-clip bg-black">
    <IcebergBg v-if="showBg" />
    <!-- TEMP：hero 页暂时移除 -->
    <!-- <HeroSection /> -->

    <div id="iceberg-content" class="relative z-10 w-full mx-auto flex flex-col pt-20 pb-8 max-sm:pt-10 max-sm:pb-4" style="max-width: var(--max-width)">
      <V2Header :buildDate="buildDate" :entryCount="allItems.length" :introText="data.introText" />
      <V2FilterBar ref="filterBarRef" />

      <!-- F5：跳过词条墙（键盘用户免 1400+ 次 Tab；v1 同状，已记为已知限制） -->
      <a href="#v2-colophon" class="v2-skip">{{ t('skipWall') }}</a>
      <V2Wall v-if="!scatter" :data="data" ref="wallRef" />
      <ScatterField v-else :items="allItemsRaw" />

      <V2Interactivity ref="interactivityRef" />
      <!-- 漏斗按钮在 v2 隐藏：筛选入口已收进 V2FilterBar，避免重复 -->
      <FloatingButtons :sidebarOpen="false" hideFilter @random="onRandom" @toggleSidebar="onToggleFilter" />

      <V2Colophon :buildDate="buildDate" :entryCount="allItems.length" :tierCount="data.tierOrder.length" :catCount="Object.keys(data.categoryColors || {}).length" :bulletins="bulletins" />
    </div>

    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />
  </div>
</template>

