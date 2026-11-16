import type { Token, PlacedCell } from './types';

/**
 * 文言解析：把纯文本切成带样式的 token 流。
 *
 * 标记约定（由 AncientBookView 生成）：
 * - `⚑【书名】` 书名页；`⚐【卷名】` 卷首页（两者都独占一展）
 * - `【词条标题】` 词条主标题（hw，朱砂粗体，可点击）
 * - `（标签）` 双行小字夹注（cm，占半个字格宽，两行并排）
 * - `\f` 强制分页；连续两个换行 = 段落分隔
 * - 句读：`。！？` → 句号圈；`、，：；` → 顿号钩
 */
export function parseWenyan(t: string, ci: number[]): Token[] {
  const R: Token[] = [];
  let i = 0;
  let inHw = false, inHwParen = false, inCm = false, inBk = false, inVr = false;

  function at(p: number) { return (p >= 0 && p < ci.length) ? ci[p] : -1; }

  const stops = '。！？.!?';
  const pauses = '、，,：；:;';
  const swallow = '“”‘’\'"{}［］[]…-~ ';

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
    if ((ch === '（' || ch === '(') && inHw) { inHwParen = true; i++; continue; }
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

/**
 * 版面排布：token 流 → 带页码/列/行坐标的单元格。
 *
 * 分页规则：
 * - `⚑` 书名页、`⚐` 卷首页都**独占一展**（从偶数页/右页起）
 * - `\f` 强制分页，同样对齐到右页
 * - 词条标题（hw）自动换列，不接在上一词条正文后面
 *
 * 双行小字（cm）：一个字格内并排两行，各占半格宽。
 * 关键：小字块**整体占用主文行**，块内按「右行先满、再排左行」分配，
 * 主文行号按块占用的最大行数推进——否则小字会与后续正文重叠。
 */
export function layoutPages(tokens: Token[], COLS: number, ROWS: number): PlacedCell[] {
  const L: PlacedCell[] = [];
  let page = 0, col = 0, row = 0, idx = 0;

  // 兜底：版面参数异常（COLS/ROWS 为 0 或负数）时直接返回，避免死循环。
  // 正常调用方保证 ≥3×6，但 layout.ts 的 Math.max 在某些视口下可能算出 0。
  const safeCols = Math.max(1, COLS);
  const safeRows = Math.max(1, ROWS);

  // 全局步数上限：任何情况下都不允许无限循环（页面卡死比排版错误严重得多）。
  // 每个 token 最多产生 1 个单元格，正常步数 ≈ tokens.length × 常数。
  let guard = 0;
  const GUARD_MAX = tokens.length * 8 + 10000;

  /** 跳到下一展的右页（偶数页） */
  function nextSpread() {
    row = 0; col = 0; page++;
    if (page % 2 !== 0) page++;
  }
  /** 前进一列；列满则翻页 */
  function nextCol() {
    row = 0; col++;
    if (col >= safeCols) { col = 0; page++; }
  }

  while (idx < tokens.length) {
    // 兜底：步数超限直接收尾（宁可少排几页，也不能让主线程卡死）
    if (++guard > GUARD_MAX) break;

    const t = tokens[idx];

    // 书名页 / 卷首页：独占一展
    if (t.c === '⚑' || t.c === '⚐') {
      if (row > 0 || col > 0 || page % 2 !== 0) nextSpread();
    }

    // 词条标题自动换列
    if (t.hw && (idx === 0 || !tokens[idx - 1].hw)) {
      if (row > 0) nextCol();
    }

    if (t.pb) {
      nextSpread();
      idx++; continue;
    }

    if (t.nl) {
      if (row + 2 >= safeRows) nextCol();
      else row += 2;
      idx++; continue;
    }

    // ── 双行小字夹注（古籍「小字双行」）──
    // 规范：**一个大字格内放 4 个小字**（2 条竖行 × 每条 2 字）。
    // 小字块整体占用主文行：文字大致对半分到右行与左行，两行各自自上而下排。
    if (t.cm) {
      const B: Token[] = [];
      while (idx < tokens.length && tokens[idx].cm) B.push(tokens[idx++]);

      // 每个 token 占的「小字槽」数（英文按字符数折算，至少 1）
      const slotsOf = (tk: Token) => tk.isEng ? Math.max(1, Math.ceil(tk.c.length * 0.5)) : 1;

      let bi = 0;
      while (bi < B.length) {
        const availRows = safeRows - row;
        if (availRows <= 0) { nextCol(); continue; }

        // 每条竖行可放 availRows 个格、每格 2 字 → 每行容量 availRows * 2
        const capPerLine = availRows * 2;
        const totalCap = capPerLine * 2;   // 两行并排

        let remaining = 0;
        for (let k = bi; k < B.length; k++) remaining += slotsOf(B[k]);

        const take = Math.min(remaining, totalCap);
        // 分栏策略：文字**对半分**到两列，而不是先把右列塞满。
        // 旧实现让右列吃掉全部字符、左列永远是 0，于是「一个字格里只有右半边两个字」。
        const rightTake = Math.ceil(take / 2);
        const leftTake = take - rightTake;

        let rUsed = 0, lUsed = 0;
        let placed = 0;

        while (bi < B.length && placed < take) {
          const tk = B[bi];
          const span = slotsOf(tk);
          const onRight = rUsed < rightTake;
          const used = onRight ? rUsed : lUsed;
          const cap = onRight ? rightTake : leftTake;

          if (used + span > cap) break;

          // 槽 → 格/半格：每 2 个槽占 1 个字格（上/下各 1 字）
          const slotRow = Math.floor(used / 2);
          const slotHalf = used % 2;

          L.push({
            c: tk.c, cm: true, vr: tk.vr, bk: tk.bk, hw: false, pn: '', ii: tk.ii,
            pg: page, cl: col,
            rw: row + slotRow,
            sc: (onRight ? 0 : 1) as 0 | 1,
            sr: slotHalf as 0 | 1,
            rs: span,
            isEng: tk.isEng,
          });

          if (onRight) rUsed += span; else lUsed += span;
          placed += span;
          bi++;
        }

        if (placed === 0) {
          // 一个 token 都放不下：可能是 span 超过单行容量（超长英文串），
          // 也可能是版面太小。**必须强制推进**，否则 bi 不动 → 死循环
          // （表现为页面完全卡死、F12 都点不动）。
          if (availRows >= safeRows) {
            // 整列都空着还放不下 → 这个 token 比整页还长，截断后硬放
            const tk = B[bi];
            L.push({
              c: tk.c, cm: true, vr: tk.vr, bk: tk.bk, hw: false, pn: '', ii: tk.ii,
              pg: page, cl: col, rw: row, sc: 0, sr: 0, rs: 1, isEng: tk.isEng,
            });
            bi++;
            row += 1;
            if (row >= safeRows) nextCol();
          } else {
            nextCol();
          }
          continue;
        }

        // 主文行推进：两行中较长的那条占多少格
        row += Math.ceil(Math.max(rUsed, lUsed) / 2);
        if (row >= safeRows) nextCol();
      }
      continue;
    }

    // ── 普通正文 ──
    let span = 1;
    if (t.isEng) {
      span = Math.max(1, Math.ceil(t.c.length * 0.5));
      if (span > safeRows) span = safeRows;
    }

    if (row + span > safeRows) nextCol();

    L.push({
      c: t.c, cm: false, vr: t.vr, bk: t.bk, hw: t.hw, hp: t.hp, pn: t.pn || '',
      ii: t.ii, pg: page, cl: col, rw: row, rs: span, isEng: t.isEng,
    });
    row += span;
    idx++;
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
