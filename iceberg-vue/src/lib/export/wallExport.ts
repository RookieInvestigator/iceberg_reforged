/**
 * wallExport —— 2D 词条墙导出 PNG（独立实现，仅借归档 canvas 实验的设计思路，
 * 归档代码原地不动：data/archive/tools-2026-08/canvas-experiment/）。
 *
 * 量纲以主界面 v2 为基准（V2TierChapter.vue / index.css），导出按海报观感整体放大一档：
 * - 题头海报级：眉题 13 / 标题 54 / meta 13 / intro 15；
 * - 章节：层间距 52，层级名 13px/400/0.35em/居中/下间距 36，仅 tier 名；
 * - 容器：flex-wrap 居中，gap-x 20px / gap-y 16px，内容左右留白 60px；
 * - 芯片：胶囊 pill（透明底），padding 12.8px 4.8px，700 / 行高 1.4 / 字号 1.15em，
 *   2px 居中描边 + 原字 fill；
 * - emoji：0.625em，左间距 0.3em，上移 0.08em，无描边；
 * - 状态：全透明快照（read/dim/NEW 一律不画）；
 * - 错落偏移与生产同公式（id 哈希，floatMode=none 时跳过）；
 * - 清晰度：dpr 档 [3, 2.5, 2, 1.5, 1.25, 1]，内存预算 + 单图高度约束逐档降。
 *
 * 取舍（导出一次成像，不做交互）：
 * - 布局纯函数，度量器注入；绘制直接 paint（1440 芯片一次成像可接受，无精灵缓存）；
 * - happy-dom 无 canvas：单测只覆盖纯布局部分。
 */

export interface ExportItem {
  id: string
  tier: string
  title: string
  categoryColor: string
  emojis: string[]
}

/** 生产侧状态快照：hide 模式可见集合（dim/read 一律不画，全透明快照） */
export interface ExportState {
  /** null = 全部可见；Set = 仅这些可见 */
  visible: Set<string> | null
}

export interface ExportStyle {
  /** 芯片字号 px（已含 1.15em 换算，见调用方） */
  fontPx: number
  fontFamily: string
  /** 以下 px 均以 16px 根换算，见 V2TierChapter scoped（rem→px @16） */
  padX: number
  padY: number
  gapX: number
  gapY: number
  contentPadX: number
  tierPadY: number
  headerPx: number
  headerMarginBottom: number
  bg: string
  headerColor: string
  titleColor: string
  introColor: string
  tagColor: string
  shadowColor: string
  /** 图例文字色 */
  legendColor: string
  /** tag 胶囊底（弱化） */
  tagPillBg: string
  /** 层级分隔线色（生产无此线，导出专用：1px 发丝线，居 tier 间距中线） */
  dividerColor: string
  emojiRatio: number
  /** false = 跳过错落偏移（跟随 floatMode=none） */
  float: boolean
}

import { V2_EXPORT_METRICS } from './exportMetrics';

/** 图例输入（调用方从 CATEGORY_COLORS_KEY / TAG_MAP_KEY 组装；空数组=该组不画） */
export interface LegendInput {
  categoriesLabel: string
  tagsLabel: string
  categories: Array<{ name: string; color: string }>
  tags: Array<{ emoji: string; name: string }>
}

export interface LegendCell {
  x: number
  w: number
  h: number
  /** 分类胶囊边框/底色；tag 胶囊为 null（走弱化底） */
  color: string | null
  emoji: string | null
  text: string
  textX: number
  baseline: number
}

export interface LegendRow {
  y: number
  h: number
  label: string | null
  labelX: number
  labelBaseline: number
  cells: LegendCell[]
}

/** 图例量纲：14px 行，组标题 bold，胶囊内边距 11/7，项间距 16，行距 12，组隔 16，区上下 10 */
export const LEGEND = {
  px: 14, labelGap: 14, itemGap: 16, rowGap: 12, groupGap: 16,
  pillPadX: 11, pillPadY: 7, secTop: 10, secBottom: 10,
} as const;

export interface TextMetrics {
  width: number
  ascent: number
}
export type TextMeasurer = (text: string, font: string, emoji: boolean) => TextMetrics

