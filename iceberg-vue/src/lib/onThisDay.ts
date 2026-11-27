export interface OnThisDayEvent {
  date: string
  year: string
  title: string
  desc: string
  link: string
  item: string
}

export type OnThisDayLang = 'zh' | 'en' | 'ja' | string

export function normalizeOnThisDayEvents(rows: Record<string, string>[]): OnThisDayEvent[] {
  return rows.map((r) => ({
    date: (r.date ?? '').trim(),
    year: (r.year ?? '').trim(),
    title: r.title ?? '',
    desc: r.desc ?? '',
    link: (r.link ?? '').trim(),
    item: (r.item ?? '').trim(),
  }))
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toMMDD(d: Date): string {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 解析 URL 查询参数里的 `MM-DD` 日期（非法日期或越界如 02-30 返回 null）。
 * 02-29 自动借用闰年（2024）以免在平年溢出到 03-01。
 */
export function parseDateParam(param: unknown, referenceYear = new Date().getFullYear()): Date | null {
  if (typeof param !== 'string') return null
  const trimmed = param.trim()
  const match = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed)
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = month === 2 && day === 29 ? 2024 : referenceYear
  const candidate = new Date(year, month - 1, day)
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null
  return candidate
}

function parseYearNumber(year: string): number | null {
  const s = (year || '').trim()
  if (!s || s === 'Unknown') return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * 按年份倒序排列（同年保持稳定相对顺序，未知年份排在最后）。
 */
export function sortEventsByYearDesc(events: OnThisDayEvent[]): OnThisDayEvent[] {
  return [...events].sort((a, b) => {
    const ya = parseYearNumber(a.year)
    const yb = parseYearNumber(b.year)
    if (ya === null && yb === null) return 0
    if (ya === null) return 1
    if (yb === null) return -1
    return yb - ya
  })
}

export interface YearEventGroup {
  year: string
  events: OnThisDayEvent[]
}

export function groupEventsByYear(events: OnThisDayEvent[]): YearEventGroup[] {
  const groups = new Map<string, OnThisDayEvent[]>()
  for (const event of events) {
    const key = (event.year || '').trim() || 'Unknown'
    const bucket = groups.get(key)
    if (bucket) bucket.push(event)
    else groups.set(key, [event])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ya = parseYearNumber(a)
      const yb = parseYearNumber(b)
      if (ya === null && yb === null) return 0
      if (ya === null) return 1
      if (yb === null) return -1
      return yb - ya
    })
    .map(([year, list]) => ({ year, events: list }))
}

/**
 * 紧凑年标（弹窗左列 / 列表行内使用）：-44 -> 前44 / 44 BCE
 */
export function formatYearShort(year: string, lang: OnThisDayLang, unknownLabel: string): string {
  const n = parseYearNumber(year)
  if (n === null) return unknownLabel
  if (n < 0) {
    const abs = Math.abs(n)
    return lang === 'en' ? `${abs} BCE` : `前${abs}`
  }
  return String(n)
}

/**
 * 分组标题年标（档案页分组大标题使用）：-44 -> 公元前 44 年 / 44 BCE / 紀元前 44 年
 */
export function formatYearHeading(year: string, lang: OnThisDayLang, unknownLabel: string): string {
  const n = parseYearNumber(year)
  if (n === null) return unknownLabel
  if (n < 0) {
    const abs = Math.abs(n)
    if (lang === 'en') return `${abs} BCE`
    if (lang === 'ja') return `紀元前 ${abs} 年`
    return `公元前 ${abs} 年`
  }
  if (lang === 'en') return String(n)
  return `${n} 年`
}

export function getSortedRecordedDates(events: OnThisDayEvent[]): string[] {
  const set = new Set<string>()
  for (const ev of events) {
    if (/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(ev.date)) {
      set.add(ev.date)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * 查找紧邻当前 MM-DD 的上一个 (-1) 或下一个 (+1) 有档案记录的日期（跨年循环）。
 */
export function getAdjacentRecordedDate(
  recordedDates: string[],
  currentMMDD: string,
  dir: -1 | 1,
): string | null {
  if (recordedDates.length === 0) return null
  if (recordedDates.length === 1 && recordedDates[0] === currentMMDD) return null

  if (dir === 1) {
    for (const d of recordedDates) {
      if (d > currentMMDD) return d
    }
    return recordedDates[0]
  }

  for (let i = recordedDates.length - 1; i >= 0; i--) {
    if (recordedDates[i] < currentMMDD) return recordedDates[i]
  }
  return recordedDates[recordedDates.length - 1]
}

export interface MonthDayGroup {
  date: string
  day: number
  events: OnThisDayEvent[]
}

export function getMonthChronicleGroups(events: OnThisDayEvent[], monthOneBased: number): MonthDayGroup[] {
  const prefix = `${pad2(monthOneBased)}-`
  const byDate = new Map<string, OnThisDayEvent[]>()
  for (const ev of events) {
    if (!ev.date?.startsWith(prefix)) continue
    const list = byDate.get(ev.date)
    if (list) list.push(ev)
    else byDate.set(ev.date, [ev])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      day: Number.parseInt(date.slice(3, 5), 10),
      events: sortEventsByYearDesc(list),
    }))
}

export function searchOnThisDayEvents(events: OnThisDayEvent[], rawQuery: string): OnThisDayEvent[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []
  const matched = events.filter((ev) => {
    const mm = Number.parseInt(ev.date.slice(0, 2), 10)
    const dd = Number.parseInt(ev.date.slice(3, 5), 10)
    const altDate = Number.isFinite(mm) && Number.isFinite(dd) ? `${mm}月${dd}日 ${mm}/${dd}` : ''
    const haystack = `${ev.date} ${altDate} ${ev.year} ${ev.title} ${ev.desc}`.toLowerCase()
    return haystack.includes(q)
  })
  return matched.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date)
    if (cmp !== 0) return cmp
    const ya = parseYearNumber(a.year)
    const yb = parseYearNumber(b.year)
    if (ya === null && yb === null) return 0
    if (ya === null) return 1
    if (yb === null) return -1
    return yb - ya
  })
}

/**
 * 构建月历网格单元格：按当月实际所需周数返回 28 / 35 / 42 格（避免无谓空尾行）。
 */
export function buildCalendarCells(year: number, monthZeroBased: number): Array<number | null> {
  const daysInMonth = new Date(year, monthZeroBased + 1, 0).getDate()
  const firstDay = new Date(year, monthZeroBased, 1).getDay()
  const totalRows = Math.ceil((firstDay + daysInMonth) / 7)
  const totalCells = totalRows * 7
  const cells: Array<number | null> = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length < totalCells) cells.push(null)
  return cells
}

/**
 * 格式化月日短标签（用于空状态 / 月览 / 跳转提示）：
 * - zh/ja: `11月24日`
 * - en: `Nov 24`
 */
export function formatMMDDLabel(mmdd: string, lang: OnThisDayLang): string {
  const d = parseDateParam(mmdd, 2024)
  if (!d) return mmdd
  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
