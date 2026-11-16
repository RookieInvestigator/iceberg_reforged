<script setup lang="ts">
/**
 * 古籍模式 v2 · 主视图
 *
 * 与 v1 的差别（算法层）：
 * - 夹注分栏：右列到一半切左列，一格 4 小字
 * - 句读：只有「显示 / 不显示」两种
 * - 版心：固定的黑口 + 象鼻 + 鱼尾（作者自绘 SVG），不做配置项
 * - 版面参数集中在 layout.ts，不散落在 CSS
 *
 * 算法来源与许可见 lib/ancient-book-v2/NOTICE.md。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import { useDebounceFn, useEventListener, useResizeObserver } from '@vueuse/core'
import { lockOverlay } from '../lib/overlayLock'
import { ArrowLeft, ChevronLeft, ChevronRight, CornerDownLeft, List as ListIcon, Search, Settings } from '@lucide/vue'
import raw from '../data/iceberg.json'
import metaJson from '../data/meta.json'
import { parseText, toChineseNum, numToZh, pageNumbers, layoutMarginal } from '../lib/ancient-book-v2/engine'
import { calcLayout, defaultLayoutConfig, FONT_FACES, FONT_LABELS, FALLBACK_FACE, FALLBACK_LABEL } from '../lib/ancient-book-v2/layout'
import type { FontFamily } from '../lib/ancient-book-v2/types'
// 四款古籍字体只在这一页引入：走本路由 chunk，别处不会下载这 4 个字库（≈5MB）
import '../styles/fonts-guji.css'
import { inkColor } from '../lib/ancient-book-v2/render'
import { typographyPrefs, updatePrefs } from '../lib/ancient-book-v2/prefs'
import { resolveSwipe } from '../lib/iceberg/v2/useSwipeNav'
import { loadAppendix } from '../lib/iceberg/appendix'
import type { ExtraRecord } from '../lib/iceberg/appendix'
import SpreadView from '../lib/ancient-book-v2/SpreadView.vue'
import SettingsPanel from '../lib/ancient-book-v2/SettingsPanel.vue'
import { useI18n } from '../lib/useI18n'
import { toPlainText } from '../lib/richText'
import { normalizeData } from '../lib/data'
import type { Token, PlacedCell, EntryMeta, MarginalChar } from '../lib/ancient-book-v2/types'

const { t } = useI18n()

// ── 文本规范化：走 normalizeData 的标点规则（引号/省略号/破折号/间隔号） ──
const normalized = normalizeData(raw)
const normDesc = new Map<string, string>()
const normTitle = new Map<string, string>()
for (const items of Object.values(normalized.tiers)) {
  for (const it of items) {
    normDesc.set(it.id, it.desc || '')
    normTitle.set(it.id, it.title || '')
  }
}

function plainDesc(id: string, rawDesc?: string): string {
  const src = normDesc.get(id) ?? (rawDesc || '')
  return toPlainText(src.replace(/<[^>]*>/g, ''))
}
function plainTitle(id: string, rawTitle?: string): string {
  return normTitle.get(id) ?? (rawTitle || '')
}

interface ItemExt {
  id: string
  title: string
  category: string
  tags: string[]
  desc: string
  link: string
  tier: string
  /** 最近修订时间（Unix 秒），「新訂」眉批用 */
  modifiedAt?: number
}

const tierOrder: string[] = raw.tierOrder || []
const allRaw: ItemExt[] = []
for (const tn of tierOrder) {
  const list = (raw.tiers as unknown as Record<string, Array<Omit<ItemExt, 'tier'>>>)[tn] || []
  for (const it of list) {
    allRaw.push({
      id: it.id, title: it.title, category: it.category,
      tags: it.tags || [], desc: it.desc || '', link: it.link || '', tier: tn,
      modifiedAt: it.modifiedAt,
    })
  }
}

// ── 眉批的三条来源 ─────────────────────────────────────────────
// ① 本身带提示的词条（extra.csv 的 warn / need 标记）
// ② 最近更新的词条（与全量最新时间比，30 天内）
// ③ 某卷内第一个进入下一层的词条（在 generateData 里按层级变化打标）
// 口径与主站一致（NEW 标记也是「modifiedAt 距最新 30 天内」）。
const RECENT_SEC = 30 * 86400
const extraMarks: Map<string, ExtraRecord[]> = (() => {
  try {
    return loadAppendix().extra
  } catch {
    return new Map()
  }
})()
const maxModified = allRaw.reduce((m, it) => Math.max(m, it.modifiedAt || 0), 0)