export interface ChipRect {
  id: string
  tier: string
  x: number
  y: number
  w: number
  h: number
  title: string
  titleW: number
  titleX: number
  baseline: number
  color: string
  emojis: string[]
  /** 逐 emoji 步进（含 2px 间隙，布局期量好，canvas/SVG 共用） */
  emojiAdv: number[]
  emojiX: number
  alpha: number
}

export interface TierBlock {
  tier: string
  x: number
  y: number
  w: number
  h: number
  count: number
  /** 层级名带高（含下间距，供切分避让） */
  headerH: number
  /** 下方分隔线 y（CSS px；末层为 null，不画） */
  dividerY: number | null
}

export interface FooterLine {
  /** 当前网址（canonical 优先） */
  url: string
  qrSize: number
  qrX: number
  qrY: number
  /** 左侧两行文字（网址 + 版权，左对齐） */
  textX: number
  urlBaseline: number
  copyBaseline: number
  blockY: number
  blockH: number
  /** 顶部收束线 y（内容宽 1px 发丝线，与层级分隔线同色） */
  ruleY: number
  /** 版权行 */
  copy: string
  /** 编排层生成的二维码位图（绘制前挂载） */
  qrEl: HTMLCanvasElement | null
}

/** 底部二维码块量纲：左两行文字 + 右 72px 码；行距宽松，上隔 24，下留白 48 */
export const FOOTER = {
  qrPx: 72, gap: 24, urlPx: 13, urlBox: 19.5, textGap: 8, copyPx: 11, copyBox: 16.5,
  gapTop: 24, padBottom: 48,
} as const;

export interface WallExportLayout {
  chips: ChipRect[]
  tiers: TierBlock[]
  cover: CoverLine[]
  legend: LegendRow[]
  footer: FooterLine | null
  width: number
  height: number
}

/** 题头行（调用方传 V2Header 同款三件套；绘制时逐行居中） */
export interface CoverInput {
  kicker: string
  title: string
  meta: string
  intro: string
}

export interface CoverLine {
  text: string
  font: string
  color: string
  letterSpacingPx: number
  baseline: number
  maxWidth: number
}

/** 题头量纲：海报级（比网页 masthead 大一号，导出图是独立画面）：
 * 上 64 / 眉题 13 / 隔 20 / 标题 54 / 隔 20 / meta 13 / intro 隔 24 + 15px×1.9 / 底 20 */
export const COVER = {
  padTop: 64, kickerPx: 13, gap1: 20, titlePx: 54, gap2: 20, metaPx: 13,
  introGap: 24, introPx: 15, introLineH: 1.9, introMaxW: 640, padBottom: 20,
} as const;

const ELLIPSIS = '…';

/**
 * 错落偏移（与生产 floatOffset.ts 同公式：id 哈希 translate；
 * 此处重写而非引用——导出模块零依赖生产组件，公式变更时单测会先响）。
 */
export function floatOffsetOf(id: string): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return { x: (h % 300) / 100 - 1.5, y: ((h * 37) % 600) / 100 - 3 };
}

function alphaFor(_id: string, _st: ExportState): number {
  return 1; // 导出快照不画 read/dim 弱化
}

/** 贪心行排：下标数组（flex-wrap 行内居中前半段；芯片与图例共用） */
function flowRows(widths: number[], availW: number, gapX: number): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  let rowW = 0;
  widths.forEach((w, i) => {
    if (row.length && rowW + gapX + w > availW) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(i);
    rowW += (row.length > 1 ? gapX : 0) + w;
  });
  if (row.length) rows.push(row);
  return rows;
}

/**
 * 整墙布局：逐层（层级名行 + 词条 flex-wrap 行排，行内居中）。
 * visible 非空时仅排布可见词条（与生产 v-show 移除流内一致，不留空洞）。
 */
