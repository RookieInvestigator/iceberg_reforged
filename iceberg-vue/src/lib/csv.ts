// 轻量 CSV 解析（RFC 4180 子集）
//
// 必须按整文本状态机解析，**不能按 '\n' 切行**：副表的值来自用户输入（描述可含段落、
// note 可换行），引号内的换行一旦按行切开就会解成一条残缺行 + 一条垃圾行（后者可能
// 带着合法列位混进渲染）。引号内的逗号 / 换行 / `""` 转义都按规范处理；
// 其余语义：表头取自首行、值 trim、空行跳过、短行补空串、<2 行返回空数组。
export function parseCSV(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^\uFEFF/, '')) // BOM 防御（Excel/导出常见）
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim())
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => {
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = (r[i] ?? '').trim() })
      return row
    })
}

function parseRows(s: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  let started = false // 字段是否已开始：引号只在字段起始处开启（字段中间的 " 是普通字符）
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++ } // "" → 字面引号
        else inQuotes = false
      } else if (ch === '\r' && s[i + 1] === '\n') {
        cur += '\n'; i++ // 引号内 CRLF 归一为 LF
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"' && !started) { inQuotes = true; started = true; continue }
    if (ch === ',') { row.push(cur); cur = ''; started = false; continue }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''; started = false
      continue
    }
    cur += ch
    started = true
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}
