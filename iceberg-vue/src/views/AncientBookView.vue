<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import raw from '../data/iceberg.json'
import { parseWenyan, toChineseNum } from '../lib/ancient-book/engine'
import { calcLayout } from '../lib/ancient-book/layout'
import SpreadView from '../lib/ancient-book/SpreadView.vue'
import { useI18n } from '../lib/useI18n'
import type { Token, PlacedCell } from '../lib/ancient-book/types'

const { t } = useI18n()

interface ItemExt { id: string; title: string; category: string; tags: string[]; desc: string; link: string; tier: string }
const tierOrder: string[] = raw.tierOrder || []
const allRaw: ItemExt[] = []
for (const tn of tierOrder) {
  for (const it of (raw.tiers as any)[tn] || []) {
    allRaw.push({ id: it.id, title: it.title, category: it.category, tags: it.tags || [], desc: it.desc || '', link: it.link || '', tier: tn })
  }
}

function toCN(n: number): string {
  const d = '零一二三四五六七八九'
  if (n < 10) return d[n]
  if (n === 10) return '十'
  if (n < 20) return '十' + (n % 10 ? d[n % 10] : '')
  const t = Math.floor(n / 10), o = n % 10
  return d[t] + '十' + (o ? d[o] : '')
}

const VOL_NAMES = ['廣知', '凶宅', '史微', '物異', '禮殊', '諾皋記', '齊諧', '凶志', '陰符', '廣格物', '讖緯', '局詐', '器奇', '鏡聽', '天咫', '藝文']
const catKeys = Object.keys(raw.categoryColors || {})
// 按 categoryColors 的顺序映射卷名，不依赖具体 category 名字
function volName(cat: string): string {
  const i = catKeys.indexOf(cat)
  return i >= 0 && i < VOL_NAMES.length ? VOL_NAMES[i] : cat
}

interface Meta { id: string; title: string; cat: string; color: string; tags: string[]; desc: string; link: string; tier: string }

function generateData(mode: 'category' | 'tier') {
  let code = ''
  const charItem: number[] = []
  const meta: Meta[] = []

  function pushAll(s: string, ii: number) { for (const c of s) { charItem.push(ii); code += c } }

  // Book title page
  pushAll('⚑【中文兔子洞冰山圖】', -1)
  pushAll('\f', -1)

  // Preface
  if (raw.introText) { pushAll('【序】\n' + raw.introText + '\n\n', -1) }
  pushAll('\f', -1)

  // 單次遍歷分組，避免 O(N×M) 的重複 filter
  const byCat: Record<string, ItemExt[]> = {};
  const byTier: Record<string, ItemExt[]> = {};
  for (const it of allRaw) {
    if (!byCat[it.category]) byCat[it.category] = [];
    byCat[it.category].push(it);
    if (!byTier[it.tier]) byTier[it.tier] = [];
    byTier[it.tier].push(it);
  }

  if (mode === 'category') {
    let volNum = 0
    for (const cat of Object.keys(raw.categoryColors || {})) {
      const items = (byCat[cat] || []).sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
      if (items.length === 0) continue
      volNum++
      const cn = volName(cat)
      pushAll('⚐【' + cn + toCN(volNum) + '】', -1)
      pushAll('\f', -1)
      for (const it of items) {
        const mi = meta.length
        meta.push({ id: it.id, title: it.title, cat: it.category, color: (raw as any).categoryColors?.[it.category] || (raw as any).defaultColor || '#FFFFFF', tags: it.tags, desc: it.desc, link: it.link, tier: it.tier })
        pushAll('【' + it.title + '】\n', mi)
        const ts = (it.tags || []).length > 0 ? it.tags.join('　') : ''
        if (ts) pushAll('（' + ts + '）', mi)
        pushAll((it.desc || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), mi)
        pushAll('\n\n', mi)
      }
    }
  } else {
    const tierNames = ['甲志', '乙志', '丙志', '丁志', '戊志', '己志', '庚志', '辛志']
    let volNum = 0
    for (const tn of tierOrder) {
      const items = (byTier[tn] || []).sort((a, b) => Object.keys(raw.categoryColors || {}).indexOf(a.category) - Object.keys(raw.categoryColors || {}).indexOf(b.category))
      if (items.length === 0) continue
      const tName = volNum < tierNames.length ? tierNames[volNum] : '極'
      volNum++
      pushAll('⚐【' + tName + '】', -1)
      pushAll('\f', -1)
      for (const it of items) {
        const catColor = (raw as any).categoryColors?.[it.category] || (raw as any).defaultColor || '#FFFFFF'
        const mi = meta.length
        meta.push({ id: it.id, title: it.title, cat: it.category, color: catColor, tags: it.tags, desc: it.desc, link: it.link, tier: it.tier })
        pushAll('【' + it.title + '】\n', mi)
        const ts = (it.tags || []).length > 0 ? it.tags.join('　') : ''
        if (ts) pushAll('（' + ts + '）', mi)
        pushAll((it.desc || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), mi)
        pushAll('\n\n', mi)
      }
    }
  }

  return { code, charItem, meta }
}