export function layoutWall(
  items: ExportItem[],
  tierOrder: string[],
  width: number,
  style: ExportStyle,
  state: ExportState,
  measure: TextMeasurer,
  titleColorOf: (item: ExportItem) => string,
  cover?: CoverInput,
  legend?: LegendInput,
  footerUrl?: string,
  footerCopy?: string,
): WallExportLayout {
  const availW = Math.max(80, width - style.contentPadX * 2);
  const lineH = style.fontPx * V2_EXPORT_METRICS.lineHeight;
  const chipH = style.padY * 2 + lineH;
  const titleFont = `700 ${style.fontPx}px ${style.fontFamily}`;
  const emojiPx = style.fontPx * style.emojiRatio;
  const emojiFont = `${emojiPx}px ${style.fontFamily}`;
  const emojiGapPx = style.fontPx * V2_EXPORT_METRICS.emojiGapEm;

  const chips: ChipRect[] = [];
  const tiers: TierBlock[] = [];
  const coverLines: CoverLine[] = [];
  const legendRows: LegendRow[] = [];
  // —— 题头：眉题 / 标题 / meta / intro 逐行居中（无题头输入则高度为 0，不占位）——
  let y = 0;
  if (cover && (cover.kicker || cover.title || cover.meta || cover.intro)) {
    y = COVER.padTop;
    const center = (text: string, font: string, color: string, lsPx: number, boxH: number): void => {
      const m = measure(text, font, false);
      coverLines.push({ text, font, color, letterSpacingPx: lsPx, baseline: y + m.ascent, maxWidth: width });
      y += boxH;
    };
    if (cover.kicker) {
      center(cover.kicker, `400 ${COVER.kickerPx}px ${style.fontFamily}`, style.headerColor, COVER.kickerPx * 0.5, COVER.kickerPx + COVER.gap1);
    }
    if (cover.title) {
      center(cover.title, `900 ${COVER.titlePx}px ${style.fontFamily}`, style.titleColor, COVER.titlePx * 0.18, COVER.titlePx * 1.2 + COVER.gap2);
    }
    if (cover.meta) {
      center(cover.meta, `400 ${COVER.metaPx}px ${style.fontFamily}`, style.headerColor, COVER.metaPx * 0.2, COVER.metaPx + (cover.intro ? COVER.introGap : 0));
    }
    if (cover.intro) {
      // intro 按 620px 宽贪心换行（white-space: pre-wrap 语义：先按换行符分段）
      const font = `400 ${COVER.introPx}px ${style.fontFamily}`;
      const lineH = COVER.introPx * COVER.introLineH;
      for (const para of cover.intro.split('\n')) {
        let line = '';
        const flush = (): void => {
          if (!line) return;
          const m = measure(line, font, false);
          coverLines.push({
            text: line, font, color: style.introColor, letterSpacingPx: 0,
            baseline: y + m.ascent, maxWidth: COVER.introMaxW,
          });
          y += lineH;
          line = '';
        };
        for (const ch of para) {
          const test = line + ch;
          if (measure(test, font, false).width > COVER.introMaxW && line) flush();
          line += ch;
        }
        flush();
      }
    }
    y += COVER.padBottom;
  }

  // —— 图例：分类色点 + tag 释义（题头之后、首层之前；空组不画，整区为空零高度）——
  if (legend && (legend.categories.length || legend.tags.length)) {
    const legendFont = `${LEGEND.px}px ${style.fontFamily}`;
    const legendLabelFont = `700 ${LEGEND.px}px ${style.fontFamily}`;
    y += LEGEND.secTop;
    const layItems = (
      label: string,
      cellWs: number[],
      make: (x: number, yy: number, i: number) => LegendCell,
    ): void => {
      const lm = measure(label, legendLabelFont, false);
      legendRows.push({
        y, h: LEGEND.px, label,
        labelX: style.contentPadX + (availW - lm.width) / 2,
        labelBaseline: y + lm.ascent, cells: [],
      });
      y += LEGEND.px + LEGEND.labelGap;
      const pillH = LEGEND.px + LEGEND.pillPadY * 2;
      for (const idx of flowRows(cellWs, availW, LEGEND.itemGap)) {
        const total = idx.reduce((s, i) => s + cellWs[i], 0) + LEGEND.itemGap * (idx.length - 1);
        let cx = style.contentPadX + (availW - total) / 2;
        const cells: LegendCell[] = [];
        for (const i of idx) {
          cells.push(make(cx, y, i));
          cx += cellWs[i] + LEGEND.itemGap;
        }
        legendRows.push({ y, h: pillH, label: null, labelX: 0, labelBaseline: 0, cells });
        y += pillH + LEGEND.rowGap;
      }
      y += LEGEND.groupGap - LEGEND.rowGap;
    };
    if (legend.categories.length) {
      const ws = legend.categories.map((c) => {
        const nw = measure(c.name, legendFont, false).width;
        return LEGEND.pillPadX * 2 + nw;
      });
      layItems(legend.categoriesLabel, ws, (x, yy, i) => {
        const c = legend.categories[i];
        const m = measure(c.name, legendFont, false);
        return {
          x, w: ws[i], h: LEGEND.px + LEGEND.pillPadY * 2,
          color: c.color, emoji: null, text: c.name,
          textX: x + LEGEND.pillPadX, baseline: yy + LEGEND.pillPadY + m.ascent,
        };
      });
    }
    if (legend.tags.length) {
      const ews = legend.tags.map((tg) => {
        const ew = measure(tg.emoji, legendFont, true).width;
        const nw = measure(tg.name, legendFont, false).width;
        return LEGEND.pillPadX * 2 + ew + 4 + nw;
      });
      layItems(legend.tagsLabel, ews, (x, yy, i) => {
        const tg = legend.tags[i];
        const ew = measure(tg.emoji, legendFont, true).width;
        const m = measure(tg.name, legendFont, false);
        return {
          x, w: ews[i], h: LEGEND.px + LEGEND.pillPadY * 2,
          color: null, emoji: tg.emoji, text: tg.name,
          textX: x + LEGEND.pillPadX + ew + 4, baseline: yy + LEGEND.pillPadY + m.ascent,
        };
      });
    }
    y += LEGEND.secBottom - LEGEND.groupGap;
  }
  // 首层顶距（无题头无图例时即初始 tierPadY，与原语义一致）
  y += style.tierPadY;

  const byTier = new Map<string, ExportItem[]>();
  for (const it of items) {
    if (state.visible && !state.visible.has(it.id)) continue;
    if (!byTier.has(it.tier)) byTier.set(it.tier, []);
    byTier.get(it.tier)!.push(it);
  }

  for (const tier of tierOrder) {
    const list = byTier.get(tier) || [];
    if (!list.length) continue;
    const headerH = style.headerPx + style.headerMarginBottom;
    const rowY0 = y + headerH;
    // —— 行排：贪心 flex-wrap（flowRows）——
    const chipW = (it: ExportItem): { w: number; title: string; titleW: number; adv: number[] } => {
      let title = it.title;
      let titleW = measure(title, titleFont, false).width;
      const maxTitleW = availW - style.padX * 2 - (it.emojis.length ? emojiGapPx + emojiPx : 0);
      while (title.length > 1 && titleW > maxTitleW) {
        title = title.slice(0, -1);
        titleW = measure(title + ELLIPSIS, titleFont, false).width;
      }
      if (title !== it.title) {
        title += ELLIPSIS;
        titleW = measure(title, titleFont, false).width;
      }
      let w = style.padX * 2 + titleW;
      const adv: number[] = [];
      if (it.emojis.length) {
        w += emojiGapPx;
        for (const e of it.emojis) {
          const ew = measure(e, emojiFont, true).width + 2;
          adv.push(ew);
          w += ew;
        }
      }
      return { w, title, titleW, adv };
    };
    const widths = new Map<string, { w: number; title: string; titleW: number; adv: number[] }>();
    const ws: number[] = [];
    for (const it of list) {
      const cw = chipW(it);
      widths.set(it.id, cw);
      ws.push(cw.w);
    }
    // —— 落位：行内居中 ——
    const rows = flowRows(ws, availW, style.gapX).map((idx) => idx.map((i) => list[i]));
    let cy = rowY0;
    for (const r of rows) {
      const total = r.reduce((s, it) => s + widths.get(it.id)!.w, 0) + style.gapX * (r.length - 1);
      let cx = style.contentPadX + (availW - total) / 2;
      for (const it of r) {
        const cw = widths.get(it.id)!;
        let fx = 0;
        let fy = 0;
        if (style.float) ({ x: fx, y: fy } = floatOffsetOf(it.id));
        const m = measure(cw.title, titleFont, false);
        chips.push({
          id: it.id,
          tier,
          x: cx + fx,
          y: cy + fy,
          w: cw.w,
          h: chipH,
          title: cw.title,
          titleW: cw.titleW,
          titleX: cx + fx + style.padX,
          baseline: cy + fy + style.padY + m.ascent,
          color: titleColorOf(it),
          emojis: it.emojis,
          emojiAdv: cw.adv,
          emojiX: cx + fx + style.padX + cw.titleW + emojiGapPx,
          alpha: alphaFor(it.id, state),
        });
        cx += cw.w + style.gapX;
      }
      cy += chipH + style.gapY;
    }
    const blockH = headerH + rows.length * chipH + style.gapY * (rows.length - 1);
    tiers.push({ tier, x: style.contentPadX, y, w: availW, h: blockH, count: list.length, headerH, dividerY: null });
    y += blockH + style.tierPadY;
  }

  // 分隔线：除末层外，每层下方间距中线一条（y 为块底 + 半个 tierPadY）
  for (let i = 0; i < tiers.length - 1; i++) {
    tiers[i].dividerY = tiers[i].y + tiers[i].h + style.tierPadY / 2;
  }
  if (tiers.length) tiers[tiers.length - 1].dividerY = null;

  // —— 底部二维码块：左两行文字（网址+版权，左对齐）+ 右小码（无输入则零高度）——
  let footer: FooterLine | null = null;
  if (footerUrl) {
    const urlFont = `${FOOTER.urlPx}px ${style.fontFamily}`;
    const copyFont = `${FOOTER.copyPx}px ${style.fontFamily}`;
    const copy = footerCopy || '';
    const urlM = measure(footerUrl, urlFont, false);
    const copyM = measure(copy, copyFont, false);
    const qrX = width - style.contentPadX - FOOTER.qrPx;
    const textX = style.contentPadX;
    y += FOOTER.gapTop;
    const ruleY = y - FOOTER.gapTop / 2;
    const textTop = y + (FOOTER.qrPx - (FOOTER.urlBox + FOOTER.textGap + FOOTER.copyBox)) / 2;
    footer = {
      url: footerUrl,
      qrSize: FOOTER.qrPx,
      qrX,
      qrY: y,
      textX,
      urlBaseline: textTop + urlM.ascent,
      copyBaseline: textTop + FOOTER.urlBox + FOOTER.textGap + copyM.ascent,
      blockY: y,
      blockH: FOOTER.qrPx,
      ruleY,
      copy,
      qrEl: null,
    };
    y += FOOTER.qrPx + FOOTER.padBottom;
  }

  return { chips, tiers, cover: coverLines, legend: legendRows, footer, width, height: Math.ceil(y) };
}

