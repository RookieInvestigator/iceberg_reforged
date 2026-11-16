import type { PlacedCell } from './types';

/**
 * 古籍渲染纯函数（F24 重构：原 spreadHTML/cHTML 的 HTML 字符串拼接改为
 * Vue 模板渲染，此处仅保留 style/class/标点/标题的派生逻辑，供模板绑定）。
 * DOM 结构与 ancient-book.css 保持一致。
 */
export const PC = { bg: '#f5eedc', tx: '#221c18', cr: '#b22d1e', mu: '#7a6e61' };

/**
 * 单元格 grid 定位/尺寸样式。
 *
 * 双行小字（古籍「小字双行」）：一个大字格内放两列小字，每列占半格宽；
 * 每列可放 2 个字 —— 即**一格 4 个小字**（2 列 × 2 字）。
 *
 * 定位要点：`.gd` 是 `direction: rtl`，`justify-self: start` 在 rtl 下
 * 已经贴**右**边缘，所以右列（sc=0）不需要位移，左列（sc=1）左移半格。
 * （上一版误加 `+cw/2`，导致整块小字偏右半格。）
 */
export function cellStyle(c: PlacedCell, COLS: number, ROWS: number): string {
  if (c.cm) {
    let s = `grid-area:${c.rw + 1} / ${c.cl + 1};`;
    s += `width:calc(var(--cw) * 0.5);height:calc(var(--rh) * 0.5);`;
    s += 'justify-self:start;align-self:start;';
    // rtl 下 start = 右边缘：右列原位，左列左移半格
    const dx = c.sc === 0 ? '0px' : 'calc(var(--cw) * -0.5)';
    const dy = c.sr === 1 ? 'calc(var(--rh) * 0.5)' : '0px';
    s += `transform:translate(${dx}, ${dy});`;
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
 * 书名页/卷名页的标题分段。
 *
 * 只取**本页标题本身**：从 `⚑`/`⚐` 之后开始，到第一个非 hw 单元格为止。
 * 旧实现把所有 hw 都收进来，导致卷首页把后续词条标题也拼进大字标题里
 * （「廣知一北京公交车三七五…」挤成一团）。
 */
export function titleParts(cells: PlacedCell[]): string[] {
  const parts: string[] = [];
  let cur = '';
  let started = false;
  for (const cell of cells) {
    if (cell.c === '⚑' || cell.c === '⚐') { started = true; continue; }
    if (!started) continue;
    if (cell.c === '\f') break;
    if (cell.nl) { if (cur) { parts.push(cur); cur = ''; } continue; }
    // 标题结束：遇到非 hw 单元格（正文/夹注）就停
    if (!cell.hw) break;
    if (cell.c === '　') { if (cur) { parts.push(cur); cur = ''; } }
    else { cur += cell.c + (cell.pn || ''); }
  }
  if (cur) parts.push(cur);
  return parts;
}
