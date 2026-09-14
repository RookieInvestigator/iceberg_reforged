/**
 * wallSvg —— 词条墙导出 SVG（矢量，无限分辨率）。
 * 同一份 WallExportLayout，换个 painter：与 paintWall（canvas）逐项对应，
 * 量纲常量复用 wallExport（COVER/LEGEND/FOOTER）与 exportMetrics。
 * 文本描边走 SVG 原生 paint-order:stroke（= canvas 的 strokeText+fillText 同构）。
 */
import { COVER, FOOTER, LEGEND } from './wallExport';
import type { ExportStyle, WallExportLayout } from './wallExport';
import { V2_EXPORT_METRICS } from './exportMetrics';

/** XML 转义（标题/文案含 &<>""' 即炸，必经此处） */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function f(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 从 "400 13px ..." / "900 54px ..." 取字号（parseFloat 会误取字重，必须正则） */
function sizeOf(font: string, fallback: number): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : fallback;
}

/**
 * 渲染完整 SVG 字符串。
 * @param qrDataUrl 二维码 PNG dataURL（编排层用 qrcode 生成；null 则只画网址文字）
 */
export function renderWallSvg(
  layout: WallExportLayout,
  style: ExportStyle,
  qrDataUrl: string | null,
): string {
  const W = layout.width;
  const H = layout.height;
  const ff = esc(style.fontFamily);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${esc(style.bg)}"/>`,
  );

  // —— 题头 ——
  for (const line of layout.cover) {
    const weight = line.font.startsWith('900') ? 900 : 400;
    const size = sizeOf(line.font, COVER.metaPx);
    out.push(
      `<text x="${W / 2}" y="${f(line.baseline)}" text-anchor="middle" ` +
      `font-family="${ff}" font-size="${size}" font-weight="${weight}" ` +
      `letter-spacing="${line.letterSpacingPx}" fill="${esc(line.color)}">${esc(line.text)}</text>`,
    );
  }

  // —— 图例 ——
  const legendFont = `${LEGEND.px}px`;
  for (const r of layout.legend) {
    if (r.label) {
      out.push(
        `<text x="${W / 2}" y="${f(r.labelBaseline)}" text-anchor="middle" ` +
        `font-family="${ff}" font-size="${LEGEND.px}" font-weight="700" ` +
        `fill="${esc(style.headerColor)}">${esc(r.label)}</text>`,
      );
    }
    for (const cell of r.cells) {
      const radius = cell.h / 2;
      if (cell.color) {
        out.push(
          `<rect x="${f(cell.x)}" y="${f(r.y)}" width="${f(cell.w)}" height="${f(cell.h)}" rx="${f(radius)}" ` +
          `fill="${esc(cell.color)}" fill-opacity="0.22" stroke="${esc(cell.color)}" stroke-width="1"/>`,
        );
      } else {
        out.push(
          `<rect x="${f(cell.x)}" y="${f(r.y)}" width="${f(cell.w)}" height="${f(cell.h)}" rx="${f(radius)}" ` +
          `fill="${esc(style.tagPillBg)}"/>`,
        );
        if (cell.emoji) {
          out.push(
            `<text x="${f(cell.x + LEGEND.pillPadX)}" y="${f(cell.baseline)}" ` +
            `font-family="${ff}" font-size="${legendFont}" fill="${esc(style.tagColor)}">${esc(cell.emoji)}</text>`,
          );
        }
      }
      out.push(
        `<text x="${f(cell.textX)}" y="${f(cell.baseline)}" ` +
        `font-family="${ff}" font-size="${legendFont}" fill="${esc(style.legendColor)}">${esc(cell.text)}</text>`,
      );
    }
  }

  // —— 层级分隔线 ——
  for (const t of layout.tiers) {
    if (t.dividerY == null) continue;
    out.push(
      `<line x1="${f(t.x)}" y1="${f(t.dividerY)}" x2="${f(t.x + t.w)}" y2="${f(t.dividerY)}" ` +
      `stroke="${esc(style.dividerColor)}" stroke-width="1"/>`,
    );
  }

  // —— 层级名 ——
  for (const t of layout.tiers) {
    out.push(
      `<text x="${f(t.x + t.w / 2)}" y="${f(t.y + style.headerPx)}" text-anchor="middle" ` +
      `font-family="${ff}" font-size="${style.headerPx}" font-weight="400" ` +
      `letter-spacing="${0.35 * style.headerPx}" fill="${esc(style.headerColor)}">${esc(t.tier)}</text>`,
    );
  }

  // —— 词条 ——
  const titleFontPx = style.fontPx;
  const emojiPx = Math.round(style.fontPx * style.emojiRatio);
  for (const c of layout.chips) {
    const opacity = c.alpha === 1 ? '' : ` opacity="${c.alpha}"`;
    out.push(
      `<text x="${f(c.titleX)}" y="${f(c.baseline)}"${opacity} ` +
      `font-family="${ff}" font-size="${titleFontPx}" font-weight="700" ` +
      `fill="${esc(c.color)}" stroke="${esc(style.shadowColor)}" stroke-width="2" ` +
      `paint-order="stroke" stroke-linejoin="round">${esc(c.title)}</text>`,
    );
    const eBaseline = c.baseline - style.fontPx * V2_EXPORT_METRICS.emojiLiftEm;
    let ex = c.emojiX;
    c.emojis.forEach((e, i) => {
      out.push(
        `<text x="${f(ex)}" y="${f(eBaseline)}"${opacity} ` +
        `font-family="${ff}" font-size="${emojiPx}" fill="${esc(style.tagColor)}">${esc(e)}</text>`,
      );
      ex += c.emojiAdv[i] || 0;
    });
  }

  // —— 底部：二维码 + 网址 + 版权 ——
  if (layout.footer) {
    const fl = layout.footer;
    if (qrDataUrl) {
      out.push(
        `<image x="${f(fl.qrX)}" y="${f(fl.qrY)}" width="${f(fl.qrSize)}" height="${f(fl.qrSize)}" href="${qrDataUrl}"/>`,
      );
    }
    out.push(
      `<text x="${f(fl.textX)}" y="${f(fl.urlBaseline)}" ` +
      `font-family="${ff}" font-size="${FOOTER.urlPx}" fill="${esc(style.legendColor)}">${esc(fl.url)}</text>`,
      `<text x="${W / 2}" y="${f(fl.copyBaseline)}" text-anchor="middle" ` +
      `font-family="${ff}" font-size="${FOOTER.copyPx}" fill="${esc(style.headerColor)}">${esc(fl.copy)}</text>`,
    );
  }

  out.push('</svg>');
  return out.join('');
}

/** 下载字符串为文件（SVG 用 Blob，不走 canvas） */
export function downloadTextFile(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
