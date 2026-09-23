import { parseCSV } from '../csv'

/**
 * 多分类副表（appendix/categories.csv，`item_id,category` 一词多行）。
 *
 * 语义（冻结）：叠加 OR —— 主 `category` 保留，副分类额外命中筛选；
 * 词条墙 `.item-title` 走左右渐变，详情区打多徽章；3D / 古籍 / 导出 / 预渲染
 * 仍按主分类（零口径扩散）。
 *
 * 渐变实现（2026-09-20 换代）：由「逐字纯色 span」改为「OKLCH 预插色标 +
 * background-clip:text 连续渐变」。逐字纯色在短标题上退化成逐字跳变
 * （3 字 3 色），且 span 边界打断 kerning、与 ::after 描边镜像层字形错位。
 * 透明镂空字盖不住 text-shadow 的问题改由 ::after 镜像层承接，见 styles/index.css。
 */

export type ExtraCategoriesMap = Map<string, string[]>

/** 解析副表：保序去重，空 id / 空分类直接丢弃（与 related/references 同风格） */
export function parseExtraCategories(csvRaw: string): ExtraCategoriesMap {
  const out: ExtraCategoriesMap = new Map()
  for (const row of parseCSV(csvRaw)) {
    const id = (row.item_id || '').trim()
    const cat = (row.category || '').trim()
    if (!id || !cat) continue
    const list = out.get(id) || []
    if (!list.includes(cat)) list.push(cat)
    out.set(id, list)
  }
  return out
}

export interface CategorizedItem {
  category: string
  /** 数据源挂载：主分类 + 副分类（去重，主分类打头） */
  categories?: string[]
}

interface GradableItem extends CategorizedItem {
  id: string
  gradStops?: string
}

interface GradableData {
  tiers: Record<string, GradableItem[]>
  categoryColors: Record<string, string>
  defaultColor: string
}

/**
 * 副表装配唯一入口：把 categories.csv 的副分类与墙渐变色标挂到 data.tiers 条目上。
 *
 * v1（IndexView.vue）与 v2（useIcebergDataSource.ts）共用此一处 —— 两份逐行相同的
 * 装配代码曾并存，任何口径调整都要改两遍，是漂移源。
 * 返回命中渐变的词条数（仅供调用方/测试观测，无其他副作用）。
 */
export function applyExtraCategories(data: GradableData, extra: ExtraCategoriesMap): number {
  const knownCats = new Set(Object.keys(data.categoryColors || {}))
  let hits = 0
  for (const items of Object.values(data.tiers)) {
    for (const item of items) {
      const cats = buildCategories(
        item.category,
        (extra.get(item.id) || []).filter((c) => knownCats.has(c)),
      )
      item.categories = cats
      // 墙渐变色标在此预计算（色源构建期静态），模板零计算。
      // 空串（单分类）不挂字段：模板 v-if 与 .multi-cat 判定都以它为真值门，
      // 空值天然为假 —— 不会出现「加了 multi-cat 类却只渲染空串」的词条。
      if (cats.length > 1) {
        const stops = gradientStops(cats, data.categoryColors, data.defaultColor)
        if (stops) {
          item.gradStops = stops
          hits++
        }
      }
    }
  }
  return hits
}

/** 归一化分类列表：无副表数据时回退 `[主分类]` */
export function itemCategories(item: CategorizedItem): string[] {
  if (item.categories && item.categories.length > 0) return item.categories
  return [item.category]
}

/** 组装挂载用分类列表：主分类打头 + 副表去重（掉与主分类相同的行） */
export function buildCategories(main: string, extra: string[] | undefined): string[] {
  const out = [main]
  for (const c of extra || []) {
    if (c && c !== main && !out.includes(c)) out.push(c)
  }
  return out
}

export function isMultiCategory(item: CategorizedItem): boolean {
  return itemCategories(item).length > 1
}

/** 副分类（不含主分类）+ 颜色解析，供详情区多徽章用 */
export function extraBadges(
  item: CategorizedItem,
  categoryColors: Record<string, string>,
  fallbackColor: string,
): Array<{ category: string; color: string }> {
  return itemCategories(item)
    .filter((c) => c !== item.category)
    .map((c) => ({ category: c, color: categoryColors[c] || fallbackColor }))
}

