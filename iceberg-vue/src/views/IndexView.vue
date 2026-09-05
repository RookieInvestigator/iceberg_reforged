<script setup lang="ts">
import { shallowRef, ref, computed, onMounted, provide, watch, onUnmounted } from 'vue'
import OnThisDayModal from '../components/calendar/OnThisDayModal.vue'
import { useRoute } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { bgMode, sortMode, scatterMode } from '../lib/settingsStore'
import raw from '../data/iceberg.json'
import relatedRaw from '../data/appendix/related.csv?raw'
import referencesRaw from '../data/appendix/references.csv?raw'
import { normalizeData, isSafeHttpUrl, formatUnixDate } from '../lib/data'
import { parseCSV } from '../lib/csv'
import { useI18n } from '../lib/useI18n'
import { initialMountCount, nextMountCount } from '../lib/iceberg/wallMount'
import { tierVisibleCounts } from '../lib/iceberg/wallCounts'
import { docOrder } from '../lib/iceberg/wallState'
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY, TIER_ORDER_KEY, CATEGORY_COLORS_KEY, TAG_MAP_KEY, DEFAULT_COLOR_KEY, RENDER_ITEMS_KEY, DESC_MAP_KEY, HERO_TITLES_KEY, RELATED_MAP_KEY, REFERENCES_MAP_KEY, OPEN_ON_THIS_DAY_KEY, ID_ALIASES_KEY } from '../lib/injectionKeys'
import IcebergBg from '../components/layout/IcebergBg.vue'
import FooterSection from '../components/layout/FooterSection.vue'
// TEMP：hero 页暂时移除
// import HeroSection from '../components/iceberg/HeroSection.vue'
import Header from '../components/iceberg/Header.vue'
import TierNav from '../components/iceberg/TierNav.vue'
import IcebergApp from '../components/iceberg/IcebergApp.vue'
import ScatterField from '../components/iceberg/ScatterField.vue'

const data = normalizeData(raw)
const allItemsRaw = Object.entries(data.tiers).flatMap(([tierName, items]) =>
  items.map(item => ({ ...item, tier: tierName }))
)
const allItems = shallowRef(allItemsRaw)

// 全量数据下发（含 desc）；descMap 供 ItemInteractivity 按 id 快速取回
const renderItemsRef = shallowRef(allItemsRaw)
const descMap = new Map(allItemsRaw.map(i => [i.id, (i as any).desc || '']))

// 声明式排序：按 sortMode 生成每层有序数组（替代命令式 DOM 重排，避免被 keyed diff 纠正回模板序）
const srt = useStore(sortMode)
const tierItems = computed(() => {
  const out: Record<string, any[]> = {}
  for (const [tn, items] of Object.entries(data.tiers as Record<string, any[]>)) {
    let arr: any[] = items
    const m = srt.value
    if (m === 'title-asc' || m === 'title-desc') {
      arr = [...items].sort((a: any, b: any) =>
        m === 'title-asc' ? a.title.localeCompare(b.title, 'zh-CN') : b.title.localeCompare(a.title, 'zh-CN'))
    } else if (m === 'category') {
      arr = [...items].sort((a: any, b: any) => a.category.localeCompare(b.category, 'zh-CN'))
    }
    out[tn] = arr
  }
  return out
})

// 副表加载：关联词条 (source_id → target_id[], 含反向索引)
const relatedMap = new Map<string, string[]>()
for (const row of parseCSV(relatedRaw)) {
  const src = (row.source_id || '').trim()
  const tgt = (row.target_id || '').trim()
  if (!src || !tgt) continue
  if (!relatedMap.has(src)) relatedMap.set(src, [])
  relatedMap.get(src)!.push(tgt)
  // 反向：target 也获得 source
  if (!relatedMap.has(tgt)) relatedMap.set(tgt, [])
  relatedMap.get(tgt)!.push(src)
}

