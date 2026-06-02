import type { Token, PlacedCell } from './types';

export function parseWenyan(t: string, ci: number[]): Token[] {
  const R: Token[] = [];
  let i = 0;
  let inHw = false, inHwParen = false, inCm = false, inBk = false, inVr = false;

  function at(p: number) { return (p >= 0 && p < ci.length) ? ci[p] : -1; }

  const stops = '。！？.!?';
  const pauses = '、，,：；:;';
  const swallow = '“”‘’\'"{}［］[]…-~ '; // 移除了全角空格，允許其作為佔位符

  function numToZh(s: string): string {
    const n = parseInt(s, 10);
    if (s.length >= 4) {
      const d = '〇一二三四五六七八九';
      let res = '';
      for (let j = 0; j < s.length; j++) res += d[parseInt(s[j])];
      return res;
    }
    if (n <= 10) {
      const d = '〇一二三四五六七八九十';
      return d[n];
    }
    if (n < 100) {
      const d = '〇一二三四五六七八九';
      const ten = Math.floor(n / 10), one = n % 10;
      if (ten === 1) return '十' + (one === 0 ? '' : d[one]);
      if (ten === 2) return '廿' + (one === 0 ? '' : d[one]);
      if (ten === 3) return '卅' + (one === 0 ? '' : d[one]);
      return d[ten] + '十' + (one === 0 ? '' : d[one]);
    }
    const d = '〇一二三四五六七八九';
    let res = '';
    for (let j = 0; j < s.length; j++) res += d[parseInt(s[j])];
    return res;
  }

  while (i < t.length) {
    const asciiAlphanumMatch = t.substring(i).match(/^[a-zA-Z0-9_\-\.]+/);
    if (asciiAlphanumMatch) {
      const matchStr = asciiAlphanumMatch[0];
      if (/[a-zA-Z]/.test(matchStr)) { 
        R.push({ c: matchStr, isEng: true, cm: inCm, vr: inVr, bk: inBk, hw: inHw, hp: inHw && inHwParen, ii: at(i) });
        i += matchStr.length;
        continue;
      }
    }

    if (t[i] >= '0' && t[i] <= '9') {
      let numStr = '';
      const startIndex = i;
      let hasDot = false;

      while (i < t.length && ((t[i] >= '0' && t[i] <= '9') || (t[i] === '.' && !hasDot && i + 1 < t.length && t[i + 1] >= '0' && t[i + 1] <= '9'))) {
        if (t[i] === '.') hasDot = true;
        numStr += t[i++];
      }

      let zh = '';
      if (hasDot) {
        const parts = numStr.split('.');
        zh += numToZh(parts[0]) + '點';
        const d = '〇一二三四五六七八九';
        for (let m = 0; m < parts[1].length; m++) {
          zh += d[parseInt(parts[1][m], 10)];
        }
      } else {
        zh = numToZh(numStr);
      }

      for (let k = 0; k < zh.length; k++) {
        R.push({ c: zh[k], cm: inCm, vr: inVr, bk: inBk, hw: inHw, hp: inHw && inHwParen, ii: at(startIndex) });
      }
      continue;
    }

    let ch = t[i];

    if (ch === '\f') {
      R.push({ c: '\f', cm: false, vr: false, bk: false, hw: false, pb: true, ii: at(i) });
      i++; continue;
    }

    if (ch === '\n') {
      let n = 1;
      while (i + 1 < t.length && t[i + 1] === '\n') { n++; i++; }
      if (n >= 2) R.push({ c: '\n\n', cm: false, vr: false, bk: false, hw: false, nl: true, ii: at(i) });
      i++; continue;
    }

    if (stops.indexOf(ch) >= 0) {
      if (R.length > 0 && !R[R.length - 1].nl) R[R.length - 1].pn = '。';
      i++; continue;
    }

    if (pauses.indexOf(ch) >= 0) {
      if (R.length > 0 && !R[R.length - 1].nl && !R[R.length - 1].pn) R[R.length - 1].pn = '、';
      i++; continue;
    }

    if (swallow.indexOf(ch) >= 0) {
      i++; continue;
    }

    if (ch === '【') { inHw = true; inHwParen = false; i++; continue; }
    if (ch === '】') { inHw = false; inHwParen = false; i++; continue; }
    if ((ch === '（' || ch === '(') && !inHw) { inCm = true; i++; continue; }
    if ((ch === '）' || ch === ')') && !inHw) { inCm = false; i++; continue; }
    if ((ch === '（' || ch === '(') && inHw) {
      inHwParen = true;
      i++; continue;
    }
    if ((ch === '）' || ch === ')') && inHw) { inHwParen = false; i++; continue; }
    if (ch === '《') { inBk = true; i++; continue; }
    if (ch === '》') { inBk = false; i++; continue; }
    if (ch === '「' || ch === '『') { inVr = true; i++; continue; }
    if (ch === '」' || ch === '』') { inVr = false; i++; continue; }

    if ((ch.trim() && ch !== '\r') || ch === '　') {
      R.push({ c: ch, cm: inCm, vr: inVr, bk: inBk, hw: inHw, hp: inHw && inHwParen, ii: at(i) });
    }
    i++;
  }
  return R;
}