/** 单块绘制（y0Css：切片起点 CSS px，用于超高分片；单文件时为 0） */
export function paintWall(
  ctx: CanvasRenderingContext2D,
  layout: WallExportLayout,
  style: ExportStyle,
  y0Css: number,
  sliceHCss: number,
): void {
  const headerFont = `400 ${style.headerPx}px ${style.fontFamily}`;
  const titleFont = `700 ${style.fontPx}px ${style.fontFamily}`;
  const emojiFont = `${Math.round(style.fontPx * style.emojiRatio)}px ${style.fontFamily}`;
  const y1Css = y0Css + sliceHCss;

  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, layout.width, sliceHCss);

  // 居中绘制统一走 textAlign=center（手算字距在英文长串下必偏，见眉题事故）
  const centeredText = (text: string, cx: number, baseline: number): void => {
    const prev = ctx.textAlign;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, baseline);
    ctx.textAlign = prev;
  };

  // 题头逐行居中
  ctx.textBaseline = 'alphabetic';
  const setLS = (px: number): void => {
    try {
      (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
    } catch { /* 旧浏览器忽略 */ }
  };
  for (const line of layout.cover) {
    if (line.baseline > y1Css || line.baseline < y0Css) continue;
    ctx.globalAlpha = 1;
    ctx.font = line.font;
    setLS(line.letterSpacingPx);
    ctx.fillStyle = line.color;
    centeredText(line.text, layout.width / 2, line.baseline);
  }
  setLS(0);

  // 图例：组标题居中；分类=彩色胶囊（染色底 + 同色描边 + 白字），tag=弱化底胶囊
  const legendFont = `${LEGEND.px}px ${style.fontFamily}`;
  const legendLabelFont = `700 ${LEGEND.px}px ${style.fontFamily}`;
  for (const r of layout.legend) {
    if (r.y > y1Css || r.y + r.h < y0Css) continue;
    ctx.globalAlpha = 1;
    if (r.label) {
      ctx.font = legendLabelFont;
      ctx.fillStyle = style.headerColor;
      centeredText(r.label, layout.width / 2, r.labelBaseline);
    }
    ctx.font = legendFont;
    for (const cell of r.cells) {
      const radius = cell.h / 2;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(cell.x, r.y, cell.w, cell.h, radius);
      else ctx.rect(cell.x, r.y, cell.w, cell.h);
      if (cell.color) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = cell.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.strokeStyle = cell.color;
        ctx.stroke();
        ctx.fillStyle = style.legendColor;
      } else {
        ctx.fillStyle = style.tagPillBg;
        ctx.fill();
        ctx.fillStyle = style.tagColor;
        if (cell.emoji) ctx.fillText(cell.emoji, cell.x + LEGEND.pillPadX, cell.baseline);
        ctx.fillStyle = style.legendColor;
      }
      ctx.fillText(cell.text, cell.textX, cell.baseline);
    }
  }

  // 层级分隔线：1px 发丝线，内容宽，居间距中线（生产无此线，导出专用）
  ctx.globalAlpha = 1;
  ctx.strokeStyle = style.dividerColor;
  ctx.lineWidth = 1;
  for (const t of layout.tiers) {
    if (t.dividerY == null || t.dividerY < y0Css || t.dividerY > y1Css) continue;
    ctx.beginPath();
    ctx.moveTo(t.x, t.dividerY);
    ctx.lineTo(t.x + t.w, t.dividerY);
    ctx.stroke();
  }

  // 层级名：居中（textAlign，不手算）
  ctx.textBaseline = 'alphabetic';
  setLS(0.35 * style.headerPx);
  for (const t of layout.tiers) {
    if (t.y > y1Css || t.y + t.h < y0Css) continue;
    ctx.globalAlpha = 1;
    ctx.font = headerFont;
    ctx.fillStyle = style.headerColor;
    centeredText(t.tier, t.x + t.w / 2, t.y + style.headerPx);
  }
  setLS(0);

  // 底部二维码块：收束线 + 左两行文字 + 右小码
  if (layout.footer) {
    const f = layout.footer;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.dividerColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(style.contentPadX, f.ruleY);
    ctx.lineTo(layout.width - style.contentPadX, f.ruleY);
    ctx.stroke();
    if (f.qrEl) ctx.drawImage(f.qrEl, f.qrX, f.qrY, f.qrSize, f.qrSize);
    ctx.font = `${FOOTER.urlPx}px ${style.fontFamily}`;
    ctx.fillStyle = style.legendColor;
    ctx.fillText(f.url, f.textX, f.urlBaseline);
    ctx.font = `${FOOTER.copyPx}px ${style.fontFamily}`;
    ctx.fillStyle = style.headerColor;
    ctx.fillText(f.copy, f.textX, f.copyBaseline);
  }

  for (const c of layout.chips) {
    if (c.y > y1Css || c.y + c.h < y0Css) continue;
    ctx.globalAlpha = c.alpha;
    ctx.font = titleFont;
    // 生产描边近似：2px 居中 stroke（镜像层）+ 原字 fill 盖住内半圈
    ctx.lineWidth = 2;
    ctx.strokeStyle = style.shadowColor;
    ctx.strokeText(c.title, c.titleX, c.baseline);
    ctx.fillStyle = c.color;
    ctx.fillText(c.title, c.titleX, c.baseline);
    // emoji：0.625em，上移 0.08em，无描边（与生产一致）；步进用布局期量好的 advance
    ctx.font = emojiFont;
    ctx.fillStyle = style.tagColor;
    let ex = c.emojiX;
    const eBaseline = c.baseline - style.fontPx * V2_EXPORT_METRICS.emojiLiftEm;
    c.emojis.forEach((e, i) => {
      ctx.fillText(e, ex, eBaseline);
      ex += c.emojiAdv[i] || 0;
    });
  }
  ctx.globalAlpha = 1;
}

