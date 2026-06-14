<script setup lang="ts">
import { shallowRef, ref, computed, onMounted, provide, watch } from 'vue'
import OnThisDayModal from '../components/calendar/OnThisDayModal.vue'
import { useRoute } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { bgMode } from '../lib/settingsStore'
import raw from '../data/iceberg.json'
import { normalizeData } from '../lib/data'
import IcebergBg from '../components/layout/IcebergBg.vue'
import FooterSection from '../components/layout/FooterSection.vue'
import HeroSection from '../components/iceberg/HeroSection.vue'
import Header from '../components/iceberg/Header.vue'
import TierNav from '../components/iceberg/TierNav.vue'
import IcebergApp from '../components/iceberg/IcebergApp.vue'

const data = normalizeData(raw)
const allItemsRaw = Object.entries(data.tiers).flatMap(([tierName, items]) =>
  items.map(item => ({ ...item, tier: tierName }))
)
const allItems = shallowRef(allItemsRaw)

// 数据结构拆分：desc 不进响应式，单独存 Map
const renderItems = allItemsRaw.map(i => {
  const { desc, ...light } = i as any
  return { ...light, _hd: !!desc }
})
const renderItemsRef = shallowRef(renderItems)
const descMap = new Map(allItemsRaw.map(i => [i.id, (i as any).desc || '']))

// 全局注入：子组件不需要 JSON.parse props
provide('tierOrder', data.tierOrder)
provide('categoryColors', data.categoryColors)
provide('tagMap', data.tagMap)
provide('defaultColor', data.defaultColor)
provide('renderItems', renderItemsRef)
provide('descMap', descMap)
provide('heroTitles', allItemsRaw.map((i: any) => i.title))

const buildDate = new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN')

// Bulletins
const bulletinModules = import.meta.glob('../data/bulletins/*.md', { query: '?raw', import: 'default', eager: true })
const bulletins = computed(() =>
  Object.entries(bulletinModules).map(([p, raw]) => {
    const m = (raw as string).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
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
const showOnThisDay = ref(false)
provide('openOnThisDay', () => { showOnThisDay.value = true })

// 从历史上的今天/?item=xxx 跳转：触发弹窗
const route = useRoute()
// 监听 ?item=xxx 触发词条弹窗（支持从其他地方跳转过来）
watch(() => route.query.item, (itemId) => {
  if (itemId) {
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('open-item-modal', { detail: itemId }))
    }, 300)
  }
}, { immediate: true })

onMounted(() => {
  const content = document.getElementById('iceberg-content')
  if (!content) return
  try {
    if (sessionStorage.getItem('iceberg_hero_done') === '1') {
      content.classList.add('content-enter')
    } else {
      document.addEventListener('hero-exit', () => content.classList.add('content-enter'), { once: true })
    }
  } catch {}
})
</script>

<template>
  <div id="capture-area" class="w-full min-h-screen relative overflow-x-hidden bg-black">
    <IcebergBg v-if="showBg" />
    <HeroSection />

    <div id="iceberg-content" class="relative z-10 w-full mx-auto flex flex-col pt-20 pb-8 max-sm:pt-10 max-sm:pb-4" style="max-width: var(--max-width)">
      <Header :buildDate="buildDate" :entryCount="allItems.length" :introText="data.introText" />
      <TierNav />
      <IcebergApp />

      <div id="items-container">
        <section
          v-for="(tierName, tierIndex) in data.tierOrder"
          :key="tierName"
          class="iceberg-tier relative bg-transparent min-h-[150px] flex flex-col py-10 overflow-visible z-[1] hover:z-[9999]"
          :data-tier="tierName"
          :style="`--tier-stagger: ${tierIndex}`"
        >
          <div class="relative z-[2] w-full">
            <h2 class="text-center font-black text-[0.85rem] text-white/40 tracking-[0.5em] mb-10 uppercase">{{ tierName }}</h2>
            <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 max-sm:gap-x-1.5 max-sm:gap-y-1 max-sm:mb-3 px-[var(--header-padding-x)]">
              <span
                v-for="item in data.tiers[tierName]"
                :key="item.id"
                v-memo="[item.id, item.categoryColor]"
                class="iceberg-item inline-flex items-center font-bold cursor-crosshair py-0.5 px-1.5 max-sm:text-[1.05rem]"
                :data-id="item.id"
                :data-category="item.category"
                :data-tags="item.tags.join(',')"
                :data-tag-emojis="item.emojis.join(',')"
                :data-has-link="item.link ? '1' : '0'"
                :data-has-desc="item.desc ? '1' : '0'"
                :style="`font-size: 1.15em; color: ${item.categoryColor}; --item-color: ${item.categoryColor}`"
              >
                <span class="item-title transition-colors duration-200">{{ item.title }}</span>
                <span v-for="(e, ei) in item.emojis" :key="ei" class="item-tag text-[0.5em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200">{{ e }}</span>
              </span>
            </div>
          </div>
        </section>
      </div>

      <FooterSection :buildDate="buildDate" :entryCount="allItems.length" :bulletins="bulletins" />
    </div>

    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />
    <OnThisDayModal v-if="showOnThisDay" @close="showOnThisDay = false" />
  </div>
</template>