/** 眉批文字：至多两条，按「提示 > 新訂 > 分層」取前两（天头只有一行高，再多就挤） */
function marksFor(it: ItemExt, tierMark?: string): string[] | undefined {
  const out: string[] = []
  const flags = extraMarks.get(it.id) || []
  if (flags.some((f) => f.flag === 'warn')) out.push('宜慎')
  else if (flags.some((f) => f.flag === 'need')) out.push('待補')
  if (it.modifiedAt && maxModified > 0 && maxModified - it.modifiedAt <= RECENT_SEC) out.push('新訂')
  if (tierMark) out.push(tierMark)
  return out.length > 0 ? out.slice(0, 2) : undefined
}

/**
 * 分类 → 卷名（**一一对应，写死在表里**）。
 *
 * 早先是按 `catKeys.indexOf(cat)` 取数组下标 —— 分类增删或 JSON 键序一变，
 * 全部卷名就整体错位（「鬼宅」变「史微」），作者自己都对不上。
 * 现在每个分类只认自己那一条；表里没有的分类原样用分类名兜底，
 * 卷次同样按本表的**声明顺序**（`VOL_ORDER`）编号，不跟着数据顺序走。
 */
const VOL_TITLES: Record<string, string> = {
  '都市传说・超自然事件・超常经历': '廣知一',
  '鬼宅・异常地点': '境異二',
  '真实犯罪・事故': '凶志三',
  '未确认生物': '物異四',
  '民俗・信仰・方术': '詭習五',
  '边缘科学・伪科学': '數術略六',
  '网络怪谈・奇闻': '齊諧七',
  '骗局・营销・谣言': '局詐八',
  '神话・志怪・传奇': '諾皋記九',
  '预言・谶纬': '讖緯十',
  '历史疑案・假说': '史闕文十一',
  '心理・社会现象': '鏡聽詞十二',
  '神秘内容・物件・现象': '器奇十三',
  '阴谋论・边缘理论': '陰符十四',
  '艺术・创作物': '藝文十五',
}
/** 卷次的固定顺序（= 上表的声明顺序） */
const VOL_ORDER = Object.keys(VOL_TITLES)

const catKeys = Object.keys(raw.categoryColors || {})
function volName(cat: string): string {
  return VOL_TITLES[cat] ?? cat
}
/** 卷次号：只认固定顺序，不在表里的分类排在已有的后面 */
function volNumber(cat: string): number {
  const i = VOL_ORDER.indexOf(cat)
  return i >= 0 ? i + 1 : VOL_ORDER.length + 1
}

/** 生成书稿：书名页 → 序 → 各卷 */
function generateData(mode: 'category' | 'tier') {
  let code = ''
  const charItem: number[] = []
  const meta: EntryMeta[] = []
  /** 与 meta 同下标：该词条的眉批（缺省 = 无批注） */
  const marks: (string[] | undefined)[] = []

  const pushAll = (s: string, ii: number) => {
    for (const c of s) { charItem.push(ii); code += c }
  }

  // 书名页
  pushAll('⚑【中文兔子洞冰山圖】', -1)
  pushAll('\f', -1)

  // 序（可点开）
  if (raw.introText) {
    const pi = meta.length
    meta.push({
      id: '__preface__', title: '序', cat: '序', color: '#7a6e61',
      tags: [], desc: plainDesc('__preface__', raw.introText), link: '', tier: '',
    })
    pushAll('【序】\n', pi)
    pushAll(plainDesc('__preface__', raw.introText), pi)
    pushAll('\n\n', -1)
  }

  const byCat: Record<string, ItemExt[]> = {}
  const byTier: Record<string, ItemExt[]> = {}
  for (const it of allRaw) {
    ;(byCat[it.category] ??= []).push(it)
    ;(byTier[it.tier] ??= []).push(it)
  }

  const emitEntry = (it: ItemExt, color: string, tierMark?: string) => {
    const mi = meta.length
    meta.push({
      id: it.id, title: it.title, cat: it.category, color,
      tags: it.tags, desc: plainDesc(it.id, it.desc), link: it.link, tier: it.tier,
    })
    const mp = marksFor(it, tierMark)
    if (mp) marks[mi] = mp
    pushAll('【' + plainTitle(it.id, it.title) + '】\n', mi)
    const ts = it.tags.length > 0 ? it.tags.join('　') : ''
    if (ts) pushAll('（' + ts + '）', mi)
    pushAll(plainDesc(it.id, it.desc), mi)
    pushAll('\n\n', mi)
  }

  if (mode === 'category') {
    // 卷次按固定表（VOL_TITLES 的声明顺序）排，不跟数据里的分类顺序走：
    // 分类增删只会多/少一卷，不会把「凶宅」排到「史微」后面。
    const known = VOL_ORDER.filter((c) => (byCat[c] || []).length > 0)
    const extra = catKeys.filter((c) => !VOL_ORDER.includes(c) && (byCat[c] || []).length > 0)
    for (const cat of [...known, ...extra]) {
      const items = (byCat[cat] || []).sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
      if (items.length === 0) continue
      const volNum = volNumber(cat)
      pushAll('⚐【' + volName(cat) + '】', -1)
      pushAll('\f', -1)
      const color = (raw.categoryColors as Record<string, string>)[cat] || '#FFFFFF'
      // 同卷内按层级升序：第一条「换了层」的词条就是进入下一层者，给它一条「X層」眉批
      let prevTier = ''
      for (const it of items) {
        const ti = tierOrder.indexOf(it.tier)
        const entered = prevTier !== '' && it.tier !== prevTier && ti >= 0
        prevTier = it.tier
        emitEntry(it, color, entered ? '此起' + toChineseNum(ti + 1) + '層' : undefined)
      }
    }
  } else {
    const tierNames = ['甲志', '乙志', '丙志', '丁志', '戊志', '己志', '庚志', '辛志']
    let volNum = 0
    for (const tn of tierOrder) {
      const items = (byTier[tn] || []).sort((a, b) => catKeys.indexOf(a.category) - catKeys.indexOf(b.category))
      if (items.length === 0) continue
      const tName = volNum < tierNames.length ? tierNames[volNum]! : '極'
      volNum++
      pushAll('⚐【' + tName + '】', -1)
      pushAll('\f', -1)
      for (const it of items) {
        emitEntry(it, (raw.categoryColors as Record<string, string>)[it.category] || '#FFFFFF')
      }
    }
  }

  return { code, charItem, meta, marks }
}