export interface ExportPngOptions {
  items: ExportItem[]
  tierOrder: string[]
  style: ExportStyle
  state: ExportState
  titleColorOf: (item: ExportItem) => string
  /** 题头三件套（V2Header 同款；不传则无题头） */
  cover?: CoverInput
  /** 图例（分类色点 + tag 释义；不传则无图例） */
  legend?: LegendInput
  /** 底部二维码块的网址（不传则无；调用方传 canonical 优先的当前网址） */
  footer?: string
  /** 底部版权行（footer 传了才生效） */
  footerCopy?: string
  /** 导出宽（CSS px，默认 1920：全墙单图必须≥1600 才装得进 16384 高度上限，见下） */
  widthPx?: number
  /** 期望 dpr（默认设备值，封顶 3；内存/高度约束逐档降） */
  dpr?: number
  /** 切图模式（默认 full；tier 按层各一文件） */
  slice?: PngSliceMode
  /** 均匀切图张数（slice=even 时有效，默认 3，钳制 [2, 32]） */
  sliceCount?: number
  /** 位图内存预算 MB（默认 150；dpr² 是主乘数，见归档 capDpr 同款逻辑） */
  budgetMB?: number
  filename?: string
  onProgress?: (done: number, total: number) => void
}

/** 布局构建输入（PNG/SVG 双 painter 共用；度量走离屏 canvas，不落文件） */
export type LayoutBuildOptions = Pick<
  ExportPngOptions,
  'items' | 'tierOrder' | 'style' | 'state' | 'titleColorOf' | 'cover' | 'legend' | 'footer' | 'footerCopy' | 'widthPx'
