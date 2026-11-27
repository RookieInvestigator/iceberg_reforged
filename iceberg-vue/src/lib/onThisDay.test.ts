import { describe, expect, it } from 'vitest'
import {
  buildCalendarCells,
  formatMMDDLabel,
  formatYearHeading,
  formatYearShort,
  getAdjacentRecordedDate,
  getMonthChronicleGroups,
  getSortedRecordedDates,
  groupEventsByYear,
  parseDateParam,
  searchOnThisDayEvents,
  sortEventsByYearDesc,
  toMMDD,
  type OnThisDayEvent,
} from './onThisDay'

const SAMPLE: OnThisDayEvent[] = [
  { date: '03-15', year: '-44', title: '凯撒遇刺', desc: '元老院事件', link: '', item: '' },
  { date: '03-15', year: '1974', title: '另一件', desc: '', link: 'https://example.com', item: 'abc' },
  { date: '08-21', year: '', title: '古手梨花生日', desc: '寒蝉', link: '', item: '' },
  { date: '11-24', year: '1971', title: 'D.B. Cooper', desc: '跳伞', link: '', item: '' },
  { date: '12-01', year: '1994', title: '空中怪车', desc: '都溪林场', link: '', item: '' },
  { date: '12-01', year: '1947', title: '克劳利去世', desc: '', link: '', item: '' },
]

describe('onThisDay helpers', () => {
  it('parses valid MM-DD including leap day and rejects invalid dates', () => {
    const mar15 = parseDateParam('03-15', 2026)
    expect(mar15?.getMonth()).toBe(2)
    expect(mar15?.getDate()).toBe(15)

    const feb29 = parseDateParam('02-29', 2026)
    expect(feb29?.getMonth()).toBe(1)
    expect(feb29?.getDate()).toBe(29)

    expect(parseDateParam('02-30', 2026)).toBeNull()
    expect(parseDateParam('13-01', 2026)).toBeNull()
    expect(parseDateParam('bad', 2026)).toBeNull()
    expect(toMMDD(mar15!)).toBe('03-15')
  })

  it('sorts and groups events by year descending with BCE and unknown handled', () => {
    const mar = SAMPLE.filter((e) => e.date === '03-15')
    const sorted = sortEventsByYearDesc(mar)
    expect(sorted.map((e) => e.year)).toEqual(['1974', '-44'])

    const groups = groupEventsByYear([...mar, SAMPLE[2]])
    expect(groups.map((g) => g.year)).toEqual(['1974', '-44', 'Unknown'])
  })

  it('formats positive, negative BCE, and unknown years per locale', () => {
    expect(formatYearShort('-44', 'zh', '不详')).toBe('前44')
    expect(formatYearShort('-44', 'en', 'Unknown')).toBe('44 BCE')
    expect(formatYearHeading('-44', 'zh', '年份不详')).toBe('公元前 44 年')
    expect(formatYearHeading('-44', 'ja', '年代不詳')).toBe('紀元前 44 年')
    expect(formatYearHeading('1971', 'zh', '年份不详')).toBe('1971 年')
    expect(formatYearHeading('1971', 'en', 'Year Unknown')).toBe('1971')
    expect(formatYearHeading('', 'zh', '年份不详')).toBe('年份不详')
  })

  it('finds adjacent recorded dates with year wraparound', () => {
    const dates = getSortedRecordedDates(SAMPLE)
    expect(dates).toEqual(['03-15', '08-21', '11-24', '12-01'])

    expect(getAdjacentRecordedDate(dates, '11-25', -1)).toBe('11-24')
    expect(getAdjacentRecordedDate(dates, '11-25', 1)).toBe('12-01')
    expect(getAdjacentRecordedDate(dates, '12-01', 1)).toBe('03-15')
    expect(getAdjacentRecordedDate(dates, '03-15', -1)).toBe('12-01')
  })

  it('builds month chronicle groups and searches archive', () => {
    const dec = getMonthChronicleGroups(SAMPLE, 12)
    expect(dec).toHaveLength(1)
    expect(dec[0].date).toBe('12-01')
    expect(dec[0].events.map((e) => e.year)).toEqual(['1994', '1947'])

    expect(searchOnThisDayEvents(SAMPLE, '都溪')).toHaveLength(1)
    expect(searchOnThisDayEvents(SAMPLE, '1971')[0].title).toBe('D.B. Cooper')
    expect(searchOnThisDayEvents(SAMPLE, '   ')).toEqual([])
  })

  it('builds minimal full-week calendar rows and formats MM-DD labels', () => {
    // 2026-02 starts on Sunday (0) with 28 days -> exactly 28 cells (4 rows)
    expect(buildCalendarCells(2026, 1)).toHaveLength(28)
    // 2026-11 starts on Sunday (0) with 30 days -> 35 cells (5 rows)
    expect(buildCalendarCells(2026, 10)).toHaveLength(35)
    expect(formatMMDDLabel('11-24', 'zh')).toBe('11月24日')
    expect(formatMMDDLabel('11-24', 'en')).toBe('Nov 24')
  })
})
