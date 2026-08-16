import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ then: (r: any) => r({ data: [], error: null }) }), rpc: () => Promise.resolve({ data: [], error: null }) },
  isSupabaseReady: () => true,
  getSession: () => Promise.resolve({ data: { session: null } }),
  onAuthChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
}))
vi.mock('../../lib/supabaseData', () => ({
  fetchComments: vi.fn(async () => ({ rows: [], hasMore: false })),
  fetchInteractionCount: async () => 0,
  postComment: async () => {},
  deleteComment: async () => {},
  toggleInteraction: async () => false,
}))

import { fetchComments } from '../../lib/supabaseData'
import type { CommentRow } from '../../lib/supabaseData'
import CommentPanel from './CommentPanel.vue'

const flush = async () => { await new Promise(r => setTimeout(r, 0)) }

describe('CommentPanel 加载错误态（P1-12）', () => {
  it('首次加载失败：展示错误提示与重试按钮，重试成功后恢复空态', async () => {
    vi.mocked(fetchComments).mockRejectedValueOnce(new Error('network down'))
    const w = mount(CommentPanel, { props: { itemId: 'x', opened: true } })
    await flush()
    expect(w.find('.cmt-error').exists()).toBe(true)
    expect(w.find('.cmt-loading').exists()).toBe(false)
    expect(w.text()).toContain('评论加载失败')
    // 重试：默认 mock 成功 → 错误态消失，显示空态
    await w.find('.cmt-retry').trigger('click')
    await flush()
    expect(w.find('.cmt-error').exists()).toBe(false)
    expect(w.find('.cmt-empty').exists()).toBe(true)
  })

  it('加载更多失败：按钮原地变错误态，重试成功后被正常收起', async () => {
    const row: CommentRow = {
      id: 1, user_id: 'u1', item_id: 'x', content: '内容', created_at: new Date().toISOString(),
      author_name: '甲', like_count: 0, user_liked: false,
    }
    vi.mocked(fetchComments)
      .mockResolvedValueOnce({ rows: [row], hasMore: true })
      .mockRejectedValueOnce(new Error('network down'))
    const w = mount(CommentPanel, { props: { itemId: 'x', opened: true } })
    await flush()
    const btn = w.find('.cmt-loadmore')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flush()
    const errBtn = w.find('.cmt-loadmore--error')
    expect(errBtn.exists()).toBe(true)
    expect(errBtn.text()).toContain('重试')
    // 重试：默认成功 mock（rows:[] hasMore:false）→ 原列表保留，加载更多按钮收起
    await errBtn.trigger('click')
    await flush()
    expect(w.find('.cmt-loadmore').exists()).toBe(false)
    expect(w.find('.cmt-item').exists()).toBe(true)
  })
})

describe('CommentPanel 渲染回归（裸 template inert bug）', () => {
  it('opened 时评论面板内容直接渲染在 .cmt 下（不被 <template> 惰性隐藏）', async () => {
    const w = mount(CommentPanel, { props: { itemId: 'x', opened: true } })
    await w.vm.$nextTick()
    await new Promise(r => setTimeout(r, 0))
    const cmt = w.find('.cmt')
    expect(cmt.exists()).toBe(true)
    // 关键断言：头部/空态文本必须真实可见，而非藏在原生 <template>（inert）元素里
    expect(cmt.find('.cmt-hd').exists()).toBe(true)
    expect(cmt.find('.cmt-empty, .cmt-loading, .cmt-list').exists()).toBe(true)
    // 防回归：.cmt 内不得出现原生 template 元素
    expect(cmt.find('template').exists()).toBe(false)
  })
})