// 副表加载：参考链接 (source_id → [{label, url}])
const referencesMap = new Map<string, { label: string; url: string }[]>()
for (const row of parseCSV(referencesRaw)) {
  const src = (row.source_id || '').trim()
  const label = (row.label || '').trim()
  const url = (row.url || '').trim()
  if (!src || !url) continue
  if (!isSafeHttpUrl(url)) continue // F34：副表 URL 同样过 schema 校验
  if (!referencesMap.has(src)) referencesMap.set(src, [])
  referencesMap.get(src)!.push({ label: label || url, url })
}

// 全局注入：子组件不需要 JSON.parse props
provide(TIER_ORDER_KEY, data.tierOrder)
provide(CATEGORY_COLORS_KEY, data.categoryColors)
provide(TAG_MAP_KEY, data.tagMap)
provide(DEFAULT_COLOR_KEY, data.defaultColor)
provide(RENDER_ITEMS_KEY, renderItemsRef)
provide(DESC_MAP_KEY, descMap)
provide(HERO_TITLES_KEY, allItemsRaw.map(i => i.title))
provide(RELATED_MAP_KEY, relatedMap)
provide(REFERENCES_MAP_KEY, referencesMap)

// 词条墙 DOM 文档序（tierOrder × 层内声明式排序）→ wallState.docOrder（单一事实源）：
// 导航索引/随机池均由模块消费，与分片挂载兼容（不依赖 DOM 补齐状态）；sortMode 变化才重建
watch(tierItems, (ti) => {
  const out: string[] = []
  for (const tn of data.tierOrder) {
    const arr = ti[tn]
    if (arr) for (const it of arr) out.push((it as any).id)
  }
  docOrder.value = out
}, { immediate: true })

// ═══ 生产性能：词条墙分片挂载（首屏 2 层 + 逐帧补齐，见 lib/iceberg/wallMount.ts）═══
// 首屏长任务从「一次性创建 1432 节点」拆成 ~6 帧小任务；视口外 paint 本就被
// content-visibility 跳过，补齐阶段只增 DOM/布局。安全网：任何用户交互/筛选/深链
// → 立即 flush（pointerdown 先于 click，Vue 微任务刷新保证事件处理时墙已完整）。
// prerender 为手工快照（src/prerender.ts 不渲染本组件），无 SSR 分支。
const totalTiers = data.tierOrder.length
const mountedTiers = ref(initialMountCount(totalTiers, true))
let mountRaf = 0
let entranceDoneTimer = 0
function flushWall() {
  if (mountedTiers.value >= totalTiers) return
  mountedTiers.value = totalTiers
  if (mountRaf) { cancelAnimationFrame(mountRaf); mountRaf = 0 }
  unbindWallListeners()
}
function tickMount() {
  mountRaf = 0
  mountedTiers.value = nextMountCount(mountedTiers.value, totalTiers)
  if (mountedTiers.value < totalTiers) mountRaf = requestAnimationFrame(tickMount)
}
function onWallFlushSignal() { flushWall() }
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
const dimSet = computed(() => dimItems.value)

// 层空/全空提示（声明式，替代原 useFilterPipeline 命令式 createElement 路径；
//   仅 hide 模式可见——dim 模式全部词条仍在 DOM，提示会造成误读）
// 层可见数由过滤管线单遍产出（wallCounts——不再单独扫 1420 词条）
const { t } = useI18n()
const hasNoResults = computed(() => filterVisible.value !== null && filterVisible.value.size === 0)

// F30：旧 ID → 新 ID 重定向表（分享 hash / 深链 / 收藏旧 id 解析用）
provide(ID_ALIASES_KEY, new Map(Object.entries(data.idAliases || {})))

