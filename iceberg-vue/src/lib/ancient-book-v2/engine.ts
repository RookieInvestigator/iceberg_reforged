import type { Token, PlacedCell, MarginalChar } from './types'

/**
 * 古籍 v2 · 文本解析与版面排布
 *
 * 两件事：文本 → token 流（`parseText`）；token → 带（页 / 列 / 行）坐标的格子（`layoutPages`）。
 * 版面几何只认调用方给的列数、行数与西文宽度测量回调，这里不碰像素，也不认识字体。
 *
 * 三条硬规则：
 * - 夹注（双行小字）一格 4 字：两列 × 两行，每列半格宽；
 * - 词条标题永远另起一列，标题因此总在列首（眉批要靠这一点找「起首字」）；
 * - 任何情况下都不许死循环：见 `layoutPages` 里的 guard 与 `placed === 0` 兜底。
 */

/** 句读符号集 */
const STOPS = '。！？.!?'
const PAUSES = '、，,：；:;'
/** 解析时吞掉的字符（引号、括号等由标记位表达，不占字位） */
const SWALLOW = '“”‘’\'"{}［］[]…-~ '
/**
 * 西文串：拉丁字母、西里尔字母、希腊字母与数字/点/连字符连成一个 token。
 *
 * 直排里它们**一律按「旋转的西文」处理**（clreq §6.3.3），所以不按语种分流：
 * 「ВИ」「Δ」「abc」在同一列里的排法与字宽算法完全相同。
 * 早先只认 `[a-zA-Z]`，西里尔字母被当成汉字逐字直排 —— 同一页上两种朝向，
 * 一眼就能看出来。
 */
const WORD = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\d_.\-]+/u
const HAS_LETTER = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u

/** 汉字数字的十个基本字（〇 用 U+3007，与五款字体的字形一致） */
const DIG = '〇一二三四五六七八九'

/** 年份 / 版次：后面跟这些字的数字一律**逐位读**（86年 → 八六年、25版 → 二五版） */
const YEAR_SUFFIX = /^[年版]/

/**
 * 阿拉伯数字 → 汉字数字（**全文唯一实现**：页码、年代、编号、正文数量共用）。
 *
 * 规则：
 * - **三位以上逐位读**：375 → 三七五、1986 → 一九八六、100 → 一〇〇。
 *   古籍里年代、叶码、线路号、门牌号一律逐位，读成「三百七十五」反而像在报数量；
 * - **两位按「十位」读**：10 → 十、11-19 → 十一…十九、20-99 → 二十…九十九；
 * - **年份 / 版次例外**（`digitRead`）：86年 → 八六年、25版 → 二五版 ——
 *   年份与版次是「编号」不是「数量」，读成「八十六年」「二十五版」会像在数数；
 * - **不用廿卅**：五款字体里「廿/卅」的字形粗细与思源宋并排时不一致，现代读者也要
 *   停顿一下才认得出；「二十/三十」是通行的刻本写法。
 */
export function toHanNum(s: string, digitRead = false): string {
  const digits = s.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return '〇'
  if (digits.length === 1) return DIG[+digits]!
  // 年份 / 版次：一律逐位（86年 → 八六年），不管几位
  if (digitRead) return [...digits].map((c) => DIG[+c]!).join('')
  if (digits.length === 2) {
    const ten = +digits[0]!
    const one = +digits[1]!
    if (ten === 1) return '十' + (one ? DIG[one] : '')
    return DIG[ten] + '十' + (one ? DIG[one] : '')
  }
  return [...digits].map((c) => DIG[+c]!).join('')
}

/** 数字串 → 汉字数字（正文用；小数由调用方按「點」+ 逐位拼） */
export function numToZh(s: string, digitRead = false): string {
  return toHanNum(s, digitRead)
}

/**
 * 文本 → token 流。
 *
 * 标记约定（由视图层生成）：
 * - `⚑【书名】` 书名页、`⚐【卷名】` 卷首页（都独占一展）
 * - `【词条标题】` 词条主标题（hw，可点击）
 * - `（标签）` 夹注（cm，双行小字）
 * - `\f` 强制分页；连续两个换行 = 段落分隔
 */