>;

/** 纯布局构建（浏览器侧；单测用 layoutWall + 假度量，不走这里） */
export function buildWallLayout(o: LayoutBuildOptions): WallExportLayout {
  // 1920 是单图下限：1280 宽墙高达 20352px，连 dpr1 都超 16384 上限（必然断裂）；
  // 1920 宽约 13229px，dpr1 安全着陆（数字为近似度量，±10%）。
  const width = o.widthPx || 1920;
  const measurer = document.createElement('canvas').getContext('2d');
  if (!measurer) throw new Error('canvas 2d unavailable');
  const measure: TextMeasurer = (text, font, emoji) => {
    measurer.font = font;
    const m = measurer.measureText(text);
    const ascent = emoji
      ? o.style.fontPx * 0.8
      : m.actualBoundingBoxAscent || o.style.fontPx * 0.8;
    return { width: m.width, ascent };
  };
  return layoutWall(
    o.items, o.tierOrder, width, o.style, o.state, measure,
    o.titleColorOf, o.cover, o.legend, o.footer, o.footerCopy || '',
  );
}

export interface ExportPngResult {
  files: number
  width: number
  height: number
}

/** 切图模式：full 整图单文件 / tier 按层各一文件（层块小，dpr 余量足）/ even N 等分（边界吸附空隙，不断字） */
export type PngSliceMode = 'full' | 'tier' | 'even';

