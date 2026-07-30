<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import raw from '../data/iceberg.json'
import { parseWenyan, toChineseNum, layoutPages } from '../lib/ancient-book/engine'
import { spreadHTML } from '../lib/ancient-book/render'
import { calcLayout } from '../lib/ancient-book/layout'

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

let COLS = 10, ROWS = 22, MAX = 0, cur = 0
let tokens: any[] = []
let spreads: any[] = []
let currentMode: 'category' | 'tier' = 'category'
let globalData: any = null
let activeMeta: any[] = []
let volNames: string[] = []
let roTimer = 0
let _onKey: ((e: KeyboardEvent) => void) | null = null
let _ro: ResizeObserver | null = null

function updateModeData() {
  const modeData = currentMode === 'category' ? catData : tierData
  tokens = parseWenyan(modeData.code, modeData.charItem)
  activeMeta = modeData.meta
}

function updateVolNames() {
  volNames = []
  for (let s = 0; s < spreads.length; s++) {
    volNames[s] = ''
    for (let p = 0; p < 2; p++) {
      const pg = spreads[s][p] || []
      let has = false
      for (const c of pg) { if (c.c === '⚐') { has = true; break } }
      if (has) {
        let name = ''
        for (const c of pg) { if (c.hw && c.c !== '⚐') name += c.c + (c.pn || '') }
        if (name) { volNames[s] = name; break }
      }
    }
  }
  let lastName = ''
  for (let s = 0; s < spreads.length; s++) {
    if (volNames[s]) lastName = volNames[s]
    else volNames[s] = lastName
  }
}

function show(i: number) {
  if (i < 0 || i > MAX) return
  const scEl = document.getElementById('sc')
  if (!scEl) return
  scEl.innerHTML = spreadHTML(i, spreads, COLS, volNames[i] || '')
  const prevBtn = document.getElementById('bp') as HTMLButtonElement
  const nextBtn = document.getElementById('np') as HTMLButtonElement
  const navInfo = document.getElementById('ni')
  if (prevBtn) prevBtn.disabled = i === 0
  if (nextBtn) nextBtn.disabled = i >= MAX
  if (navInfo) navInfo.textContent = '第 ' + toChineseNum(i + 1) + ' 展'
  cur = i
}

function boot() {
  const root = document.getElementById('root')
  if (!root) return
  globalData = { catData, tierData }

  root.innerHTML =
    '<div class="wr" id="wr"><svg class="nz"><filter id="pf"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.04 0"/></filter><rect width="100%" height="100%" filter="url(#pf)"/></svg><div id="sc"></div>' +
    '<nav class="nv"><div class="nv-in">' +
      '<a href="' + import.meta.env.BASE_URL + '" class="bk">&larr; 返回</a><i class="nd"></i><button id="tm">分卷：類別</button>' +
      '<i class="nd"></i>' +
      '<button id="np">下页</button>' +
      '<i class="nd"></i><span id="ni">第 一 展</span><i class="nd"></i>' +
      '<button id="bp" disabled>上页</button>' +
    '</div></nav>' +
    '<div class="ov" id="ov"><div class="dp"><button class="dc" id="dc">&times;</button><h2 id="dt"></h2><p class="dm" id="dm"></p><p class="dd" id="dd"></p><p class="dtg" id="dg"></p><a class="dl" id="dl" href="#" target="_blank" rel="noopener" hidden>訪問詞條鏈接 →</a></div></div></div>'

  updateModeData()

  let initialDone = false
  const wr = document.getElementById('wr')!
  const ro = new ResizeObserver((entries) => {
    clearTimeout(roTimer)
    const e = entries[0]
    const w = e ? e.contentRect.width : 0
    const h = e ? e.contentRect.height : 0
    if (w > 0 && h > 0 && !initialDone) {
      initialDone = true
      roTimer = setTimeout(() => {
        const st = calcLayout(tokens, cur)
        COLS = st.COLS; ROWS = st.ROWS; spreads = st.spreads; MAX = st.MAX
        updateVolNames(); show(st.cur)
      }, 150)
    }
  })
  _ro = ro
  ro.observe(wr)

  document.getElementById('bp')!.onclick = () => { if (cur > 0) show(cur - 1) }
  document.getElementById('np')!.onclick = () => { if (cur < MAX) show(cur + 1) }
  document.getElementById('tm')!.onclick = () => {
    currentMode = currentMode === 'category' ? 'tier' : 'category'
    updateModeData()
    tokens = parseWenyan(currentMode === 'category' ? catData.code : tierData.code, currentMode === 'category' ? catData.charItem : tierData.charItem)
    const st3 = calcLayout(tokens, 0)
    COLS = st3.COLS; ROWS = st3.ROWS; spreads = st3.spreads; MAX = st3.MAX
    cur = 0; updateVolNames(); show(0)
    const btn = document.getElementById('tm'); if (btn) btn.textContent = currentMode === 'category' ? '分卷：類別' : '分卷：層級'
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (cur < MAX) show(cur + 1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (cur > 0) show(cur - 1) }
    if (e.key === 'Escape') document.getElementById('ov')!.classList.remove('s')
  }
  _onKey = onKey
  document.addEventListener('keydown', onKey)

  const overlay = document.getElementById('ov')!
  document.getElementById('wr')!.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest('.c.clk') as HTMLElement | null
    if (!c) return
    const ii = parseInt(c.dataset.ii!)
    if (isNaN(ii) || !activeMeta[ii]) return
    const it = activeMeta[ii]
    document.getElementById('dt')!.textContent = it.title
    document.getElementById('dm')!.innerHTML = '<span style="color:' + it.color + '">' + it.cat + '</span>' + (it.tier ? ' · ' + it.tier.replace('Tier ', '層') : '')
    const de = document.getElementById('dd')!
    de.textContent = it.desc || '（暫無描述）'
    de.style.textAlign = it.desc ? 'justify' : 'center'
    document.getElementById('dg')!.textContent = it.tags.length ? it.tags.join(' ❖ ') : ''
    const dl = document.getElementById('dl') as HTMLAnchorElement
    if (it.link) { dl.href = it.link; dl.hidden = false } else { dl.hidden = true }
    overlay.classList.add('s')
  })
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('s') })
  document.getElementById('dc')!.addEventListener('click', () => { overlay.classList.remove('s') })
}

onMounted(() => { boot() })
onUnmounted(() => {
  clearTimeout(roTimer)
  if (_onKey) document.removeEventListener('keydown', _onKey)
  if (_ro) _ro.disconnect()
})
</script>

<template>
  <div id="root"></div>
</template>

<style>
@import '../styles/ancient-book.css';
</style>