export function parseText(text: string, charItem: number[]): Token[] {
  const out: Token[] = []
  let i = 0
  let inHw = false
  let inHwParen = false
  let inCm = false
  let inBk = false
  let inVr = false

  const at = (p: number) => (p >= 0 && p < charItem.length ? charItem[p]! : -1)

  while (i < text.length) {
    // 西文/数字串整体作为一个 token（直排时旋转 90°）
    const word = WORD.exec(text.slice(i))
    if (word && HAS_LETTER.test(word[0])) {
      out.push({
        c: word[0], isEng: true, cm: inCm, vr: inVr, bk: inBk,
        hw: inHw, hp: inHw && inHwParen, ii: at(i),
      })
      i += word[0].length
      continue
    }

    // 纯数字 → 中文数字（古籍不用阿拉伯数字）
    if (text[i]! >= '0' && text[i]! <= '9') {
      let num = ''
      const start = i
      let hasDot = false
      while (i < text.length) {
        const ch = text[i]!
        if (ch >= '0' && ch <= '9') { num += ch; i++; continue }
        if (ch === '.' && !hasDot && /[0-9]/.test(text[i + 1] ?? '')) { hasDot = true; num += ch; i++; continue }
        break
      }
      // 后面紧跟「年 / 版」→ 当编号逐位读（86年 → 八六年），不做「八十六年」
      const digitRead = YEAR_SUFFIX.test(text.slice(i))
      let zh = ''
      if (hasDot) {
        const [a, b] = num.split('.')
        zh = numToZh(a!, digitRead) + '點'
        for (const ch of b ?? '') zh += '〇一二三四五六七八九'[parseInt(ch, 10)] ?? ''
      } else {
        zh = numToZh(num, digitRead)
      }
      for (const ch of zh) {
        out.push({ c: ch, cm: inCm, vr: inVr, bk: inBk, hw: inHw, hp: inHw && inHwParen, ii: at(start) })
      }
      continue
    }

    const ch = text[i]!

    if (ch === '\f') {
      out.push({ c: '\f', cm: false, hw: false, pb: true, ii: at(i) })
      i++
      continue
    }

    if (ch === '\n') {
      let n = 1
      while (text[i + 1] === '\n') { n++; i++ }
      if (n >= 2) out.push({ c: '\n\n', cm: false, hw: false, nl: true, ii: at(i) })
      i++
      continue
    }

    if (STOPS.includes(ch)) {
      const prev = out[out.length - 1]
      if (prev && !prev.nl) prev.pn = '。'
      i++
      continue
    }

    if (PAUSES.includes(ch)) {
      const prev = out[out.length - 1]
      if (prev && !prev.nl && !prev.pn) prev.pn = '、'
      i++
      continue
    }

    if (SWALLOW.includes(ch)) { i++; continue }

    if (ch === '【') { inHw = true; inHwParen = false; i++; continue }
    if (ch === '】') { inHw = false; inHwParen = false; i++; continue }
    if ((ch === '（' || ch === '(') && !inHw) { inCm = true; i++; continue }
    if ((ch === '）' || ch === ')') && !inHw) { inCm = false; i++; continue }
    if ((ch === '（' || ch === '(') && inHw) { inHwParen = true; i++; continue }
    if ((ch === '）' || ch === ')') && inHw) { inHwParen = false; i++; continue }
    if (ch === '《') { inBk = true; i++; continue }
    if (ch === '》') { inBk = false; i++; continue }
    if (ch === '「' || ch === '『') { inVr = true; i++; continue }
    if (ch === '」' || ch === '』') { inVr = false; i++; continue }

    if (ch.trim() || ch === '　') {
      out.push({ c: ch, cm: inCm, vr: inVr, bk: inBk, hw: inHw, hp: inHw && inHwParen, ii: at(i) })
    }
    i++
  }
  return out
}

/**
 * token 流 → 带坐标的单元格。
 *
 * 分页规则：
 * - `⚑` 书名页、`⚐` 卷首页都独占一展（从偶数页/右页起）
 * - `\f` 强制分页，同样对齐到右页
 * - 词条标题（hw）自动换列
 *
 * 夹注（cm）分栏（**v2 的核心修正**）：
 * - 一个字格内放两列小字，每列半格宽；
 * - 文字**对半分**到右列与左列（右列累计到一半就切左列，两列字数差 ≤ 1）；
 * - 每列每格放 2 字（上下半行），即**一格 4 个小字**。
 *
 * @param engSpan 西文占几个槽：**正文按整行**（span = 行数），
 *                 **夹注按半行**（`small = true`，span = 半行数，因为夹注一格只有半行高）。
 *                 两种单位的字号也不同（正文 `--eng-scale`、夹注 0.4em），必须分开算 ——
 *                 早先夹注里的西文用正文字号量宽度、又按整行折算，串长被高估一倍，
 *                 版面预算全乱，正文直接被挤出页外。
 */
