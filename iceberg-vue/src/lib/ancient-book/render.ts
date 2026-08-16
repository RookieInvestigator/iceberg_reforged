import type { PlacedCell } from './types';

/**
 * 古籍渲染纯函数（F24 重构：原 spreadHTML/cHTML 的 HTML 字符串拼接改为
 * Vue 模板渲染，此处仅保留 style/class/标点/标题的派生逻辑，供模板绑定）。
 * DOM 结构与 ancient-book.css 保持一致。
 */
export const PC = { bg: '#f5eedc', tx: '#221c18', cr: '#b22d1e', mu: '#7a6e61' };

/** 单元格 grid 定位/尺寸样式（原 cHTML 的 style 部分） */
export function cellStyle(c: PlacedCell, COLS: number, ROWS: number): string {
  if (c.cm) {
    let s = `grid-column:${c.cl + 1};grid-row:${c.rw + 1};`;
    const spanSlots = c.rs || 1;
    s += `width:calc(var(--fs)*0.5);height:calc(var(--rh)*0.5*${spanSlots});`;
    s += 'justify-self:center;align-self:start;';
    s += (c.sc === 0 ? 'margin-left:' : 'margin-right:') + 'calc(var(--fs)*0.5);';
    if (c.sr === 1) s += 'margin-top:calc(var(--rh)*0.5);';
    return s;
  }
  let style = `grid-column:${c.cl + 1};grid-row:${c.rw + 1}`;
  if (c.rs && c.rs > 1) style += ` / span ${c.rs}`;
  return style;
}

/** 单元格 class（原 cHTML 的 cls 构建部分） */
export function cellClass(c: PlacedCell): string {
  const cls = ['c'];
  if (c.cm) { cls.push('cm'); if (c.isEng) cls.push('eng'); return cls.join(' ') }
  if (c.isEng) cls.push('eng');
  if (c.hw) { cls.push('hw', 'clk'); if (c.hp) cls.push('hp'); }
  if (c.vr) cls.push('vl');
  if (c.bk) cls.push('bl');
  // 標題內的全形/半形括號
  if (c.c === '（' || c.c === '）' || c.c === '(' || c.c === ')') cls.push('paren');
  return cls.join(' ');
}

/** 标点类型：。→ stop（圆圈），、→ pause（弯钩）；无标点返回 null */
export function punctKind(pn: string | undefined): 'stop' | 'pause' | null {
  if (pn === '。') return 'stop';
  if (pn) return 'pause';
  return null;
}

/**
 * 书名页/卷名页的标题分段（原 spreadHTML 内联解析）：
 * 按 hw 字符收集，遇换行或全角空格分段。
 */
export function titleParts(cells: PlacedCell[]): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const cell of cells) {
    if (cell.c === '⚑' || cell.c === '⚐' || cell.c === '\f') continue;
    if (cell.nl) { if (cur) { parts.push(cur); cur = ''; } continue; }
    if (cell.hw) {
      if (cell.c === '　') { if (cur) { parts.push(cur); cur = ''; } }
      else { cur += cell.c + (cell.pn || ''); }
    }
  }
  if (cur) parts.push(cur);
  return parts;
}
