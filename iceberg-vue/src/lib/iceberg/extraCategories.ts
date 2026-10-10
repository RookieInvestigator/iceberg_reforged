import type { CategoryRecord } from './appendix'

/**
 * 分类副表（appendix/categories.csv）的**渲染层装配** —— 分类区域的唯一实现。
 *
 * 语义（由 `role` 表达，一张表一个区域）：
 *   · `role=main`  覆盖主分类（每词条至多一条，多行 last-wins）—— 同时重算 categoryColor；
 *   · `role=extra` 追加副分类：主 `category` 保留，副分类额外命中筛选（叠加 OR）；
 *   · 缺省 role = extra（无 role 列时行为不变）。
 *
 * 词的渲染侧（词条墙 `.item-title` 左右渐变、详情区多徽章）不变；3D / 古籍 / 导出 / 预渲染
 * 仍按主分类（零口径扩散）。
 *
 * 渐变：OKLCH 预插色标 + background-clip:text 连续渐变（逐字纯色在短标题上退化成逐字跳变，
 * 且 span 边界打断 kerning、与 ::after 描边镜像层字形错位）。透明镂空字盖不住 text-shadow
 * 的问题由 ::after 镜像层承接，见 styles/index.css。
 */

/** item_id → 分类记录（含 main 与 extra），由 lib/iceberg/appendix.ts 解析 */
export type CategoriesMap = Map<string, CategoryRecord[]>

export interface CategorizedItem {
  category: string
  /** 数据源挂载：主分类 + 副分类（去重，主分类打头） */
  categories?: string[]
}

interface GradableItem extends CategorizedItem {
  id: string
  gradStops?: string
  /** 主分类色（normalizeData 已算过；role=main 覆盖主分类时需重算） */
  categoryColor?: string
}

interface GradableData {
  tiers: Record<string, GradableItem[]>
  categoryColors: Record<string, string>
  defaultColor: string
}

export interface CategoryApplyStat {
  /** 生效的主分类覆盖数 */
  main: number
  /** 生效的副分类词条数（至少追加了一个副分类） */
  extra: number
  /** 挂上渐变色标的词条数 */
  gradient: number
}

/**
 * 副表装配唯一入口（分类区域）：把 categories.csv 的主分类覆盖 / 副分类 与墙渐变色标挂到
 * data.tiers 条目上（消费方只有 useIcebergDataSource）。
 *
 * 未知分类的处理刻意不对称：
 *   · `role=main` 是**权威指定**，照用（颜色回退 defaultColor，构建门才拦未知分类）；
 *   · `role=extra` 只是「额外命中筛选」，未知分类直接丢弃（不制造点不开的筛选桶）。
 */
export function applyCategories(data: GradableData, records: CategoriesMap): CategoryApplyStat {
  const knownCats = new Set(Object.keys(data.categoryColors || {}))
  const stat: CategoryApplyStat = { main: 0, extra: 0, gradient: 0 }

  for (const items of Object.values(data.tiers)) {
    for (const item of items) {
      const rows = records.get(item.id) || []
      // 主分类覆盖：同 item 多条 main 时最后一条生效（与 overrides 的 last-wins 同约定）
      const mainRow = [...rows].reverse().find((r) => r.role === 'main')
      const main = (mainRow?.category || '').trim()
      if (main) {
        item.category = main
        item.categoryColor = data.categoryColors[main] || data.defaultColor
        stat.main++
      }
      const extras = rows
        .filter((r) => r.role === 'extra')
        .map((r) => r.category)
        .filter((c) => knownCats.has(c))
      if (extras.length) stat.extra++
      const cats = buildCategories(item.category, extras)
      item.categories = cats
      // 墙渐变色标在此预计算（色源构建期静态），模板零计算。
      // 空串（单分类）不挂字段：模板 v-if 与 .multi-cat 判定都以它为真值门，
      // 空值天然为假 —— 不会出现「加了 multi-cat 类却只渲染空串」的词条。
      if (cats.length > 1) {
        const stops = gradientStops(cats, data.categoryColors, data.defaultColor)
        if (stops) {
          item.gradStops = stops
          stat.gradient++
        }
      }
    }
  }
  return stat
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
 * 色标在 JS 里按 OKLCH 预插值（色相走短弧、无彩端继承对方色相）：sRGB 直接 lerp
 * 中段必灰（#FF3333→#85D6FF 会经过脏灰紫）；也避免依赖 CSS `linear-gradient(in oklch, …)`
 * 的兼容性与色相短弧控制。未知分类回退 fallbackColor（构建门才是真校验，此处只防白屏）。
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
