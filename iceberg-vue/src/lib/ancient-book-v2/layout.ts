import { layoutPages } from './engine'
import { measureEngWidth } from './measure'
import type { Token, PlacedCell, LayoutConfig, LayoutResult, JudouConfig, TypographyPrefs, FontFamily } from './types'

/**
 * 古籍 v2 · 版面计算
 *
 * 几何模型：
 *   列宽 = (版面宽 - 左右留白 - 版心宽) / 列数
 *   行高 = (版面高 - 上下留白) / 行数
 * 比例取直排与传统开本的习惯：
 *   密排（字格 = 字号 × 1.08）、天头 > 地脚、订口 < 书口。
 */

/**
 * 字体族 → CSS font-family 栈。
 *
 * 五款字体全部自托管（见 `src/styles/fonts.css` 与 `fonts-guji.css`），
 * **不挂系统字体**：系统楷体/仿宋在 Windows 与 macOS 上是两种字形，
 * 同一页跨平台会漂移。
 *
 * 回退链只有两级，不再叠中间层：**主字体 → 花园明朝 → serif**。
 * 花园明朝的语料覆盖率比思源宋更广（缺 78 vs 104），排它兜底就够了；
 * 早前在中间再插一层思源宋，只会让「到底哪一层生效」变得不可推理。
 *
 * 视觉大小由 `@font-face` 的 `size-adjust` 对齐（见 subset_guji_fonts.py），
 * 不在这里改字号 —— 字号会连带改变字格与列宽，切字体整页重排。
 */
export const FONT_STACKS: Record<FontFamily, string> = {
  // 思源宋：刻本正文最常用，也是全站正文底
  song: "'Noto Serif SC', 'HanaMinA', serif",
  // 思源黑：方硬醒目，用于卷首/标题这类需要「跳出来」的地方
  hei: "'Noto Sans SC', 'HanaMinA', serif",
  // 汇迹正楷：写刻正楷，最接近刻本手写上版
  kai: "'Huiji Zhengkai', 'HanaMinA', serif",
  // 朱雀仿宋：民国铅印仿宋，笔画瘦硬，适合排「志怪」这类笔记体
  fangsong: "'Zhuque Fangsong', 'HanaMinA', serif",
  // 仲春仿宋：聚珍仿宋二号长体，长体、老笔形，最有老铅印味
  sotyr: "'Sotyr Fangsong', 'HanaMinA', serif",
}

/** 字体显示名（设置页用） */
export const FONT_LABELS: Record<FontFamily, string> = {
  song: '思源宋',
  hei: '思源黑',
  kai: '匯跡正楷',
  fangsong: '朱雀仿宋',
  sotyr: '仲春仿宋',
}

/**
 * 每款字体在 CSS 里的**族名**（`@font-face` 的 `font-family`）。
 *
 * 只给「按需加载」用：进古籍模式时先 `document.fonts.load()` 当前选中的这一款
 * 加花园明朝兜底，加载进度条就有了确定的计数，也不至于把五款全部拖下来。
 */
export const FONT_FACES: Record<FontFamily, string> = {
  song: 'Noto Serif SC',
  hei: 'Noto Sans SC',
  kai: 'Huiji Zhengkai',
  fangsong: 'Zhuque Fangsong',
  sotyr: 'Sotyr Fangsong',
}

/** 生僻字兜底字体（五款字栈的第二级） */
export const FALLBACK_FACE = 'HanaMinA'
export const FALLBACK_LABEL = '花园明朝'

/** 默认排版偏好 */
export function defaultPrefs(): TypographyPrefs {
  return {
    font: 'kai',         // 默认正楷：最接近刻本手写上版
    fontScale: 1.4,
    engScale: 0.8,
    colGap: 0.4,         // 列间留一道气口，密排但不挤
    lineHeight: 1.1,
    headRatio: 0.16,
    marginRatio: 0.045,  // 页面左右留白（书口侧）
    gutterRatio: 1.4,    // 书口 : 订口
    punct: true,
    rules: true,
    rulesFull: false,
    swipeTurn: true,
    tapTurn: true,
  }
}

