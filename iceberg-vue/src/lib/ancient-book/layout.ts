import { layoutPages } from './engine';
import type { Token, PlacedCell } from './types';

export interface LayoutState {
  COLS: number;
  ROWS: number;
  spreads: PlacedCell[][][];
  MAX: number;
  cur: number;
  /** 单页模式（窄屏）：一屏只显示一页，spreads 的每个元素只用 [0] */
  single: boolean;
  /** 布局 CSS 变量（F24：由视图以 :style 绑定到根元素，替代命令式 setProperty） */
  cssVars: Record<string, string>;
}

/**
 * 古籍版式计算。
 *
 * 版式依据（clreq §6.3.1 密排 / 传统古籍开本比例）：
 * - **密排**：字格宽 = 字号 × 1.08（只留汉字字面本身的侧白，不做疏排）；
 * - **天头 > 地脚**：天头占版面高 16%、地脚 10%（比例 1.6:1，合计 26%）；
 * - **订口 < 书口**：内侧 1 份、外侧 1.5 份，给装订留位；
 * - **版心**（中缝）= 字格 × 1.2，不再比字格还宽；
 * - 网格按可用空间向下取整后**再留 1 格余量**，避免取整误差把末行挤出页面。
 *
 * 字号按视口分档（古籍需要按屏幕算，属展示级例外，不走 --font-* 阶梯）。
 */
export function calcLayout(tokens: Token[], cur: number): LayoutState {
  const VW = window.innerWidth, VH = window.innerHeight;
  const mobile = VW < 768;

  // 字号：窄屏 16px、桌面 21px；再按视口高度收敛，避免小屏行数过少
  const fs = mobile ? 16 : Math.max(17, Math.min(21, Math.round(VH / 42)));
  const cw = Math.round(fs * 1.08);   // 字格宽（密排）
  const rh = Math.round(fs * 1.15);   // 行距
  const sw = Math.round(cw * 1.2);    // 版心（中缝）

  // 导航栏预留高度（含安全区），书页不再被压住
  const NAV_H = mobile ? 56 : 64;
  // 书框自身的内外边距（.bx padding 7 + border 2.5 + .bx-in border 1.2，两侧合计约 22）
  const FRAME = 22;
  const availH = VH - NAV_H - (mobile ? 10 : 28) - FRAME;
  const availW = VW - (mobile ? 10 : 40) - FRAME;

  // 天头 / 地脚：按版面高比例，天头 > 地脚
  const headH = Math.round(availH * 0.16);
  const footH = Math.round(availH * 0.10);
  const gridH = availH - headH - footH;

  // 订口 : 书口 = 1 : 1.5（内侧窄、外侧宽）
  const outerW = Math.round(availW * 0.045);
  const innerW = Math.round(outerW / 1.5);

  // 单页模式（窄屏）：一屏一页，版心宽度不再对半分
  const single = mobile;
  const singlePageW = single
    ? availW - innerW - outerW
    : (availW - sw - innerW * 2 - outerW * 2) / 2;

  // 向下取整即可：网格容器用 min() 约束，取整余量由 align/justify center 均分，
  // 不再额外减 1 格（那会让正文只占上半页）。
  const ROWS = Math.max(6, Math.floor(gridH / rh));
  const COLS = Math.max(3, Math.floor(singlePageW / cw));

  const cells = layoutPages(tokens, COLS, ROWS);

  const spreads: PlacedCell[][][] = [];
  if (single) {
    // 单页：每个物理页自成一屏，全部放进 [0]
    for (const c of cells) {
      while (spreads.length <= c.pg) spreads.push([[], []]);
      spreads[c.pg][0].push(c);
    }
  } else {
    for (const c of cells) {
      const s = Math.floor(c.pg / 2);
      while (spreads.length <= s) spreads.push([[], []]);
      (c.pg % 2 === 0 ? spreads[s][0] : spreads[s][1]).push(c);
    }
  }

  const MAX = Math.max(0, spreads.length - 1);
  const newCur = cur > MAX ? MAX : cur;

  const cssVars: Record<string, string> = {
    '--rh': rh + 'px',
    '--cw': cw + 'px',
    '--fs': fs + 'px',
    '--sw': sw + 'px',
    '--cols': String(COLS),
    '--rows': String(ROWS),
    '--head-h': headH + 'px',
    '--foot-h': footH + 'px',
    '--inner-w': innerW + 'px',
    '--outer-w': outerW + 'px',
    '--nav-h': NAV_H + 'px',
  };

  return { COLS, ROWS, spreads, MAX, cur: newCur, single, cssVars };
}