const catData = generateData('category')
const tierData = generateData('tier')
const baseUrl = import.meta.env.BASE_URL

// ── 字体按需加载 ──
// 古籍四款字体每个都有 1~4MB，不该让逛主图的访客为此付费。这一页的 CSS 带进来之后，
// 只**显式预载当前选中的那款 + 花园明朝兜底**（`document.fonts.load`），
// 进度条才有确定的计数；换字体时再针对新字体载一次。
const fontLoading = ref(false)
const fontDone = ref(0)
const fontTotal = ref(2)
const fontLabel = ref('')
const fontFail = ref(false)

/** 载一款字体：族名 + 显示名，等它的 woff2 真正可用 */
async function loadFace(face: string, label: string): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return true
  try {
    // 传一段常用字，确保拿到的是真正用于排版的字形
    await document.fonts.load(`16px "${face}"`, '永鬱龍龘〇')
    return true
  } catch {
    return false
  }
}

async function ensureFonts(family: FontFamily) {
  fontLoading.value = true
  fontFail.value = false
  fontDone.value = 0
  const jobs: Array<[string, string]> = [
    [FONT_FACES[family], FONT_LABELS[family]],
    [FALLBACK_FACE, FALLBACK_LABEL],
  ]
  fontTotal.value = jobs.length
  for (const [face, label] of jobs) {
    fontLabel.value = label
    const ok = await loadFace(face, label)
    if (!ok) fontFail.value = true
    fontDone.value++
  }
  fontLabel.value = ''
  fontLoading.value = false
}

/** 书名页刊记：数据更新之日（取自 meta.json 的 generatedAt，不是构建时间） */
const coverDate = (() => {
  const at = (metaJson as { generatedAt?: number }).generatedAt
  if (!at) return ''
  const d = new Date(at * 1000)
  return `更新於${numToZh(String(d.getFullYear()))}年${toChineseNum(d.getMonth() + 1)}月${toChineseNum(d.getDate())}日`
})()

// ── 状态 ──
const currentMode = ref<'category' | 'tier'>('category')
const cur = ref(0)
const max = ref(0)
const cols = ref(10)
const spreads = ref<PlacedCell[][][]>([])
const volNames = ref<string[]>([])
const cssVars = ref<Record<string, string>>({})
const single = ref(false)
const overlayOpen = ref(false)
const overlayItem = ref<EntryMeta | null>(null)
const settingsOpen = ref(false)
const tocOpen = ref(false)
const searchOpen = ref(false)
const searchQ = ref('')
const jumpOpen = ref(false)
/** 跳页目标叶码：滑条与输入框共用同一个**数字**真值，显示时才转汉字 */
const jumpLeaf = ref(1)
/** 词条序号 → 展序号（排版后由 spreads 反查，搜索跳转用） */
const entryPages = ref<Map<number, number>>(new Map())
/** 任意浮层打开时锁掉背景（搜索 / 跳转 / 目录 / 设置 / 词条详情共用一套） */
const anyOverlay = computed(() => overlayOpen.value || settingsOpen.value || tocOpen.value || searchOpen.value || jumpOpen.value)
/** 浮层期间的滚动锁：用项目自己的 overlayLock（token 计数 + 滚动条宽度补偿） */
let unlockOverlay: (() => void) | null = null
watch(anyOverlay, (v) => {
  if (v && !unlockOverlay) unlockOverlay = lockOverlay()
  else if (!v && unlockOverlay) { unlockOverlay(); unlockOverlay = null }
})
/** 上一次关闭浮层的时间：关闭动作用的是同一次点击，不能让涟漪再翻一页 */
let lastOverlayCloseAt = 0
watch(anyOverlay, (v, prev) => { if (prev && !v) lastOverlayCloseAt = Date.now() })