/** 渐变色标数（含两端）：9 个等距样本，相邻色差已小于人眼分辨阈，视觉连续 */
export const GRADIENT_STEPS = 9

/**
 * 两端固有色平台占比（%）：色标区间由 [0%, 100%] 内缩到 [10%, 90%]，
 * 首末色标之前/之后由浏览器按规范用该色标颜色填充 —— 等价于两端各留一段
 * 纯分类色平台。不内缩时端点色只在最边缘一闪即过，词条的"分类归属感"弱。
 * 调参只改这一个常量：调大 → 两端纯色更宽、中段渐变被压缩。
 */
export const GRADIENT_EDGE_HOLD = 10

/**
 * 词条墙标题渐变色标（左右）：单分类返回 ''（调用方渲染纯文本），
 * 多分类返回带位置的色标列表 `#A 10%, #B 20%, ...`，由调用方挂到 `--grad-stops`，
 * CSS 侧 `linear-gradient(90deg, var(--grad-stops, var(--item-color)))`
 * 配 `background-clip: text` 渲染（见 styles/index.css）。
 *
 * 为什么自插色标而不用 `linear-gradient(in oklch, ...)`：色相短弧与无彩端
 * 继承逻辑需要手工控制，且预插值让渲染期零兼容风险、样式表零计算。
 * 插值走 OKLCH（JS 内纯实现，不依赖浏览器）：远色在 sRGB 里 direct lerp
 * 中段必灰（#FF3333→#85D6FF 会经过脏灰紫），OKLCH 下色相走短弧、
 * 白端自动继承对方色相，中段干净。未知分类回退 fallbackColor
 * （构建门才是真校验，此处只防白屏）。
 */
export function gradientStops(
  cats: string[],
  categoryColors: Record<string, string>,
  fallbackColor: string,
  steps: number = GRADIENT_STEPS,
  edgeHold: number = GRADIENT_EDGE_HOLD,
): string {
  if (cats.length < 2 || steps < 2) return ''
  const lab = cats.map((c) => hexToOklch(categoryColors[c] || fallbackColor))
  const hold = Math.min(45, Math.max(0, edgeHold)) // 钳制：两侧平台不可吃掉全部渐变区
  const span = 100 - hold * 2
  const fmt = (n: number) => `${Math.round(n * 100) / 100}%`
  const out: string[] = []
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1)
    const t = f * (lab.length - 1)
    const k = Math.min(lab.length - 2, Math.floor(t))
    out.push(`${oklchToHex(lerpOklch(lab[k], lab[k + 1], t - k))} ${fmt(hold + f * span)}`)
  }
  return out.join(', ')
}

interface Oklch { l: number; c: number; h: number }

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [255, 255, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function srgbToLinear(c: number): number {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.sqrt(a * a + bb * bb), h: (Math.atan2(bb, a) * 180) / Math.PI }
}

/** OKLCH 插值：L/C 线性，色相走短弧；无彩端继承对方色相 */
function lerpOklch(p: Oklch, q: Oklch, f: number): Oklch {
  let dh = q.h - p.h
  if (p.c < 1e-4) dh = 0 // p 无彩：色相不动（= q.h 方向由 q 定，见下）
  else if (q.c < 1e-4) dh = 0 // q 无彩：保持 p 色相
  else {
    while (dh > 180) dh -= 360
    while (dh < -180) dh += 360
  }
  const h = p.c < 1e-4 ? q.h : p.h + dh * f
  return { l: p.l + (q.l - p.l) * f, c: p.c + (q.c - p.c) * f, h }
}

function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const r = 4.0767416621 * l_ ** 3 - 3.3077115913 * m_ ** 3 + 0.2309699292 * s_ ** 3
  const g = -1.2684380046 * l_ ** 3 + 2.6097574011 * m_ ** 3 - 0.3413193965 * s_ ** 3
  const bb = -0.0041960863 * l_ ** 3 - 0.7034186147 * m_ ** 3 + 1.707614701 * s_ ** 3
  const toHex = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(bb)}`.toUpperCase()
}