/** 默认版面配置（桌面） */
export function defaultLayoutConfig(vw: number, vh: number, prefs?: TypographyPrefs): LayoutConfig {
  const p = prefs ?? defaultPrefs()
  const mobile = vw < 768
  const base = mobile ? 16 : Math.max(17, Math.min(21, Math.round(vh / 42)))
  return {
    fontSize: Math.round(base * p.fontScale),
    cellWidthRatio: 1.08,   // 密排
    lineHeightRatio: p.lineHeight,
    spineRatio: 1.15,       // 版心 = 字格 × 1.15（略收，中缝显秀气修长）
    headRatio: p.headRatio,
    footRatio: 0.10,        // 地脚 10%
    marginRatio: p.marginRatio,
    gutterRatio: p.gutterRatio,
    navHeight: mobile ? 56 : 64,
    single: mobile,
    colGap: p.colGap,
    engScale: p.engScale,
    font: p.font,
  }
}

/** 圈点的样式（位置固定「字格下缘偏右」、朱色；只有一个开关） */
export const JUDOU: JudouConfig = {
  size: 0.34,
  color: '#b22d1e',
}

/**
 * 书框自己在四周吃掉的像素（两侧合计）：border 4×2 + 内框 outline（1.5px + 4px 偏移）×2 ≈ 19，
 * 再留 7 给阴影与取整。**必须算够** —— 少 3px 双线框就会被 `.sc` 的 overflow: hidden 切掉一条边，
 * 而手机上没有别的地方能补。
 */
const FRAME = 26

/**
 * 计算版面：视口 → 网格 → 展页。
 *
 * @param tokens 解析后的 token 流
 * @param cur 当前展页（越界会被夹到 max）
 * @param vw 视口宽
 * @param vh 视口高
 * @param cfg 版面配置（缺省用 defaultLayoutConfig）
 */