/** 排版偏好（持久化，设置页可改）。必须用 useStore，否则 Vue 追踪不到变化 */
const prefs = useStore(typographyPrefs)

/** 句读开关：只有显示 / 不显示 */
const showPunct = computed(() => prefs.value.punct)

/** 界行开关与贯穿选项 */
const showRules = computed(() => prefs.value.rules)
const showRulesFull = computed(() => prefs.value.rulesFull)

/** 导航页码：与版心同一来源（一页一个号，一展两页） */
const navPage = computed(() =>
  pageNumbers(cur.value, single.value).map(toChineseNum).join('・'),
)

let tokens: Token[] = []
let activeMeta: EntryMeta[] = []
let activeMarks: (string[] | undefined)[] = []
let initialDone = false
/** 书框根节点：尺寸变化即重排（useResizeObserver 挂在它上面） */
const wrRef = ref<HTMLElement | null>(null)
/** 首帧排版防抖：字体/滚动条就绪时会连发几次尺寸变化 */
const debouncedRelayout = useDebounceFn(() => relayout(false), 150)

const catIndex = computed(() => Math.max(0, catKeys.indexOf(overlayItem.value?.cat || '')))
const safeColor = computed(() => inkColor(overlayItem.value?.color || '', catIndex.value))
const tierLabel = computed(() => (overlayItem.value?.tier || '').replace('Tier ', '層'))

const overlayParas = computed(() => {
  const d = overlayItem.value?.desc || ''
  if (!d.trim()) return []
  return d.split(/\n{2,}/).map((p) => p.replace(/\n+/g, '').trim()).filter(Boolean)
})

function updateModeData() {
  const data = currentMode.value === 'category' ? catData : tierData
  tokens = parseText(data.code, data.charItem)
  activeMeta = data.meta
  activeMarks = data.marks
}

/** 目录：每卷的卷名 + 卷首页所在的那一展 */
const toc = ref<Array<{ name: string; si: number }>>([])

function updateVolNames() {
  const vn: string[] = []
  const idx: Array<{ name: string; si: number }> = []
  for (let s = 0; s < spreads.value.length; s++) {
    vn[s] = ''
    for (let p = 0; p < 2; p++) {
      const pg = spreads.value[s]?.[p] || []
      if (!pg.some((c) => c.c === '⚐')) continue
      let name = ''
      for (const c of pg) if (c.hw && c.c !== '⚐') name += c.c + (c.pn || '')
      // 卷名末尾可能挂着解析时带出来的句读符号（、。），版心与目录里都不该出现
      name = name.replace(/[。、，,；;]+$/, '')
      if (name) { vn[s] = name; idx.push({ name, si: s }); break }
    }
  }
  let last = ''
  for (let s = 0; s < spreads.value.length; s++) {
    if (vn[s]) last = vn[s]!
    else vn[s] = last
  }
  volNames.value = vn
  toc.value = idx
}

/**
 * 把眉批贴到单元格上。
 *
 * 只认每个词条的**起首字**（`rw === 0`：标题总是自动起新列），
 * 渲染层因此知道「这条批注属于哪一列」，画到该列的天头里。
 * 排版算法（engine.ts）不认识眉批 —— 它是纯装饰，不该影响分页。
 */
function attachMarks(spreadsArr: PlacedCell[][][], rowsPerHalf: number) {
  for (const spread of spreadsArr) {
    for (const pg of spread) {
      const seen = new Set<number>()
      for (const c of pg) {
        if (c.cm || !c.hw || c.ii < 0 || c.rw !== 0 || seen.has(c.ii)) continue
        seen.add(c.ii)
        const marks = activeMarks[c.ii]
        if (!marks?.length) continue
        // 小字格与夹注同构：每个字算好「第几个半列 / 第几行」；
        // 多条批注接着排（后一条从下一条空半列开始），先填满一个半列再换下一个。
        const out: MarginalChar[] = []
        let usedHalves = 0
        for (const mk of marks) {
          out.push(...layoutMarginal(mk, rowsPerHalf, usedHalves))
          usedHalves += Math.ceil([...mk].length / Math.max(1, rowsPerHalf))
        }
        c.mp = out
      }
    }
  }
}