export function layoutPages(tokens: Token[], COLS: number, ROWS: number): PlacedCell[] {
  const L: PlacedCell[] = [];
  let page = 0, col = 0, row = 0, idx = 0;

  while (idx < tokens.length) {
    const t = tokens[idx];

    if (t.c === '⚑' || t.c === '⚐') {
      if (row > 0 || col > 0 || page % 2 !== 0) {
        row = 0; col = 0; page++;
        if (page % 2 !== 0) page++;
      }
    }

    // 詞條自動換列
    if (t.hw && (idx === 0 || !tokens[idx - 1].hw)) {
      if (row > 0) {
        row = 0;
        col++;
        if (col >= COLS) { col = 0; page++; }
      }
    }

    if (t.pb) {
      row = 0; col = 0; page++;
      idx++; continue;
    }
    if (t.nl) {
      if (row + 2 >= ROWS) { row = 0; col++; if (col >= COLS) { col = 0; page++; } }
      else { row += 2; }
      idx++; continue;
    }
    if (t.cm) {
      const B: Token[] = [];
      while (idx < tokens.length && tokens[idx].cm) B.push(tokens[idx++]);
      
      let bi = 0;
      while (bi < B.length) {
        let remainingSlots = 0;
        for (let k = bi; k < B.length; k++) {
           // 【核心修復】：將小字的英文 span 倍率從 0.85 下調至 0.45，精準匹配字體高度
           remainingSlots += B[k].isEng ? Math.max(1, Math.ceil(B[k].c.length * 0.45)) : 1;
        }

        let availMainRows = ROWS - row;
        if (availMainRows <= 0) {
            row = 0; col++; if (col >= COLS) { col = 0; page++; }
            availMainRows = ROWS;
        }

        let maxSlotsThisBlock = availMainRows * 4;
        let rightColCap = availMainRows * 2;

        if (remainingSlots <= maxSlotsThisBlock) {
             rightColCap = Math.ceil(remainingSlots / 2);
        }

        let rSlots = 0, lSlots = 0;
        let sc = 0, sr = row * 2;
        let placedInBlock = 0;

        while (bi < B.length) {
           let tk = B[bi];
           // 【核心修復】：同上，修正小字英文的跨格計算
           let span = tk.isEng ? Math.max(1, Math.ceil(tk.c.length * 0.45)) : 1;
           if (span > ROWS * 2) span = ROWS * 2;

           if (sc === 0) {
               if (rSlots + span > rightColCap) {
                   if (rSlots > 0) { sc = 1; sr = row * 2; } 
                   else if (span > availMainRows * 2) { break; }
               }
           }
           if (sc === 1) {
               if (lSlots + span > availMainRows * 2) { break; }
           }

           L.push({
               c: tk.c, cm: true, vr: tk.vr, bk: tk.bk, hw: false, pn: '', ii: tk.ii,
               pg: page, cl: col,
               rw: Math.floor(sr / 2),
               sc: sc as 0|1, sr: (sr % 2) as 0|1,
               rs: span, isEng: tk.isEng
           });

           if (sc === 0) rSlots += span; else lSlots += span;
           sr += span;
           placedInBlock++;
           bi++;
        }

        if (placedInBlock === 0) row = ROWS; 
        else row += Math.ceil(Math.max(rSlots, lSlots) / 2);
      }
    } else {
      let span = 1;
      if (t.isEng) {
        span = Math.ceil(t.c.length * 0.45);
        if (span > ROWS) span = ROWS;
      }
      
      if (row + span > ROWS) {
        row = 0; col++; if (col >= COLS) { col = 0; page++; }
      }
      
      L.push({ c: t.c, cm: false, vr: t.vr, bk: t.bk, hw: t.hw, hp: t.hp, pn: t.pn || '', ii: t.ii, pg: page, cl: col, rw: row, rs: span, isEng: t.isEng });
      row += span;
      idx++;
    }
  }
  return L;
}

export function toChineseNum(n: number): string {
  const d = '〇一二三四五六七八九';
  if (n < 10) return d[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
  if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    if (r === 0) return d[h] + '百';
    if (r < 10) return d[h] + '百〇' + d[r];
    if (r < 20) return d[h] + '百一十' + (r % 10 ? d[r % 10] : '');
    return d[h] + '百' + toChineseNum(r);
  }
  if (n < 10000) {
    const th = Math.floor(n / 1000), r2 = n % 1000;
    if (r2 === 0) return d[th] + '千';
    if (r2 < 10) return d[th] + '千〇' + d[r2];
    if (r2 < 100) return d[th] + '千〇' + toChineseNum(r2);
    return d[th] + '千' + toChineseNum(r2);
  }
  return n.toString();
}
