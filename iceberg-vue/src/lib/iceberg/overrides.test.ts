import { describe, expect, it } from 'vitest'
import { applyOverrides } from './overrides'
import type { IcebergItem } from '../data'
import type { OverrideRecord } from './appendix'

// 通用表（overrides.csv）只管 title / desc / tags：category 归 categories.csv
// （见 extraCategories.test.ts），link 归 references.csv，related 归 related.csv。
// 保留字段写进通用表不生效，但必须被报出来（violations）。
const CTX = {
  nameToEmoji: { 神秘学: '🧿', 风水: '🪦' },
}

function item(id: string, over: Partial<IcebergItem> = {}): IcebergItem {
  return {
    id, title: '原标题', category: '都市传说・超自然事件・超常经历', tags: ['母题'], desc: '原描述', link: '',
    modifiedAt: 0, related: [], categoryColor: '#FFFFFF', emojis: ['🌏'], ...over,
  }
}

const rec = (field: string, value: string): OverrideRecord => ({ field, value })

describe('applyOverrides', () => {
  it('title / desc 就地叠加，未涉及的词条不动', () => {
    const items = [item('a'), item('b')]
    const stat = applyOverrides(items, new Map([['a', [rec('title', '订正标题'), rec('desc', '订正描述')]]]), CTX)
    expect(items[0].title).toBe('订正标题')
    expect(items[0].desc).toBe('订正描述')
    expect(items[1].title).toBe('原标题')
    expect(stat).toMatchObject({ title: 1, desc: 1 })
  })

  it('tags：emojis 与 tags 同步重算（emojis 才是墙/筛选/导出的消费字段）', () => {
    const items = [item('a')]
    const stat = applyOverrides(items, new Map([['a', [rec('tags', '神秘学,风水')]]]), CTX)
    expect(items[0].tags).toEqual(['神秘学', '风水'])
    expect(items[0].emojis).toEqual(['🧿', '🪦'])
    expect(stat.tags).toBe(1)
  })

  it('tags：也吃 JSON 数组写法（副表里存 JSON 更稳，逗号不会歧义）', () => {
    const items = [item('a')]
    applyOverrides(items, new Map([['a', [rec('tags', '["风水"]')]]]), CTX)
    expect(items[0].tags).toEqual(['风水'])
    expect(items[0].emojis).toEqual(['🪦'])
  })

  it('同键多行取最后一条（与 upsert 的 last-wins 一致）', () => {
    const items = [item('a')]
    applyOverrides(items, new Map([['a', [rec('desc', '旧值'), rec('desc', '新值')]]]), CTX)
    expect(items[0].desc).toBe('新值')
  })

  it('保留字段（category / link / related）不生效，且指明该去哪张表', () => {
    const items = [item('a', { categories: ['都市传说・超自然事件・超常经历'] })]
    const stat = applyOverrides(items, new Map([['a', [
      rec('category', '阴谋论・边缘理论'),
      rec('link', 'https://example.com'),
      rec('related', 'b'),
    ]]]), CTX)
    // 词条一字未动：分类由 categories.csv 装配，链接由 references.csv 装配
    expect(items[0].category).toBe('都市传说・超自然事件・超常经历')
    expect(items[0].categories).toEqual(['都市传说・超自然事件・超常经历'])
    expect(items[0].link).toBe('')
    expect(stat.violations).toEqual([
      'overrides.csv:category（应写 categories.csv）',
      'overrides.csv:link（应写 references.csv）',
      'overrides.csv:related（应写 related.csv）',
    ])
    // 保留字段不算「未知字段」：分开上报，避免日志里两种问题混作一谈
    expect(stat.skipped).toEqual([])
  })

  it('不支持的字段只报告不写值', () => {
    const items = [item('a')]
    const stat = applyOverrides(items, new Map([['a', [rec('tier', 'Tier 1')]]]), CTX)
    expect(items[0].title).toBe('原标题')
    expect(stat.skipped).toEqual(['tier'])
    expect(stat.violations).toEqual([])
  })

  it('空值不覆盖（避免把空描述/空标签写进词条）', () => {
    const items = [item('a')]
    const stat = applyOverrides(items, new Map([['a', [rec('desc', ''), rec('title', ''), rec('tags', '  ')]]]), CTX)
    expect(items[0].desc).toBe('原描述')
    expect(items[0].title).toBe('原标题')
    expect(items[0].tags).toEqual(['母题'])
    expect(stat).toEqual({ title: 0, desc: 0, tags: 0, skipped: [], violations: [] })
  })

  it('空表零开销', () => {
    const stat = applyOverrides([item('a')], new Map(), CTX)
    expect(stat).toEqual({ title: 0, desc: 0, tags: 0, skipped: [], violations: [] })
  })
})