function relayout(keepCur = true) {
  const cfg = defaultLayoutConfig(window.innerWidth, window.innerHeight, prefs.value)
  // 字号/列间距变化会改变总页数：按**阅读进度比例**保留位置，
  // 否则 cur 越界被夹回 0，用户会突然跳回书名页（以为内容丢了）。
  const prevMax = max.value
  const ratio = keepCur && prevMax > 0 ? cur.value / prevMax : 0
  const st = calcLayout(tokens, 0, window.innerWidth, window.innerHeight, cfg)
  attachMarks(st.spreads, st.marginalRows)
  cols.value = st.cols
  spreads.value = st.spreads
  max.value = st.max
  cssVars.value = st.cssVars
  single.value = st.single
  cur.value = keepCur ? Math.min(st.max, Math.round(ratio * st.max)) : 0
  updateVolNames()
  // 词条 → 展：扫一遍版面，标题格（hw）所在的那一展就是它的位置
  const map = new Map<number, number>()
  st.spreads.forEach((spread, si) => {
    for (const page of spread) {
      for (const cell of page) {
        if (cell.hw && cell.ii >= 0 && !map.has(cell.ii)) map.set(cell.ii, si)
      }
    }
  })
  entryPages.value = map
}

const pageDir = ref<'next' | 'prev'>('next')
function show(i: number) {
  if (i < 0 || i > max.value) return
  cur.value = i
}
function prev() {
  if (cur.value <= 0) return
  pageDir.value = 'prev'
  show(cur.value - 1)
}
function next() {
  if (cur.value >= max.value) return
  pageDir.value = 'next'
  show(cur.value + 1)
}

function toggleMode() {
  currentMode.value = currentMode.value === 'category' ? 'tier' : 'category'
  updateModeData()
  relayout(false)
  pageDir.value = 'next'
}

/** 目录跳转：关掉目录、翻到该卷首页，方向按目标位置决定 */
function gotoVol(si: number) {
  pageDir.value = si >= cur.value ? 'next' : 'prev'
  tocOpen.value = false
  show(si)
}

// ── 搜索跳转 ──
/** 搜索结果：按标题子串匹配，最多两打，先显示靠前的（同「深度」顺序） */
const searchHits = computed(() => {
  const q = searchQ.value.trim().toLowerCase()
  if (!q) return []
  const out: { ii: number; title: string; cat: string; si: number | null }[] = []
  for (let ii = 0; ii < activeMeta.length; ii++) {
    const m = activeMeta[ii]!
    if (!m.title.toLowerCase().includes(q) && !(m.cat || '').toLowerCase().includes(q)) continue
    out.push({ ii, title: m.title, cat: m.cat, si: entryPages.value.get(ii) ?? null })
    if (out.length >= 24) break
  }
  return out
})

function openSearch() {
  searchQ.value = ''
  searchOpen.value = true
}

/** 跳到词条所在的那一展；顺带关掉搜索 */
function jumpToEntry(ii: number) {
  const si = entryPages.value.get(ii)
  searchOpen.value = false
  if (si === undefined) return
  pageDir.value = si >= cur.value ? 'next' : 'prev'
  show(si)
}

// ── 页码跳转 ──
/** 叶码夹在 1..总叶数 */
function clampLeaf(n: number): number {
  return Math.min(Math.max(1, Math.trunc(n)), Math.max(1, totalLeaves.value))
}

/** 总叶数（一页一个号；双页模式是展数 × 2） */
const totalLeaves = computed(() => (max.value + 1) * (single.value ? 1 : 2))

/** 当前所在叶码（单页一展一叶；双页两叶一展，右页在先） */
function leafOfCur(): number {
  return single.value ? cur.value + 1 : cur.value * 2 + 1
}

function openJump() {
  jumpLeaf.value = leafOfCur()
  jumpOpen.value = true
}

/** 叶码滑条：拖动即时翻页。没有输入框、也没有跳转按钮 —— 松手不再做别的 */
function onSliderInput(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (!Number.isFinite(n)) return
  const leaf = clampLeaf(n)
  jumpLeaf.value = leaf
  const si = single.value ? leaf - 1 : Math.floor((leaf - 1) / 2)
  pageDir.value = si >= cur.value ? 'next' : 'prev'
  show(si)
}