/** 按层切片盒（纯布局派生，可单测） */
export interface TierSlice {
  tier: string
  y0: number
  h: number
}
export function tierSliceBoxes(layout: WallExportLayout): TierSlice[] {
  return layout.tiers.map((t) => ({ tier: t.tier, y0: t.y, h: t.h }));
}

/**
 * 均匀切分边界（纯函数，可单测）：N 等分后逐个下移到最近空隙，
 * 空隙 = 不与任何已占区间（芯片/层级名/图例行/题头行/页脚块）相交。
 */
export function evenSliceBounds(layout: WallExportLayout, n: number): number[] {
  const total = layout.height;
  const count = Math.max(2, Math.min(Math.floor(n) || 2, 32));
  const occ: Array<[number, number]> = [];
  for (const c of layout.chips) occ.push([c.y, c.y + c.h]);
  for (const t of layout.tiers) occ.push([t.y, t.y + t.headerH]);
  for (const r of layout.legend) occ.push([r.y, r.y + r.h]);
  for (const line of layout.cover) {
    const size = /(\d+(?:\.\d+)?)px/.exec(line.font);
    const px = size ? parseFloat(size[1]) : 12;
    occ.push([line.baseline - px, line.baseline + px * 0.25]);
  }
  if (layout.footer) occ.push([layout.footer.blockY, layout.footer.blockY + layout.footer.blockH]);
  const clear = (b: number): number => {
    // 落在已占区间内则下移到区间末（循环直到干净，最多全扫一遍）
    for (let k = 0; k < occ.length; k++) {
      const hit = occ.find(([a, c]) => b > a && b < c);
      if (!hit) return b;
      b = hit[1];
    }
    return b;
  };
  const bounds = [0];
  for (let i = 1; i < count; i++) {
    // 单调递增：至少比上一边界多 1px，且给剩余切片留 1px
    const b = Math.min(clear((total * i) / count), total - (count - i));
    bounds.push(Math.max(b, bounds[i - 1] + 1));
  }
  bounds.push(total);
  return bounds;
}