export function layoutPages(
  tokens: Token[],
  cols: number,
  rows: number,
  engSpan?: (text: string, small: boolean) => number,
): PlacedCell[] {
  const out: PlacedCell[] = []
  const safeCols = Math.max(1, cols)
  const safeRows = Math.max(1, rows)
  const spanOfEng = engSpan ?? ((s: string, small: boolean) => Math.max(1, Math.ceil((s.length * 0.35) / (small ? 0.5 : 1))))
  let page = 0
  let col = 0
  let row = 0
  let idx = 0

  // 兜底：任何情况下都不允许无限循环（页面卡死比排版错误严重）
  let guard = 0
  const GUARD_MAX = tokens.length * 8 + 10000

  const nextSpread = () => {
    row = 0; col = 0; page++
    if (page % 2 !== 0) page++
  }
  const nextCol = () => {
    row = 0; col++
    if (col >= safeCols) { col = 0; page++ }
  }

  while (idx < tokens.length) {
    if (++guard > GUARD_MAX) break
    const t = tokens[idx]!

    // 书名页 / 卷首页：独占一展
    if (t.c === '⚑' || t.c === '⚐') {
      if (row > 0 || col > 0 || page % 2 !== 0) nextSpread()
    }

    // 词条标题自动换列
    if (t.hw && (idx === 0 || !tokens[idx - 1]!.hw)) {
      if (row > 0) nextCol()
    }

    if (t.pb) { nextSpread(); idx++; continue }

    if (t.nl) {
      if (row + 2 >= safeRows) nextCol()
      else row += 2
      idx++
      continue
    }

    // ── 夹注：双列小字 ──
    if (t.cm) {
      const block: Token[] = []
      while (idx < tokens.length && tokens[idx]!.cm) block.push(tokens[idx++]!)

      const slotsOf = (tk: Token) => (tk.isEng ? Math.max(1, spanOfEng(tk.c, true)) : 1)

      let bi = 0
      while (bi < block.length) {
        const availRows = safeRows - row
        if (availRows <= 0) { nextCol(); continue }

        // 每列可放 availRows 个格、每格 2 字
        const capPerCol = availRows * 2
        const totalCap = capPerCol * 2

        let remaining = 0
        for (let k = bi; k < block.length; k++) remaining += slotsOf(block[k]!)

        const take = Math.min(remaining, totalCap)
        // 对半分到两列（不是先把右列塞满）
        const rightTake = Math.ceil(take / 2)
        const leftTake = take - rightTake

        let rUsed = 0
        let lUsed = 0
        let placed = 0

        while (bi < block.length && placed < take) {
          const tk = block[bi]!
          const span = slotsOf(tk)
          const onRight = rUsed < rightTake
          const used = onRight ? rUsed : lUsed
          const halfCap = onRight ? rightTake : leftTake
          const colFree = capPerCol - used
          // 额度检查：先按「半边对半分」的额度放；放不下时，只要**整列**还装得下就照放 ——
          // 夹注里的英文串动辄 span>1，严格按半列额度切会把它挤到下一列、
          // 再被兜底逻辑压成 span 1（整串叠在一格上）。
          if (used + span > halfCap && span > colFree) {
            if (span > capPerCol) {
              // 比整列还长的串：截断到本列剩余容量，余下部分作为新 token 继续
              const room = Math.max(1, Math.min(colFree || capPerCol, capPerCol))
              const cut = Math.max(1, Math.floor(room * 2))
              const head = tk.c.slice(0, cut)
              const tail = tk.c.slice(cut)
              if (head) {
                const subRow = (used % 2) as 0 | 1
                const rowOffset = Math.floor(used / 2)
                out.push({
                  ...tk, c: head, cm: true, hw: false, pn: '',
                  pg: page, cl: col, rw: row + rowOffset,
                  subCol: onRight ? 1 : 2, subRow, span: room,
                })
                if (onRight) rUsed += room
                else lUsed += room
                placed += room
              }
              // 剩余部分替换当前 token，下一轮继续
              block[bi] = { ...tk, c: tail }
              break
            }
            break
          }

          // 每 2 槽占 1 个字格（上下半行各 1 字）
          const subRow = (used % 2) as 0 | 1
          const rowOffset = Math.floor(used / 2)

          out.push({
            ...tk,
            cm: true,
            hw: false,
            pn: '',
            pg: page,
            cl: col,
            rw: row + rowOffset,
            subCol: onRight ? 1 : 2,
            subRow,
            span,
          })

          if (onRight) rUsed += span
          else lUsed += span
          placed += span
          bi++
        }

        if (placed === 0) {
          // 一个 token 都放不下：强制推进，避免死循环
          if (availRows >= safeRows) {
            const tk = block[bi]!
            out.push({ ...tk, cm: true, hw: false, pn: '', pg: page, cl: col, rw: row, subCol: 1, subRow: 0, span: 1 })
            bi++
            row += 1
            if (row >= safeRows) nextCol()
          } else {
            nextCol()
          }
          continue
        }

        // 主文行推进：两列中较长的那条占多少格
        row += Math.ceil(Math.max(rUsed, lUsed) / 2)
        if (row >= safeRows) nextCol()
      }
      continue
    }

    // ── 普通正文 ──
    // 西文直排：text-orientation: sideways 让整串沿列自然流下（clreq §6.3.3），
    // 占用行数 = 串宽 / 行高，由调用方精确测量（measure.ts）。
    let span = 1
    if (t.isEng) {
      span = Math.max(1, spanOfEng(t.c, false))
      if (span > safeRows) span = safeRows
      // 放不进本列剩下的行：**先把串切成两段**，前段留在本列、后段进下一列。
      // 英文串是一个整体 token，不切就会整段被推到下一列 ——
      // 本列尾部随即空出 span-1 行，看起来就是「莫名其妙空了一行」。
      const availRows = safeRows - row
      if (row > 0 && span > availRows) {
        let cut = 0
        for (let k = 1; k < t.c.length; k++) {
          if (Math.max(1, spanOfEng(t.c.slice(0, k), false)) <= availRows) cut = k
          else break
        }
        if (cut > 0) {
          const head = t.c.slice(0, cut)
          const headSpan = Math.max(1, spanOfEng(head, false))
          out.push({
            ...t,
            c: head,
            cm: false,
            pn: '',
            pg: page,
            cl: col,
            rw: row,
            subCol: 0,
            subRow: 0,
            span: headSpan,
          })
          tokens[idx] = { ...t, c: t.c.slice(cut), pn: '' }
          row += headSpan
          if (row >= safeRows) nextCol()
          continue
        }
      }
    }
    if (row + span > safeRows) nextCol()

    out.push({
      ...t,
      cm: false,
      pn: t.pn ?? '',
      pg: page,
      cl: col,
      rw: row,
      subCol: 0,
      subRow: 0,
      span,
    })
    row += span
    idx++
  }
  return out
}