// ── 触摸翻页 ──
// 判定交给 `resolveSwipe`（冰山图词条左右滑动的同一份实现，已有单测）：
// 最小位移、轴比、快速轻扫、边缘阻尼都不必在这里重写一遍。
let touchStart: { x: number; y: number; at: number } | null = null
/** 上一次识别到滑动的时间：用来吃掉浏览器补发的 click */
let lastSwipeAt = 0

/** 浮层选择器：手指从这些区域起手时不参与左右滑动（拖滑条、点浮层都不该翻页） */
const OVERLAY_SEL = '.pgj-ov, .srb-ov, .st-ov, .toc-ov, .ov, .nv, .fbar'

function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  const fromOverlay = e.target instanceof Element && !!e.target.closest(OVERLAY_SEL)
  if (!prefs.value.swipeTurn || !t || fromOverlay
    || overlayOpen.value || settingsOpen.value || tocOpen.value || searchOpen.value || jumpOpen.value) {
    touchStart = null
    return
  }
  touchStart = { x: t.clientX, y: t.clientY, at: Date.now() }
}

function onTouchEnd(e: TouchEvent) {
  const s = touchStart
  touchStart = null
  const t = e.changedTouches[0]
  if (!s || !t) return
  const dir = resolveSwipe({
    dx: t.clientX - s.x,
    dy: Math.abs(t.clientY - s.y),
    width: window.innerWidth,
    durationMs: Date.now() - s.at,
  })
  lastSwipeAt = Date.now()
  // 右綴じ：手指往右划 = 翻开下一展，往左划 = 回看上一展。
  // resolveSwipe 是按横排列表给的语义（左滑=下一条），这里必须翻过来 ——
  // 与点按三分之一的方向（点左侧 = 下一展）才对得上。
  if (dir === 'prev') next()
  else if (dir === 'next') prev()
}

/**
 * 点按左右三分之一翻页（右起阅读：左边三分之一 = 下一展）。
 *
 * 只用单页模式（手机）—— 桌面上点正文是选择/点词条的区域，不该顺手翻页。
 * 点在词条标题上时让给词条：`closest('.clk')` 命中的一律不翻页。
 */
function onTapZone(e: MouseEvent) {
  // 叶码滑条打开时：点书页只负责收起滑条，不翻页
  if (jumpOpen.value) { jumpOpen.value = false; return }
  if (!prefs.value.tapTurn || !single.value) return
  if (overlayOpen.value || settingsOpen.value || tocOpen.value || searchOpen.value) return
  // 刚识别到一次滑动：浏览器随后补发的 click 不该再翻一页
  if (Date.now() - lastSwipeAt < 400) return
  const target = e.target as HTMLElement | null
  if (target?.closest?.('.clk')) return
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  if (x < 1 / 3) next()
  else if (x > 2 / 3) prev()
}

function openOverlay(ii: number) {
  if (Number.isNaN(ii) || !activeMeta[ii]) return
  overlayItem.value = activeMeta[ii]!
  overlayOpen.value = true
}

onMounted(() => {
  updateModeData()

  // 字体：先把当前选中的那款 + 花园明朝拉下来，进度条照实反映
  void ensureFonts(prefs.value.font)
  watch(() => prefs.value.font, (f) => void ensureFonts(f))

  // 首帧尺寸就绪后再排一次（此时字体与滚动条都已稳定）；后续尺寸变化交给同一套重排
  useResizeObserver(wrRef, (entries) => {
    const e = entries[0]
    const w = e ? e.contentRect.width : 0
    const h = e ? e.contentRect.height : 0
    if (w > 0 && h > 0 && !initialDone) {
      initialDone = true
      debouncedRelayout()
    }
  })

  function onKey(e: KeyboardEvent) {
    // 右起阅读：左键下一页、右键上一页
    if (e.key === 'ArrowLeft') { e.preventDefault(); next() }
    if (e.key === 'ArrowRight') { e.preventDefault(); prev() }
    // 翻页键：PageDown / PageUp 与「下一展 / 上一展」同义，
    // 空格键沿用阅读器的「往下」习惯（Shift+空格往回）
    if (e.key === 'PageDown') { e.preventDefault(); pageDir.value = 'next'; show(cur.value + 1) }
    if (e.key === 'PageUp') { e.preventDefault(); pageDir.value = 'prev'; show(cur.value - 1) }
    if (e.key === ' ') {
      e.preventDefault()
      if (e.shiftKey) { pageDir.value = 'prev'; show(cur.value - 1) }
      else { pageDir.value = 'next'; show(cur.value + 1) }
    }
    // 首尾：Home 回到第一展、End 跳到最后一展
    if (e.key === 'Home') { e.preventDefault(); pageDir.value = 'prev'; show(0) }
    if (e.key === 'End') { e.preventDefault(); pageDir.value = 'next'; show(max.value) }
    if (e.key === 'Escape') {
      if (tocOpen.value) tocOpen.value = false
      else if (settingsOpen.value) settingsOpen.value = false
      else overlayOpen.value = false
    }
  }
  useEventListener(document, 'keydown', onKey)

  // 触摸事件绑在模板根节点上（见 template 的 @touchstart / @touchend / @click）。
  // 不再 querySelector + 手动解绑：v2 的根节点类名是 .wr，早先按 .sw 去找永远拿到 null，
  // 手机上的左右滑动与点按翻页因此从未生效。

  // 排版偏好变化 → 重排。
  // **font 必须在内**：字体栈写在 cssVars 的 --font-stack 里，
  // 不重排就不会更新，用户会以为「设置没反应」。
  watch(
    () => [
      prefs.value.font,
      prefs.value.fontScale,
      prefs.value.engScale,
      prefs.value.colGap,
      prefs.value.lineHeight,
      prefs.value.headRatio,
      prefs.value.marginRatio,
      prefs.value.gutterRatio,
    ],
    () => relayout(true),
  )
})

