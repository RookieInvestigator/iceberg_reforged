import { beforeEach, describe, expect, it } from 'vitest'
import {
  acceptedIds, effectiveTags, effectiveValue, filterReviewRows, hasEdits, itemIdsOf, kindOf,
  loadDecisions, mergeEdits, normalizeRows, saveDecisions, serializeTags, stats,
  type DecisionMap, type FeedbackRow,
} from './feedbackReview'

const row = (id: string, over: Partial<FeedbackRow> = {}): FeedbackRow => ({
  id, itemId: 'abcdef01', note: '', userId: 'u', createdAt: '2026-09-27', status: 'open',
  applied: false, link: '', desc: '', title: '', category: '', tags: [], unsupported: [], ...over,
})

beforeEach(() => localStorage.clear())

describe('normalizeRows', () => {
  it('吃 REST 的对象 changes 与 CSV 的 JSON 字符串 changes', () => {
    const rows = normalizeRows([
      { id: 1, item_id: 'a1', changes: { link: 'https://x.example' }, note: 'n', user_id: 'u1', created_at: 't', status: 'open' },
      { id: '2', item_id: 'b2', changes: '{"desc":"d","title":"t"}', note: 'n2', user_id: 'u2' },
    ])
    expect(rows[0]).toMatchObject({ id: '1', itemId: 'a1', link: 'https://x.example' })
    expect(rows[1]).toMatchObject({ itemId: 'b2', desc: 'd', title: 't' })
  })

  it('changes 非法 JSON 不炸，只当空；缺 item_id 的行丢弃', () => {
    const rows = normalizeRows([
      { id: 1, item_id: 'a1', changes: '{不是 JSON' },
      { id: 2, note: '没有 item_id' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ itemId: 'a1', link: '', desc: '', title: '' })
  })

  it('category / tags 是一等字段（表单五个字段全可落盘），只有未知 key 进 unsupported', () => {
    const rows = normalizeRows([
      { id: 1, item_id: 'a1', changes: { desc: 'd', category: '阴谋论・边缘理论', tags: ['神秘学', '风水'], tier: '1' } },
      { id: 2, item_id: 'a2', changes: { tags: '["综摄"]' } },
    ])
    expect(rows[0].category).toBe('阴谋论・边缘理论')
    expect(rows[0].tags).toEqual(['神秘学', '风水'])
    expect(rows[0].unsupported).toEqual(['tier'])
    // tags 也能吃 JSON 串（CSV 里就是这么存的）
    expect(rows[1].tags).toEqual(['综摄'])
  })
})

describe('kindOf / 域名', () => {
  it('单字段与混合类型（category/tags 归入 meta）', () => {
    expect(kindOf(row('1', { link: 'u' }))).toBe('link')
    expect(kindOf(row('1', { desc: 'd' }))).toBe('desc')
    expect(kindOf(row('1', { title: 't' }))).toBe('title')
    expect(kindOf(row('1', { category: 'c' }))).toBe('meta')
    expect(kindOf(row('1', { tags: ['神秘学'] }))).toBe('meta')
    expect(kindOf(row('1'))).toBe('mixed') // 什么都没改：类型无意义，归 mixed
    expect(kindOf(row('1', { link: 'u', desc: 'd' }))).toBe('mixed')
    expect(kindOf(row('1', { category: 'c', tags: ['x'], link: 'u' }))).toBe('mixed')
  })
  // 来源站点识别（hostOf / sourceLabel / linkDisplay）已移到 lib/sourceLabel.test.ts ——
  // 词条链接与参考链接共用同一套，测试也随之搬过去
})

describe('统计与筛选', () => {
  const rows = [row('1'), row('2'), row('3'), row('4')]
  const decisions: DecisionMap = {
    1: { decision: 'accept', at: 't' },
    2: { decision: 'reject', reason: '来源不可靠', at: 't' },
    3: { decision: 'later', at: 't' },
  }

  it('stats 分四档计数', () => {
    expect(stats(rows, decisions)).toEqual({ total: 4, accept: 1, reject: 1, later: 1, undecided: 1 })
  })

  it('acceptedIds 只交出「采纳」，待定与驳回不动', () => {
    expect(acceptedIds(rows, decisions)).toEqual(['1'])
  })
})

describe('编辑（只影响本地落盘，不碰 Supabase）', () => {
  it('effectiveValue：编辑优先，空编辑回退到反馈原值', () => {
    const r = row('1', { desc: '反馈原文', link: 'https://a.example' })
    expect(effectiveValue(r, { desc: '工作台改过的' }, 'desc')).toBe('工作台改过的')
    expect(effectiveValue(r, { desc: '   ' }, 'desc')).toBe('反馈原文')
    expect(effectiveValue(r, undefined, 'link')).toBe('https://a.example')
    // 反馈没给的字段：编辑可以凭空补上（人可为词条补链接）
    expect(effectiveValue(r, { title: '新增标题' }, 'title')).toBe('新增标题')
  })

  it('mergeEdits：覆盖 / 空串撤销 / 不动的字段保留', () => {
    expect(mergeEdits({ desc: 'a', link: 'u' }, { desc: 'b' })).toEqual({ desc: 'b', link: 'u' })
    expect(mergeEdits({ desc: 'a', link: 'u' }, { desc: '' })).toEqual({ link: 'u' })
    expect(mergeEdits(undefined, { desc: '  ' })).toEqual({})
  })

  it('effectiveTags / serializeTags：编辑优先、JSON 串与逗号串都能解、可空', () => {
    const r = row('1', { tags: ['母题'] })
    expect(effectiveTags(r, undefined)).toEqual(['母题'])
    expect(effectiveTags(r, { tags: '["神秘学","风水"]' })).toEqual(['神秘学', '风水'])
    expect(effectiveTags(r, { tags: '神秘学,风水' })).toEqual(['神秘学', '风水'])
    expect(effectiveTags(r, { tags: '  ' })).toEqual(['母题'])
    expect(serializeTags(['神秘学'])).toBe('["神秘学"]')
    // 序列化 → 归一化 往返一致（落 CSV 再读回来的等价性）
    expect(effectiveTags(r, { tags: serializeTags(['风水', '综摄']) })).toEqual(['风水', '综摄'])
  })

  it('category 的编辑与其他文本字段同规则', () => {
    const r = row('1', { category: '网络怪谈・奇闻' })
    expect(effectiveValue(r, undefined, 'category')).toBe('网络怪谈・奇闻')
    expect(effectiveValue(r, { category: '阴谋论・边缘理论' }, 'category')).toBe('阴谋论・边缘理论')
    expect(effectiveValue(r, { category: ' ' }, 'category')).toBe('网络怪谈・奇闻')
  })

  it('只改字段未决定的行仍算「未决」，也不会进 acceptedIds', () => {
    const rows = [row('1'), row('2')]
    const decisions: DecisionMap = {
      1: { edits: { desc: '改了但没决定' }, at: 't' },
      2: { decision: 'accept', edits: { desc: '改了就采纳' }, at: 't' },
    }
    expect(stats(rows, decisions).undecided).toBe(1)
    expect(acceptedIds(rows, decisions)).toEqual(['2'])
    expect(hasEdits(decisions['1'].edits)).toBe(true)
  })
})

describe('工作台筛选 filterReviewRows（库状态 / 类型 / 未决 / 关键词）', () => {
  const base = { scope: 'all' as const, kind: 'all' as const, undecidedOnly: false, query: '' }
  const rows = [
    row('1', { status: 'open', desc: '新描述', itemId: 'aaaaaaaa' }),
    row('2', { status: 'accepted', applied: true, link: 'https://x.example', itemId: 'bbbbbbbb' }),
    row('3', { status: 'rejected', title: '新标题', itemId: 'cccccccc' }),
    row('4', { status: 'open', unsupported: ['emoji'], itemId: 'dddddddd' }),
  ]
  const decisions: DecisionMap = { 1: { decision: 'accept', at: 't' } }
  const titles = { aaaaaaaa: '北京公交车375', bbbbbbbb: '九鼎' }

  it('scope 按库状态筛选（已审回看靠它，不是靠本地决定）', () => {
    expect(filterReviewRows(rows, decisions, { ...base, scope: 'accepted' }).map((r) => r.id)).toEqual(['2'])
    expect(filterReviewRows(rows, decisions, { ...base, scope: 'rejected' }).map((r) => r.id)).toEqual(['3'])
    expect(filterReviewRows(rows, decisions, { ...base, scope: 'open' }).map((r) => r.id)).toEqual(['1', '4'])
    expect(filterReviewRows(rows, decisions, base)).toHaveLength(4)
  })

  it('undecidedOnly 只看本地没决定过的行 —— 与库状态是两个口径', () => {
    const list = filterReviewRows(rows, decisions, { ...base, scope: 'open', undecidedOnly: true })
    expect(list.map((r) => r.id)).toEqual(['4'])
    // 线上已 accepted、本地没决定过：scope=accepted 能捞回来，undecidedOnly 也不会把它藏掉
    const accepted = filterReviewRows(rows, decisions, { ...base, scope: 'accepted', undecidedOnly: true })
    expect(accepted.map((r) => r.id)).toEqual(['2'])
  })

  it('kind 按字段命中；unsupported 是「有未知字段」专桶', () => {
    expect(filterReviewRows(rows, decisions, { ...base, kind: 'link' }).map((r) => r.id)).toEqual(['2'])
    expect(filterReviewRows(rows, decisions, { ...base, kind: 'desc' }).map((r) => r.id)).toEqual(['1'])
    expect(filterReviewRows(rows, decisions, { ...base, kind: 'unsupported' }).map((r) => r.id)).toEqual(['4'])
  })

  it('关键词命中词条 id / 反馈 id / 说明 / 词条标题', () => {
    expect(filterReviewRows(rows, decisions, { ...base, query: 'cccc' }).map((r) => r.id)).toEqual(['3'])
    expect(filterReviewRows(rows, decisions, { ...base, query: '3' }).map((r) => r.id)).toEqual(['3'])
    expect(filterReviewRows(rows, decisions, { ...base, query: '公交车', titles }).map((r) => r.id)).toEqual(['1'])
    expect(filterReviewRows(rows, decisions, { ...base, query: '  ' })).toHaveLength(4) // 纯空白不筛
  })

  it('四个条件叠加：scope=open + 只看未决 + 关键词', () => {
    const list = filterReviewRows(rows, decisions, { ...base, scope: 'open', undecidedOnly: true, query: 'dddd' })
    expect(list.map((r) => r.id)).toEqual(['4'])
  })

  it('itemIdsOf 去重：条数 ≠ 词条数', () => {
    const dup = [row('1', { itemId: 'x' }), row('2', { itemId: 'x' }), row('3', { itemId: 'y' })]
    expect(itemIdsOf(dup)).toEqual(['x', 'y'])
    expect(itemIdsOf([])).toEqual([])
  })
})

describe('决定持久化', () => {  it('localStorage 往返；损坏数据回退空表', () => {
    saveDecisions({ 7: { decision: 'accept', at: 't' } })
    expect(loadDecisions()).toEqual({ 7: { decision: 'accept', at: 't' } })
    localStorage.setItem('iceberg-feedback-review-decisions', '{坏')
    expect(loadDecisions()).toEqual({})
  })
})
