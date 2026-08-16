import { layoutPages } from './engine';
import type { Token, PlacedCell } from './types';

export interface LayoutState {
  COLS: number;
  ROWS: number;
  spreads: PlacedCell[][][];
  MAX: number;
  cur: number;
  /** 布局 CSS 变量（F24：由视图以 :style 绑定到根元素，替代命令式 setProperty） */
  cssVars: Record<string, string>;
}

export function calcLayout(tokens: Token[], cur: number): LayoutState {
  const VW = window.innerWidth, VH = window.innerHeight;
  const fs = VW < 768 ? 16 : 21;
  const rh = Math.floor(fs * 1.15);
  const cw = Math.floor(fs * 1.65);
  const sw = Math.floor(fs * 2.2);

  const availH = VH - 100;
  const availW = VW - 40;

  const ROWS = Math.max(8, Math.floor(availH / rh) - 3);
  const singlePageW = (availW - sw - 16) / 2;
  const COLS = Math.max(3, Math.floor(singlePageW / cw) - 2);

  const cells = layoutPages(tokens, COLS, ROWS);

  const spreads: PlacedCell[][][] = [];
  for (let i = 0; i < cells.length; i++) {
    const s = Math.floor(cells[i].pg / 2);
    while (spreads.length <= s) spreads.push([[], []]);
    (cells[i].pg % 2 === 0 ? spreads[s][0] : spreads[s][1]).push(cells[i]);
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
  };

  return { COLS, ROWS, spreads, MAX, cur: newCur, cssVars };
}
