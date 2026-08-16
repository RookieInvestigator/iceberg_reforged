import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 回归：评论点赞计数查询 400。
 * 历史 bug：`in('target_id', ids.map(String))` 数字字符串不带引号 → `in.(5)` 对 text 列 400，
 * 且 `.filter(column, value)` 两参调用会拼出 `.undefined`。
 * 正确形式：`.filter('target_id', 'in', '("5")')` 三参。
 */

const calls: string[][] = []

interface FakeResult {
  data: unknown
  error: unknown
}

function builder(result: FakeResult) {
  // then 需要接收具体回调类型，统一用宽松的 any 参数（测试桩无需严格签名）
  const chain: Record<string, (...args: any[]) => unknown> = {}
  const record = (name: string, ...args: unknown[]) => {
    calls.push([name, ...args.map((a) => String(a))])
    return chain
  }
  chain.select = (...a: unknown[]) => record('select', ...a)
  chain.eq = (...a: unknown[]) => record('eq', ...a)
  chain.filter = (...a: unknown[]) => record('filter', ...a)
  chain.in = (...a: unknown[]) => record('in', ...a)
  chain.order = (...a: unknown[]) => record('order', ...a)
  chain.limit = (...a: unknown[]) => record('limit', ...a)
  chain.range = (...a: unknown[]) => record('range', ...a)
  chain.maybeSingle = () => record('maybeSingle')
  chain.then = (resolve: (v: FakeResult) => void) => resolve(result)
  return chain
}

const commentsResult = {
  data: [{ id: 5, user_id: null, item_id: 'item-x', content: 'c', created_at: '2026-08-02', anon_name: '匿' }],
  error: null,
}

// ── F11/F13 验收：interactions 表内存 fake（可注入失败）──
interface InteractionRow {
  user_id: string
  target_type: string
  target_id: string
  type: string
}
let iRows: InteractionRow[] = []
let iFail: { delete?: boolean; insert?: boolean; select?: boolean } = {}
let insertCalls: InteractionRow[][] = []

function resetInteractions(rows: InteractionRow[] = [], fail: typeof iFail = {}) {
  iRows = rows
  iFail = fail
  insertCalls = []
}

