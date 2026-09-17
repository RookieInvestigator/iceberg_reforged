import { describe, expect, it, vi, beforeEach } from 'vitest'
import { diffFeedback, postFeedback, fetchMyFeedback, deleteFeedback } from './feedbackData'

let inserted: Record<string, unknown>[] = []
let failInsert = false
const rows = [
  { id: 3, item_id: 'a1', changes: { title: '新' }, note: 'n', user_id: 'u1', status: 'open', applied: false, created_at: '2026-09-01' },
  { id: 2, item_id: 'a2', changes: {}, note: 'm', user_id: 'u1', status: 'accepted', applied: true, created_at: '2026-08-01' },
]

vi.mock('./supabase', () => {
  const chain: Record<string, (...args: any[]) => any> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.order = () => chain
  chain.limit = () => chain
  chain.delete = () => chain
  chain.insert = (payload: Record<string, unknown>) => {
    inserted.push(payload)
    if (failInsert) return Promise.resolve({ data: null, error: new Error('denied') })
    return Promise.resolve({ data: [payload], error: null })
  }
  ;(chain as any).then = (resolve: (v: unknown) => void) => {
    if ((chain as any)._deleted) return resolve({ data: null, error: null })
    return resolve({ data: rows, error: null })
  }
  const origDelete = chain.delete
  chain.delete = () => { (chain as any)._deleted = true; return origDelete() }
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table !== 'entry_feedback') throw new Error('unexpected table ' + table)
        ;(chain as any)._deleted = false
        return chain
      },
    },
    isSupabaseReady: () => true,
  }
})

vi.mock('./report', () => ({ reportError: () => {} }))

beforeEach(() => { inserted = []; failInsert = false })

describe('diffFeedback', () => {
  const cur = { title: '旧', desc: 'd', link: '', category: 'c', tags: ['a'] }
  it('只收差异项', () => {
    expect(diffFeedback(cur, { ...cur, title: '新' })).toEqual({ title: '新' })
  })
  it('全未改返回空对象（纯反馈）', () => {
    expect(diffFeedback(cur, { ...cur })).toEqual({})
  })
  it('数组按 JSON 比对', () => {
    expect(diffFeedback(cur, { ...cur, tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'] })
  })
})

describe('postFeedback', () => {
  it('说明空拒绝（本地拦，不碰网络）', async () => {
    await expect(postFeedback('a1', { title: 'x' }, '  ')).rejects.toThrow()
    expect(inserted).toHaveLength(0)
  })
  it('超长拒绝', async () => {
    await expect(postFeedback('a1', {}, 'x'.repeat(2001))).rejects.toThrow()
    expect(inserted).toHaveLength(0)
  })
  it('正常写入绑定 user_id', async () => {
    await postFeedback('a1', { title: '新' }, '说明')
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ item_id: 'a1', user_id: 'u1', note: '说明' })
  })
  it('RLS 拒绝向上抛', async () => {
    failInsert = true
    await expect(postFeedback('a1', {}, '说明')).rejects.toThrow('denied')
  })
})

describe('fetchMyFeedback', () => {
  it('返回本人列表（倒序）', async () => {
    const list = await fetchMyFeedback()
    expect(list.map((r) => r.id)).toEqual([3, 2])
  })
})

describe('deleteFeedback', () => {
  it('按 id 删除', async () => {
    await expect(deleteFeedback(3)).resolves.toBeUndefined()
  })
})
