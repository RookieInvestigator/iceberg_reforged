import type { PlacedCell } from './types';
import { toChineseNum } from './engine';

export const PC = { bg: '#f5eedc', tx: '#221c18', cr: '#b22d1e', mu: '#7a6e61' };

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function cHTML(c: PlacedCell, COLS: number, ROWS: number): string {
  if (c.cm) {
    let s = `grid-column:${c.cl + 1};grid-row:${c.rw + 1};`;
    let spanSlots = c.rs || 1;
    s += `width:calc(var(--fs)*0.5);height:calc(var(--rh)*0.5*${spanSlots});`;
    s += 'justify-self:center;align-self:start;';
    s += (c.sc === 0 ? 'margin-left:' : 'margin-right:') + 'calc(var(--fs)*0.5);';
    if (c.sr === 1) {
        s += 'margin-top:calc(var(--rh)*0.5);';
    }
    
    const engClass = c.isEng ? ' eng' : '';
    return `<div class="c cm${engClass}" style="${s}"><span${c.isEng ? ' class="eng-span"' : ''}>${esc(c.c)}</span></div>`;
  }

  const cls = ['c'];
  if (c.isEng) cls.push('eng');
  if (c.hw) { cls.push('hw', 'clk'); if (c.hp) cls.push('hp'); }
  if (c.vr) cls.push('vl');
  if (c.bk) cls.push('bl');
  
  // 【核心新增】：識別標題內的全形/半形括號，賦予專屬類名
if (c.c === '（' || c.c === '）' || c.c === '(' || c.c === ')') cls.push('paren');

  let style = `grid-column:${c.cl + 1};grid-row:${c.rw + 1}`;
  if (c.rs && c.rs > 1) {
    style += ` / span ${c.rs}`;
  }

  let p = '';
  if (c.pn) {
    const svg = c.pn === '。'
      ? `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="${PC.cr}" stroke-width="1.5"/></svg>`
      : `<svg viewBox="0 0 10 10"><path d="M3 3Q7 7 8 5" stroke="${PC.cr}" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    p = `<i class="pd">${svg}</i>`;
  }

  return `<div class="${cls.join(' ')}" style="${style}" data-ii="${c.ii}"><span${c.isEng ? ' class="eng-span"' : ''}>${esc(c.c)}</span>${p}</div>`;
}

export function spreadHTML(si: number, spreads: PlacedCell[][][], COLS: number, volName?: string): string {
  const s = spreads[si];
  if (!s) return '<div class="sw">（無内容）</div>';

  function page(cells: PlacedCell[], isR: boolean): string {
    if (!cells) cells = [];

    let isBookTitle = false;
    let isVolTitle = false;
    if (cells.length > 0) {
      if (cells[0].c === '⚑') isBookTitle = true;
      if (cells[0].c === '⚐') isVolTitle = true;
    }

    let rl = '<div class="pbr">';
    for (let j = 0; j < COLS; j++) rl += `<span class="rc${j ? '' : ' rf'}"></span>`;
    rl += '</div>';

    if (isBookTitle || isVolTitle) {
	      let parts = [], cur = '';
	      for (const cell of cells) {
	        if (cell.c === '⚑' || cell.c === '⚐' || cell.c === '') continue;
	        if (cell.nl) { if (cur) { parts.push(cur); cur = ''; } continue; }
	        if (cell.hw) { if (cell.c === '　') { if (cur) { parts.push(cur); cur = ''; } } else { cur += cell.c + (cell.pn || ''); } }
	      }
	      if (cur) parts.push(cur);
	      const spans = parts.map(p => `<span>${esc(p)}</span>`).join('');
	      const overlay = `<div class="${isBookTitle ? 'pg-book' : 'pg-vol'}"><h1 class="b-title">${spans}</h1></div>`;
      return `<div class="pg ${isR ? 'r' : 'l'}"><div class="gd">${rl}${overlay}</div></div>`;
    }

    let ch = '';
    for (let k = 0; k < cells.length; k++) ch += cHTML(cells[k], COLS, 0);

    return `<div class="pg ${isR ? 'r' : 'l'}"><div class="gd">${rl}${ch}</div></div>`;
  }

  const fishTail = '<svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>';
  const fishTailInv = '<svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0;transform:rotate(180deg)"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>';

  // 加入 黑口 (shk, xhk) 和 象鼻 (sxb)
  return `<div class="sw" data-si="${si}"><div class="bx"><div class="bx-in">` +
    page(s[0], true) +
    `<div class="sn">` +
      `<span class="shk"></span>` +
      `<span class="sxb"></span>` +
      fishTail +
      `<span class="snt">中文兔子洞冰山圖</span><span class="sch">${volName || ""}</span><span class="snm">${toChineseNum(si * 2 + 1)}</span>` +
      fishTailInv +
      `<span class="sxb"></span>` +
      `<span class="xhk"></span>` +
    `</div>` +
    page(s[1], false) +
  `</div></div></div>`;
}