function interactionsFake() {
  const ops: any[][] = []
  const chain: Record<string, (...a: any[]) => any> = {}
  chain.eq = (...a: any[]) => { ops.push(['eq', ...a]); return chain }
  chain.in = (...a: any[]) => { ops.push(['in', ...a]); return chain }
  chain.filter = (...a: any[]) => { calls.push(['filter', ...a.map(String)]); ops.push(['filter', ...a]); return chain }
  chain.select = (...a: any[]) => { ops.push(['select', ...a]); return chain }
  chain.delete = () => { ops.push(['delete']); return chain }
  chain.insert = (rows: InteractionRow[]) => { ops.push(['insert', rows]); return chain }
  chain.maybeSingle = () => { ops.push(['maybeSingle']); return chain }
  chain.then = (resolve: (v: any) => void) => {
    const eqs = ops.filter(o => o[0] === 'eq').map(o => [o[1], o[2]] as [string, any])
    const inOps = ops.filter(o => o[0] === 'in').map(o => [o[1], o[2]] as [string, any[]])
    // postgrest filter 三参：值形如 '("5")' → 拆出 id 列表参与匹配
    const filters = ops.filter(o => o[0] === 'filter').map(o => [o[1], o[3]] as [string, string])
    const matches = (r: InteractionRow) =>
      eqs.every(([c, v]) => r[c as keyof InteractionRow] === v) &&
      inOps.every(([c, vs]) => vs.includes(r[c as keyof InteractionRow])) &&
      filters.every(([c, v]) => {
        const inner = typeof v === 'string' ? v.slice(2, -2).split('","') : [v]
        return inner.includes(r[c as keyof InteractionRow])
      })
    const isDelete = ops.some(o => o[0] === 'delete')
    const isInsert = ops.some(o => o[0] === 'insert')
    const isHead = ops.some(o => o[0] === 'select' && o[2] && (o[2] as any).head)
    const isAgg = ops.some(o => o[0] === 'select' && typeof o[1] === 'string' && o[1].includes('count(*)'))

    if (isDelete) {
      if (iFail.delete) return resolve({ data: null, error: new Error('delete denied (RLS)') })
      const victims = iRows.filter(matches)
      iRows = iRows.filter(r => !victims.includes(r))
      const singled = ops.some(o => o[0] === 'maybeSingle')
      return resolve({ data: singled ? (victims[0] || null) : victims, error: null })
    }
    if (isInsert) {
      if (iFail.insert) return resolve({ data: null, error: new Error('insert denied (PK conflict)') })
      const raw = ops.find(o => o[0] === 'insert')![1]
      const rows: InteractionRow[] = Array.isArray(raw) ? raw : [raw]
      iRows.push(...rows)
      insertCalls.push(rows)
      return resolve({ data: rows, error: null })
    }
    if (isHead) return resolve({ count: iRows.filter(matches).length, error: null })
    if (isAgg) {
      // target_id, count(*) → 按 target_id 分组计数
      const counts = new Map<string, number>()
      for (const r of iRows) if (matches(r)) counts.set(r.target_id, (counts.get(r.target_id) || 0) + 1)
      return resolve({ data: [...counts].map(([target_id, count]) => ({ target_id, count })), error: null })
    }
    if (iFail.select) return resolve({ data: null, error: new Error('select denied') })
    return resolve({ data: iRows.filter(matches), error: null })
  }
  return chain
}

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => (table === 'comments' ? builder(commentsResult) : interactionsFake()),
    // P0-审计：interaction_counts RPC —— 从 iRows 分组聚合计数（匿名路径）
    rpc: (fn: string, args?: Record<string, unknown>) => {
      calls.push(['rpc', fn, JSON.stringify(args || {})])
      if (fn === 'interaction_counts') {
        const pType = (args as { p_type?: string })?.p_type
        const pIds = ((args as { p_ids?: string[] })?.p_ids || []) as string[]
        const counts = pIds.map(id => ({
          target_id: id,
          cnt: iRows.filter(r => r.type === pType && r.target_id === String(id)).length,
        }))
        return Promise.resolve({ data: counts, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
  },
  isSupabaseReady: () => true,
}))

import { fetchComments, toggleInteraction, syncFavorites, fetchMyFavorites } from './supabaseData'

beforeEach(() => {
  calls.length = 0
  // 供 interactions fake 的点赞聚合查询返回 count=2
  resetInteractions([
    { user_id: 'u1', target_type: 'comment', target_id: '5', type: 'like' },
    { user_id: 'u2', target_type: 'comment', target_id: '5', type: 'like' },
  ])
})

describe('fetchComments 点赞聚合（400 回归）', () => {
  it('点赞计数能取到（不再被 400 吞掉显示 0）', async () => {
    const { rows } = await fetchComments('item-x', undefined, { offset: 0, limit: 50 })
    expect(rows[0].like_count).toBe(2)
  })

  it('点赞聚合走 interaction_counts RPC（P0-审计：interactions_select 已收紧）', async () => {
    await fetchComments('item-x', undefined, { offset: 0, limit: 50 })
    expect(calls.some(c => c[0] === 'rpc' && c[1] === 'interaction_counts')).toBe(true)
  })

  it('不再使用不带引号的 in 方式（in.(5) 是 400 根因）', async () => {
    await fetchComments('item-x', undefined, { offset: 0, limit: 50 })
    expect(calls).not.toContainEqual(['in', 'target_id', '5'])
  })

  it('URL 拼接不产生 .undefined（.filter 两参调用缺陷）', async () => {
    await fetchComments('item-x', undefined, { offset: 0, limit: 50 })
    for (const c of calls) {
      expect(c.join('.')).not.toContain('undefined')
    }
  })

  it('当前用户点赞状态同样走三参 filter', async () => {
    await fetchComments('item-x', 'user-1', { offset: 0, limit: 50 })
    expect(calls).toContainEqual(['filter', 'target_id', 'in', '("5")'])
  })
})

