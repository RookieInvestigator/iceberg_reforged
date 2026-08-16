<script setup lang="ts">
import { shallowRef, ref, computed, onMounted, provide, watch, onUnmounted } from 'vue'
import OnThisDayModal from '../components/calendar/OnThisDayModal.vue'
import { useRoute } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { bgMode, sortMode, scatterMode } from '../lib/settingsStore'
import raw from '../data/iceberg.json'
import relatedRaw from '../data/appendix/related.csv?raw'
import referencesRaw from '../data/appendix/references.csv?raw'
import { normalizeData, isSafeHttpUrl } from '../lib/data'
import { parseCSV } from '../lib/csv'
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

const buildDate = new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN')

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

// F30：旧 ID → 新 ID 重定向表（分享 hash / 深链 / 收藏旧 id 解析用）
provide(ID_ALIASES_KEY, new Map(Object.entries(data.idAliases || {})))

// 从历史上的今天/?item=xxx 跳转：触发弹窗
const route = useRoute()
// 监听 ?item=xxx 触发词条弹窗（支持从其他地方跳转过来）；定时器在卸载/重复触发时清理
let itemTimer = 0
watch(() => route.query.item, (itemId) => {
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
          <section
            v-for="(tierName, tierIndex) in data.tierOrder"
            :key="tierName"
            class="iceberg-tier relative bg-transparent min-h-[150px] flex flex-col py-10 overflow-visible z-[1] hover:z-[9999]"
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
                  <span class="item-title transition-colors duration-200">{{ item.title }}</span>
                  <span v-for="(e, ei) in item.emojis" :key="ei" class="item-tag text-[0.625em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200">{{ e }}</span>
                </span>
              </div>
            </div>
          </section>
        </template>
        <!-- 非冰山图模式（实验）：全部词条随机散落 -->
        <ScatterField v-else :items="allItemsRaw" />
      </div>

      <FooterSection :buildDate="buildDate" :entryCount="allItems.length" :bulletins="bulletins" />
    </div>

    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />
  </div>
</template>