onUnmounted(() => {})
</script>

<template>
  <div id="root">
    <!-- 根节点同时挂 .sw：CSS 的触摸手势禁则（touch-action）与窄屏单页规则都写在 .sw 上；
         触摸翻页直接绑在这里，不再 querySelector 后手动解绑。 -->
    <div
      ref="wrRef"
      class="wr"
      :class="{ 'wr--single': single }"
      :style="cssVars"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <!-- 纸张噪声 -->
      <svg class="nz">
        <filter id="pf-v2">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" stitchTiles="stitch" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.015 0.05 0.11" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#pf-v2)" />
      </svg>

      <!-- 当前展页 -->
      <div id="sc" class="sc" @click="onTapZone">
        <Transition :name="'page-' + pageDir" mode="out-in">
          <SpreadView
            v-if="spreads[cur]"
            :key="cur"
            :spread="spreads[cur]!"
            :cols="cols"
            :vol-name="volNames[cur]"
            :si="cur"
            :single="single"
            :punct="showPunct"
            :rules="showRules"
            :rules-full="showRulesFull"
            :updated="coverDate"
            @open-item="openOverlay"
          />
        </Transition>
      </div>

      <!-- 字体加载条：只有这一页需要下 1~4MB 的刻本字库，进度就摆在书框下沿 -->
      <div v-if="fontLoading || fontFail" class="fbar">
        <span class="fbar-t">
          <template v-if="fontFail">字體載入失敗，暫用系統字</template>
          <template v-else>正在載入 {{ fontLabel }} {{ fontDone }}/{{ fontTotal }}</template>
        </span>
        <span class="fbar-track"><i class="fbar-fill" :style="{ width: (fontDone / fontTotal) * 100 + '%' }"></i></span>
      </div>

      <!-- 导航：返回 / 上一页 / 页码 / 下一页 / 目录 / 设置。
           图标统一走 lucide（与全站其它页面一致），不用字符箭头：
           `‹` `›` `⚙` 在不同字体下粗细与基线都不同，一排里看着像三种图标。
           右起阅读：ChevronLeft 是下一页（往左翻），ChevronRight 是上一页。
           列宽在 CSS 里写死（grid），页码变长也不会把按钮挤得左右乱跑。 -->
      <nav class="nv">
        <!-- 三 | 页码 | 三：左右各三个按钮，页码恒在正中；
             页码是「跳转叶码」的入口，点它打开输入框。 -->
        <a :href="baseUrl" class="nv-lnk" :aria-label="t('back')">
          <ArrowLeft :size="18" :stroke-width="1.75" />
        </a>
        <button class="nv-lnk" aria-label="搜索词条" @click="openSearch">
          <Search :size="18" :stroke-width="1.75" />
        </button>
        <button class="nv-lnk" :disabled="cur >= max" :aria-label="t('ancientNextPage')" @click="next">
          <ChevronLeft :size="18" :stroke-width="1.75" />
        </button>
        <button class="nv-num" aria-label="跳转叶码" title="跳转叶码" @click="openJump">{{ navPage }}</button>
        <button class="nv-lnk" :disabled="cur <= 0" :aria-label="t('ancientPrevPage')" @click="prev">
          <ChevronRight :size="18" :stroke-width="1.75" />
        </button>
        <button class="nv-lnk" aria-label="目录" @click="tocOpen = true">
          <ListIcon :size="18" :stroke-width="1.75" />
        </button>
        <button class="nv-lnk" aria-label="排版设置" @click="settingsOpen = true">
          <Settings :size="18" :stroke-width="1.75" />
        </button>
      </nav>

      <!-- 目录：按卷次列出，点一下跳到该卷的卷首页 -->
      <div class="toc-ov" :class="{ s: tocOpen }" @click.self.stop="tocOpen = false">
        <aside class="toc" role="dialog" aria-modal="true" aria-label="目录">
          <button class="st-x" @click="tocOpen = false" aria-label="关闭">&times;</button>
          <h2 class="toc-hd">目錄</h2>
          <ol class="toc-list">
            <li v-for="v in toc" :key="v.si">
              <button class="toc-it" :class="{ on: volNames[cur] === v.name }" @click="gotoVol(v.si)">
                <span class="toc-name">{{ v.name }}</span>
                <span class="toc-leaf">{{ toChineseNum(pageNumbers(v.si, single)[0]!) }}</span>
              </button>
            </li>
          </ol>
        </aside>
      </div>

      <!-- 搜索跳转：按标题 / 分类找词条，点一下翻到它所在的那一展 -->
      <div class="srb-ov" :class="{ s: searchOpen }" @click.self.stop="searchOpen = false">
        <div class="srb" role="dialog" aria-modal="true" aria-label="搜索词条">
          <div class="srb-row">
            <Search :size="15" :stroke-width="2" />
            <input
              v-model="searchQ"
              class="srb-in"
              type="search"
              placeholder="搜索词条名或分类"
              @keydown.enter="searchHits[0] && jumpToEntry(searchHits[0].ii)"
              @keydown.esc="searchOpen = false"
            />
            <button class="st-x" aria-label="关闭" @click="searchOpen = false">&times;</button>
          </div>
          <ul class="srb-list">
            <li v-for="hit in searchHits" :key="hit.ii">
              <button class="srb-it" :disabled="hit.si === null" @click="jumpToEntry(hit.ii)">
                <span class="srb-t">{{ hit.title }}</span>
                <span class="srb-m">{{ hit.cat }}</span>
                <span v-if="hit.si !== null" class="srb-p">{{ toChineseNum(pageNumbers(hit.si, single)[0]!) }}</span>
              </button>
            </li>
          </ul>
          <p v-if="searchQ && !searchHits.length" class="srb-empty">沒有找到詞條</p>
        </div>
      </div>

      <!-- 叶码滑条：点底部页码从下方上浮，拖动即翻页；点书页或再点页码收起 -->
      <Transition name="pgs">
        <div v-if="jumpOpen" class="pgs" role="group" aria-label="叶码">
          <span class="pgs-num">{{ toChineseNum(jumpLeaf) }}</span>
          <input
            class="pgs-range"
            type="range"
            min="1"
            :max="totalLeaves || 1"
            :value="jumpLeaf"
            aria-label="拖动选择叶码"
            @input="onSliderInput"
          />
          <span class="pgs-total">{{ toChineseNum(totalLeaves) }}</span>
        </div>
      </Transition>

      <!-- 排版设置 -->
      <SettingsPanel :open="settingsOpen" @close="settingsOpen = false" />

      <!-- 词条详情 -->
      <div class="ov" :class="{ s: overlayOpen }" @click.self.stop="overlayOpen = false">
        <article class="dp" role="dialog" aria-modal="true" :aria-label="overlayItem?.title">
          <button class="dc" @click="overlayOpen = false" :aria-label="t('close')">&times;</button>

          <header class="dp-head">
            <h2 class="dp-title">{{ overlayItem?.title }}</h2>
            <p class="dp-meta">
              <span v-if="overlayItem?.cat && overlayItem.cat !== overlayItem.title" class="dp-cat" :style="{ color: safeColor }">{{ overlayItem?.cat }}</span>
              <span v-if="overlayItem?.tier" class="dp-tier">{{ tierLabel }}</span>
            </p>
          </header>

          <div class="dp-body">
            <p v-for="(para, i) in overlayParas" :key="i" class="dp-para">{{ para }}</p>
            <p v-if="!overlayParas.length" class="dp-empty">{{ t('ancientNoDesc') }}</p>
          </div>

          <footer v-if="overlayItem?.tags.length" class="dp-foot">
            <span v-for="tag in overlayItem.tags" :key="tag" class="dp-tag">{{ tag }}</span>
          </footer>

          <a
            v-show="overlayItem?.link"
            class="dp-link"
            :href="overlayItem?.link"
            target="_blank"
            rel="noopener"
          >{{ t('ancientVisitLink') }}</a>
        </article>
      </div>
    </div>
  </div>
</template>

<style>
@import '../lib/ancient-book-v2/ancient-book-v2.css';
</style>