const MAX_CANVAS_PX = 16384; // 单 canvas 高上限（设备 px）；
  // 单图导出：dpr 在"贴近设备值 / 内存预算"之外再受高度约束，不切片。

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/**
 * 导出 PNG 主流程（调用方负责懒加载本模块，不进首屏包）：
 * 度量 → 布局 → dpr 封顶 → 绘制 → 下载。slice=tier 时按层各一文件。
 */
export async function exportWallPng(opts: ExportPngOptions): Promise<ExportPngResult> {
  const layout = buildWallLayout(opts);
  if (!layout.chips.length && !layout.cover.length) throw new Error('empty');

  const want = Math.max(1, Math.min(opts.dpr || window.devicePixelRatio || 1, 3));
  const budget = (opts.budgetMB || 150) * 1e6;
  /** 给定绘制高选 dpr（内存预算 + 单块高度上限逐档降） */
  const pickDpr = (hCss: number): number => {
    for (const d of [3, 2.5, 2, 1.5, 1.25, 1]) {
      if (d > want) continue;
      if (layout.width * hCss * d * d * 4 > budget) continue;
      if (Math.ceil(hCss * d) > MAX_CANVAS_PX) continue;
      return d;
    }
    return 1;
  };

  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = (opts.filename || `iceberg-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}`).replace(/\.png$/, '');

  async function renderBox(y0: number, hCss: number, suffix: string): Promise<void> {
    const dpr = pickDpr(hCss);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(layout.width * dpr);
    canvas.height = Math.ceil(hCss * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    ctx.scale(dpr, dpr);
    ctx.translate(0, -y0);
    paintWall(ctx, layout, opts.style, y0, hCss);
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    // 让出主线程：多文件时避免长任务卡死
    await new Promise((r) => setTimeout(r, 0));
  }

  if (opts.slice === 'tier') {
    // 按层切：只要层块（题头/图例/页脚不进分片），dpr 按小块重选（通常能吃满）
    const boxes = tierSliceBoxes(layout);
    let i = 0;
    for (const b of boxes) {
      await renderBox(b.y0, b.h, `-${i + 1}`);
      opts.onProgress?.(i + 1, boxes.length);
      i++;
    }
    return { files: boxes.length, width: layout.width, height: layout.height };
  }

  if (opts.slice === 'even') {
    // 均匀切：N 等分 + 边界吸附空隙（不断字）；题头/页脚自然落入首末片
    const bounds = evenSliceBounds(layout, opts.sliceCount || 3);
    if (layout.footer && opts.footer) {
      const { default: QRCode } = await import('qrcode');
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, opts.footer, { width: FOOTER.qrPx * 2, margin: 1 });
      layout.footer.qrEl = qrCanvas;
    }
    for (let i = 0; i < bounds.length - 1; i++) {
      const h = bounds[i + 1] - bounds[i];
      if (h <= 0) { opts.onProgress?.(i + 1, bounds.length - 1); continue; }
      await renderBox(bounds[i], h, `-${i + 1}`);
      opts.onProgress?.(i + 1, bounds.length - 1);
    }
    return { files: bounds.length - 1, width: layout.width, height: layout.height };
  }

  // 整图：dpr 受全高约束；二维码 dpr 倍清晰度先行生成
  const dpr = pickDpr(layout.height);
  if (layout.footer && opts.footer) {
    const { default: QRCode } = await import('qrcode');
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, opts.footer, {
      width: Math.ceil(FOOTER.qrPx * dpr),
      margin: 1,
    });
    layout.footer.qrEl = qrCanvas;
  }
  await renderBox(0, layout.height, '');
  opts.onProgress?.(1, 1);
  return { files: 1, width: layout.width, height: layout.height };
}