export function calcLayout(
  tokens: Token[],
  cur: number,
  vw: number,
  vh: number,
  cfg: LayoutConfig = defaultLayoutConfig(vw, vh),
): LayoutResult {
  const fs = cfg.fontSize
  // 字格宽 = 字号 × 密排系数；列间距单独加，不挤占字格
  const cw = Math.round(fs * cfg.cellWidthRatio)
  const gap = Math.round(cw * cfg.colGap)
  const colW = cw + gap          // 一列占的总宽（字格 + 间距）
  const rh = Math.round(fs * cfg.lineHeightRatio)
  const sw = Math.round(cw * cfg.spineRatio)

  // 导航绝对定位在底部，书框按 nav 高度留出空间（不压书页）
  // 单页模式没有版心、两边留白也窄，但**框外那圈双线**同样要地方，所以外边距只略收一点
  const availH = vh - cfg.navHeight - (cfg.single ? 18 : 28) - FRAME
  const availW = vw - (cfg.single ? 16 : 40) - FRAME

  const headH = Math.round(availH * cfg.headRatio)
  const footH = Math.round(availH * cfg.footRatio)
  const gridH = availH - headH - footH

  // 页面左右留白：书口侧 = 版面宽 × marginRatio，订口侧 = 书口 / gutterRatio。
  // 两个都是设置项 —— 早先前者是写死的 4.5%、后者写死 1.4，想收窄页边只能改代码。
  const outerW = Math.max(6, Math.round(availW * cfg.marginRatio))
  const innerW = Math.max(4, Math.round(outerW / cfg.gutterRatio))

  const singlePageW = cfg.single
    ? availW - innerW - outerW
    : (availW - sw - innerW * 2 - outerW * 2) / 2

  const rows = Math.max(6, Math.floor(gridH / rh))
  // 列数按「字格 + 间距」算，末列不额外留间距
  const cols = Math.max(3, Math.floor((singlePageW + gap) / colW))

  // 西文占几个槽：
  // - 正文：字号 = fs × engScale（与 CSS `.c.eng` 一致），除以行高 → 行数；
  // - 夹注：字号 = fs × 0.4（与 CSS `.c.cm.eng .eng-span` 一致），除以**半行高** → 半行槽数。
  //   两者单位与字号都不同，混用会把夹注里的英文串长算大一倍，整页预算随之崩掉。
  const engFs = fs * cfg.engScale
  const cmEngFs = fs * 0.4
  const halfRh = rh / 2
  const engSpan = (text: string, small: boolean) =>
    small
      ? Math.max(1, Math.ceil(measureEngWidth(text, cmEngFs) / halfRh))
      : Math.max(1, Math.ceil(measureEngWidth(text, engFs) / rh))

  const cells = layoutPages(tokens, cols, rows, engSpan)

  // 西文格的余量：串宽量化到整行（span × rh）之后必然有零头。
  // 这个零头**不该用字号去消化** —— 缩短字号会让同一页的字母忽大忽小；
  // 摊进字距则整串占满它占的格子。但**两头要留气口**：西文紧贴上下字会显得顶格，
  // 所以先各让出 ENG_PAD，剩下的才摊进字距，其余由 `justify-content: center` 对半分。
  // 上限 0.35em：短串（两个字占了两行）若全额摊开会拉成稀巴烂。
  const ENG_MAX_TRACK = engFs * 0.35
  const ENG_PAD = engFs * 0.3
  for (const c of cells) {
    if (!c.isEng) continue
    const n = [...c.c].length
    const slack = c.span * rh - measureEngWidth(c.c, engFs)
    // 单行的短串没有可摊的空间，靠居中留空即可
    if (c.span < 2 || n < 2) continue
    const usable = slack - ENG_PAD * 2
    if (usable <= 0) continue
    const track = Math.min(usable / n, ENG_MAX_TRACK)
    if (track > 0.01) c.els = Math.round(track * 100) / 100
  }

  const spreads: PlacedCell[][][] = []
  if (cfg.single) {
    // 单页：每个物理页自成一屏
    for (const c of cells) {
      while (spreads.length <= c.pg) spreads.push([[], []])
      spreads[c.pg]![0]!.push(c)
    }
  } else {
    for (const c of cells) {
      const s = Math.floor(c.pg / 2)
      while (spreads.length <= s) spreads.push([[], []])
      spreads[s]![c.pg % 2 === 0 ? 0 : 1]!.push(c)
    }
  }

  const max = Math.max(0, spreads.length - 1)
  const newCur = Math.min(Math.max(0, cur), max)

  // 鱼尾在版心里的上下位置：两段间距合计约 30%，按天头:地脚分配。
  // 天头 16% / 地脚 10% → 上 18.5% / 下 11.5%，也就是「黑口到鱼尾，上大于下」，
  // 跟版面本身的留白比例联动，改天头时鱼尾自己跟着走。
  const fishGap = 0.30
  const headShare = headH / (headH + footH || 1)
  const fishTopPct = fishGap * headShare
  const fishFootPct = fishGap * (1 - headShare)

  const cssVars: Record<string, string> = {
    '--rh': `${rh}px`,
    '--cw': `${cw}px`,
    '--col-w': `${colW}px`,
    '--col-gap': `${gap}px`,
    '--fs': `${fs}px`,
    '--sw': `${sw}px`,
    '--fish-top': `${(fishTopPct * 100).toFixed(2)}%`,
    '--fish-foot': `${(fishFootPct * 100).toFixed(2)}%`,
    '--cols': String(cols),
    '--rows': String(rows),
    '--head-h': `${headH}px`,
    '--foot-h': `${footH}px`,
    '--inner-w': `${innerW}px`,
    '--outer-w': `${outerW}px`,
    '--nav-h': `${cfg.navHeight}px`,
    '--eng-scale': String(cfg.engScale),
    // 偏好是 localStorage 里的字符串：删过字体选项时（如 v5.12 去掉 qiji），
    // 老存档里可能还存着已失效的值，回落到默认字栈而不是给一个空 font-family。
    '--font-stack': FONT_STACKS[cfg.font] ?? FONT_STACKS.song,
  }

  // 眉批半列能放几行小字：一行 = 半格高；天头留一成上下呼吸（见 .mbl 的 padding-top）
  const marginalRows = Math.max(1, Math.floor((headH * 0.9) / (rh / 2)))

  return { cols, rows, spreads, max, cur: newCur, single: cfg.single, marginalRows, cssVars }
}