const catData = generateData('category')
const tierData = generateData('tier')
const baseUrl = import.meta.env.BASE_URL

// ── 声明式状态（F24：ref 驱动渲染，替代 innerHTML / getElementById）──
const currentMode = ref<'category' | 'tier'>('category')
const cur = ref(0)
const MAX = ref(0)
const COLS = ref(10)
const spreads = ref<PlacedCell[][][]>([])
const volNames = ref<string[]>([])
const cssVars = ref<Record<string, string>>({})
const overlayOpen = ref(false)
const overlayItem = ref<Meta | null>(null)

let tokens: Token[] = []
let activeMeta: Meta[] = []
let roTimer = 0
let _onKey: ((e: KeyboardEvent) => void) | null = null
let _ro: ResizeObserver | null = null

const safeColor = computed(() => {
  const c = overlayItem.value?.color || ''
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#FFFFFF'
})
const tierLabel = computed(() => {
  const t = overlayItem.value?.tier || ''
  return t.replace('Tier ', '層')
})

function updateModeData() {
  const modeData = currentMode.value === 'category' ? catData : tierData
  tokens = parseWenyan(modeData.code, modeData.charItem)
  activeMeta = modeData.meta
}

function updateVolNames() {
  const vn: string[] = []
  for (let s = 0; s < spreads.value.length; s++) {
    vn[s] = ''
    for (let p = 0; p < 2; p++) {
      const pg = spreads.value[s][p] || []
      let has = false
      for (const c of pg) { if (c.c === '⚐') { has = true; break } }
      if (has) {
        let name = ''
        for (const c of pg) { if (c.hw && c.c !== '⚐') name += c.c + (c.pn || '') }
        if (name) { vn[s] = name; break }
      }
    }
  }
  let lastName = ''
  for (let s = 0; s < spreads.value.length; s++) {
    if (vn[s]) lastName = vn[s]
    else vn[s] = lastName
  }
  volNames.value = vn
}

// 翻页方向（右起阅读：下一页向左移入，上一页向右移入）——驱动 Transition name
const pageDir = ref<'next' | 'prev'>('next')
function show(i: number) {
  if (i < 0 || i > MAX.value) return
  cur.value = i
}
function prev() {
  if (cur.value <= 0) return
  pageDir.value = 'prev'
  show(cur.value - 1)
}
function next() {
  if (cur.value >= MAX.value) return
  pageDir.value = 'next'
  show(cur.value + 1)
}

function toggleMode() {
  currentMode.value = currentMode.value === 'category' ? 'tier' : 'category'
  updateModeData()
  const st = calcLayout(tokens, 0)
  COLS.value = st.COLS
  spreads.value = st.spreads
  MAX.value = st.MAX
  cssVars.value = st.cssVars
  pageDir.value = 'next'
  cur.value = 0
  updateVolNames()
}

function openOverlay(ii: number) {
  if (isNaN(ii) || !activeMeta[ii]) return
  overlayItem.value = activeMeta[ii]
  overlayOpen.value = true
}