// ==========================================
// F10：分页 offset 生效（range 分页 + 稳定排序）
// ==========================================
describe('fetchComments 分页（F10 range 生效）', () => {
  beforeEach(() => { calls.length = 0 })

  it('首屏请求 range(0, limit) 且带稳定排序', async () => {
    await fetchComments('item-x', undefined, { offset: 0, limit: 50 })
    expect(calls).toContainEqual(['range', '0', '50'])
    // 稳定排序：created_at + id 双键（F10 防同秒评论分页漂移）
    expect(calls.filter(c => c[0] === 'order').map(c => c[1])).toEqual(['created_at', 'id'])
  })

  it('加载更多请求 range(offset, offset + limit)', async () => {
    await fetchComments('item-x', undefined, { offset: 50, limit: 50 })
    expect(calls).toContainEqual(['range', '50', '100'])
  })
})

// ==========================================
// F11：toggleInteraction 幂等与错误抛出
// ==========================================
describe('toggleInteraction（F11 幂等 + 错误检查）', () => {
  beforeEach(() => resetInteractions())

  it('不存在时插入并返回 true（点赞）', async () => {
    resetInteractions([], {})
    const result = await toggleInteraction('item', 'id-a', 'like')
    expect(result).toBe(true)
    expect(iRows).toEqual([{ user_id: 'u1', target_type: 'item', target_id: 'id-a', type: 'like' }])
  })

  it('已存在时删除并返回 false（取消点赞）', async () => {
    resetInteractions([{ user_id: 'u1', target_type: 'item', target_id: 'id-a', type: 'like' }])
    const result = await toggleInteraction('item', 'id-a', 'like')
    expect(result).toBe(false)
    expect(iRows).toEqual([])
  })

  it('RLS 拒绝删除时抛出错误（UI 应回滚）', async () => {
    resetInteractions([{ user_id: 'u1', target_type: 'item', target_id: 'id-a', type: 'like' }], { delete: true })
    await expect(toggleInteraction('item', 'id-a', 'like')).rejects.toThrow('delete denied')
  })

  it('PK 冲突插入失败时抛出错误（重复提交不产生脏数据）', async () => {
    resetInteractions([], { insert: true })
    await expect(toggleInteraction('item', 'id-a', 'favorite')).rejects.toThrow('insert denied')
  })
})

// ==========================================
// F13：syncFavorites 双向 diff（本地为权威源）
// ==========================================
describe('syncFavorites（F13 双向 diff）', () => {
  beforeEach(() => resetInteractions())

  it('本地新增：云端缺失项插入', async () => {
    resetInteractions([{ user_id: 'u1', target_type: 'item', target_id: 'a', type: 'favorite' }])
    await syncFavorites(['a', 'b'])
    expect(insertCalls.flat()).toEqual([{ user_id: 'u1', target_type: 'item', target_id: 'b', type: 'favorite' }])
  })

  it('两端删除：云端多出的项被删除（传播删除意图）', async () => {
    resetInteractions([
      { user_id: 'u1', target_type: 'item', target_id: 'a', type: 'favorite' },
      { user_id: 'u1', target_type: 'item', target_id: 'b', type: 'favorite' },
    ])
    await syncFavorites(['a'])
    expect(iRows.map(r => r.target_id)).toEqual(['a'])
  })

  it('本地为空直接同步：传播「清空全部」意图（删除云端所有收藏）', async () => {
    resetInteractions([{ user_id: 'u1', target_type: 'item', target_id: 'c', type: 'favorite' }])
    await syncFavorites([])
    expect(iRows).toEqual([])
    expect(insertCalls).toEqual([])
  })

  it('select 失败抛出错误（不静默漂移）', async () => {
    resetInteractions([], { select: true })
    await expect(syncFavorites(['a'])).rejects.toThrow('select denied')
  })
})

// ==========================================
// fetchMyFavorites 错误检查
// ==========================================
describe('fetchMyFavorites（F11 错误检查）', () => {
  beforeEach(() => resetInteractions())

  it('正常返回云端收藏', async () => {
    resetInteractions([{ user_id: 'u1', target_type: 'item', target_id: 'x', type: 'favorite' }])
    const ids = await fetchMyFavorites()
    expect(ids).toEqual(['x'])
  })

  it('查询失败抛出错误', async () => {
    resetInteractions([], { select: true })
    await expect(fetchMyFavorites()).rejects.toThrow('select denied')
  })
})