// 从历史上的今天/?item=xxx 跳转：触发弹窗
const route = useRoute()
// 监听 ?item=xxx 触发词条弹窗（支持从其他地方跳转过来）；定时器在卸载/重复触发时清理
let itemTimer = 0
watch(() => route.query.item, (itemId) => {
  // 只在冰山图主页消费 ?item=；3D 等页面也会同步该 query，不能在这里弹主站词条弹窗
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

  // 词条墙分片挂载：深链/弹窗定向需要完整墙 → 直接全量；否则逐帧补齐
  bindWallListeners()
  if (route.query.item || window.location.hash) {
    flushWall()
  } else if (mountedTiers.value < totalTiers) {
    mountRaf = requestAnimationFrame(tickMount)
  }
})
onUnmounted(() => {
  if (mountRaf) cancelAnimationFrame(mountRaf)
  unbindWallListeners()
  window.clearTimeout(entranceDoneTimer)
  clearTimeout(itemTimer)
})
</script>

<template>
  <div id="capture-area" class="w-full min-h-screen relative overflow-x-hidden bg-black">
    <IcebergBg v-if="showBg" />
    <!-- TEMP：hero 页暂时移除 -->
    <!-- <HeroSection /> -->

    <div id="iceberg-content" class="relative z-10 w-full mx-auto flex flex-col pt-20 pb-8 max-sm:pt-10 max-sm:pb-4" style="max-width: var(--max-width)">
      <Header :buildDate="buildDate" :entryCount="allItems.length" :introText="data.introText" />
      <TierNav v-if="!scatter" />
      <IcebergApp />

      <div id="items-container">
        <template v-if="!scatter">
          <!-- 全空（hide 模式 0 命中）：整体提示 + 隐藏层级（等价原命令式路径语义） -->
          <div v-if="hasNoResults" id="items-empty" class="text-center text-white/20 text-lg py-40 italic">{{ t('noResults') }}</div>
          <template v-else>
            <!-- 分片挂载：首屏只出前 mountedTiers 层，其余 rAF 逐帧补齐（flush 信号见 script） -->
            <section
              v-for="(tierName, tierIndex) in data.tierOrder.slice(0, mountedTiers)"
              :key="tierName"
              class="iceberg-tier relative bg-transparent min-h-[150px] flex flex-col py-10 overflow-visible z-[1]"
              :data-tier="tierName"
              :style="`--tier-stagger: ${tierIndex}`"
            >
              <div class="relative z-[2] w-full">
                <h2 class="text-center font-black text-[length:var(--font-sm)] text-white/40 tracking-[0.12em] mb-10 uppercase">{{ tierName }}</h2>
                <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 max-sm:gap-x-1.5 max-sm:gap-y-[10px] max-sm:mb-3 px-[var(--header-padding-x)]">
                  <span
                    v-for="item in tierItems[tierName]"
                    :key="item.id"
                    v-show="!filterVisible || filterVisible.has(item.id)"
                    v-memo="[item.id, dimSet?.has(item.id), filterVisible ? filterVisible.has(item.id) : true]"
                    tabindex="0"
                    role="button"
                    class="iceberg-item inline-flex items-center font-bold cursor-crosshair py-0.5 px-1.5 max-sm:text-[1.05rem]"
                    :class="{ dimmed: !!dimSet?.has(item.id) }"
                    :data-id="item.id"
                    :data-category="item.category"
                    :style="`font-size: 1.15em; color: ${item.categoryColor}; --item-color: ${item.categoryColor}`"
                  >
                    <span class="item-title transition-colors duration-200" :data-text="item.title">{{ item.title }}</span>
                    <span v-for="(e, ei) in item.emojis" :key="ei" class="item-tag text-[0.625em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200">{{ e }}</span>
                  </span>
                </div>
                <!-- 层空（hide 模式本层 0 命中，全空时由上方 items-empty 统一提示；管线单遍产出的层可见数） -->
                <div v-if="tierVisibleCounts && (tierVisibleCounts.get(tierName) || 0) === 0" class="tier-empty text-center text-white/15 text-sm py-8 italic">{{ t('tierEmpty') }}</div>
              </div>
            </section>
          </template>
        </template>
        <!-- 非冰山图模式（实验）：全部词条随机散落 -->
        <ScatterField v-else :items="allItemsRaw" />
      </div>

      <FooterSection :buildDate="buildDate" :entryCount="allItems.length" :bulletins="bulletins" />
    </div>

    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />
  </div>
</template>