// 初始布局：观察 .wr 首次尺寸后计算（与旧实现一致的延迟时机）
onMounted(() => {
  updateModeData()

  const wrEl = document.querySelector('.wr')
  if (!wrEl) return
  let initialDone = false
  const ro = new ResizeObserver((entries) => {
    window.clearTimeout(roTimer)
    const e = entries[0]
    const w = e ? e.contentRect.width : 0
    const h = e ? e.contentRect.height : 0
    if (w > 0 && h > 0 && !initialDone) {
      initialDone = true
      roTimer = window.setTimeout(() => {
        const st = calcLayout(tokens, cur.value)
        COLS.value = st.COLS
        spreads.value = st.spreads
        MAX.value = st.MAX
        cssVars.value = st.cssVars
        cur.value = st.cur
        updateVolNames()
      }, 150)
    }
  })
  _ro = ro
  ro.observe(wrEl)

  function onKey(e: KeyboardEvent) {
    // 中文古籍右起翻页：左键下一页，右键上一页（有意行为，勿改）
    if (e.key === 'ArrowLeft') { e.preventDefault(); next() }
    if (e.key === 'ArrowRight') { e.preventDefault(); prev() }
    if (e.key === 'Escape') overlayOpen.value = false
  }
  _onKey = onKey
  document.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.clearTimeout(roTimer)
  if (_onKey) document.removeEventListener('keydown', _onKey)
  if (_ro) _ro.disconnect()
})
</script>

<template>
  <div id="root">
    <div class="wr" :style="cssVars">
      <!-- 纸张噪声滤镜 -->
      <svg class="nz">
        <filter id="pf">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
          <!-- 对比增强：压低中间灰度、突出高亮纤维絮状（替代低 alpha 均匀灰） -->
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.015 0.05 0.11" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#pf)" />
      </svg>

      <!-- 当前展页（翻页过渡：方向感知的淡入位移） -->
      <div id="sc" class="sc">
        <Transition :name="'page-' + pageDir" mode="out-in">
          <SpreadView
            v-if="spreads[cur]"
            :key="cur"
            :spread="spreads[cur]"
            :cols="COLS"
            :vol-name="volNames[cur]"
            :si="cur"
            @open-item="openOverlay"
          />
        </Transition>
      </div>

      <!-- 导航 -->
      <nav class="nv">
        <div class="nv-in">
          <a :href="baseUrl" class="bk">&larr; {{ t('back') }}</a>
          <i class="nd"></i>
          <button @click="toggleMode">{{ currentMode === 'category' ? t('ancientModeCategory') : t('ancientModeTier') }}</button>
          <i class="nd"></i>
          <button @click="next" :disabled="cur >= MAX">{{ t('ancientNextPage') }}</button>
          <i class="nd"></i>
          <span id="ni">{{ t('ancientSpread').replace('{n}', toChineseNum(cur + 1)) }}</span>
          <i class="nd"></i>
          <button @click="prev" :disabled="cur <= 0">{{ t('ancientPrevPage') }}</button>
        </div>
      </nav>

      <!-- 词条详情弹层 -->
      <div class="ov" :class="{ s: overlayOpen }" @click.self="overlayOpen = false">
        <div class="dp">
          <button class="dc" @click="overlayOpen = false" :aria-label="t('close')">&times;</button>
          <h2>{{ overlayItem?.title }}</h2>
          <p class="dm">
            <span :style="{ color: safeColor }">{{ overlayItem?.cat }}</span>
            <template v-if="overlayItem?.tier"> · {{ tierLabel }}</template>
          </p>
          <p class="dd" :style="{ textAlign: overlayItem?.desc ? 'justify' : 'center' }">
            {{ overlayItem?.desc || t('ancientNoDesc') }}
          </p>
          <p class="dtg">{{ overlayItem?.tags.join(' ❖ ') }}</p>
          <a
            v-show="overlayItem?.link"
            class="dl"
            :href="overlayItem?.link"
            target="_blank"
            rel="noopener"
          >{{ t('ancientVisitLink') }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@import '../styles/ancient-book.css';
</style>