/**
 * 眉批排布 —— **与夹注同一套小字格**（半格宽 × 半行高，一格 4 小字），
 * 唯一差别是**不打对半分**：先把一个半列从上填到底，填满了再换下一个半列。
 *
 * @param text        批注文字
 * @param rowsPerHalf 一个半列能放几行（= 半列高 / 半行高，由天头高度决定）
 * @param startHalf   从一个半列的第几个开始（同一条目有多条批注时接着排）
 */
export function layoutMarginal(text: string, rowsPerHalf: number, startHalf = 0): MarginalChar[] {
  const per = Math.max(1, Math.floor(rowsPerHalf))
  const out: MarginalChar[] = []
  let i = 0
  for (const c of text) {
    const h = startHalf + Math.floor(i / per)
    const r = i % per
    out.push({ c, h, r })
    i++
  }
  return out
}

/** 整数 → 汉字数字（页码用；与正文同一套读法，见 toHanNum） */export function toChineseNum(n: number): string {
  if (!Number.isFinite(n)) return ''
  return toHanNum(String(Math.trunc(n)))
}

/**
 * 一个展（对开）对应的**物理页码**：一页一个号，不是「一展一个号」。
 *
 * 版心与导航必须用同一个来源 —— 早前版心印的是 `si*2+1`、导航显示的是 `cur+1`
 * （展序号），同一页上出现两个不同的数字，翻两展就要重新对一次。
 */
export function pageNumbers(si: number, single?: boolean): number[] {
  return single ? [si + 1] : [si * 2 + 1, si * 2 + 2]
}
