import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ then: (r: any) => r({ data: [], error: null }) }),
    rpc: () => Promise.resolve({ data: [], error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
  isSupabaseReady: () => true,
  getSession: () => Promise.resolve({ data: { session: null } }),
  onAuthChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
}))
vi.mock('../../lib/supabaseData', () => ({
  fetchComments: async () => ({ rows: [], hasMore: false }),
  fetchInteractionCount: async () => 0,
  fetchMyInteractions: async () => new Set<string>(),
  fetchCommentCount: async () => 0,
  postComment: async () => {},
  deleteComment: async () => {},
  toggleInteraction: async () => false,
}))

import EntryDetailCardNext from './EntryDetailCardNext.vue'

describe('评论按钮链路', () => {
  const item = {
    id: '87fbcd52', title: '测试词条', category: '都市传说', categoryColor: '#FFF',
    tags: [], desc: '测试描述', link: '', prevId: undefined, nextId: undefined,
  }

  it('点击评论按钮后评论区渲染（v-if commentsOpen）', async () => {
    const w = mount(EntryDetailCardNext, {
      props: { item },
      global: {
        stubs: { CommentPanel: { template: '<div class="comment-panel-stub">PANEL</div>' },
          MessageCircle: true, Heart: true, Star: true, X: true, ChevronLeft: true, ChevronRight: true, ExternalLink: true },
      },
    })
    // BaseModal 内容 teleport 到 body —— 从 document.body 查询
    expect(document.body.querySelector('.comment-panel-stub')).toBeNull()
    const btns = document.body.querySelectorAll('button')
    const commentBtn = [...btns].find(b => b.getAttribute('title') === '评论')
    expect(commentBtn).toBeTruthy()
    commentBtn!.dispatchEvent(new MouseEvent('click'))
    await w.vm.$nextTick()
    expect(document.body.querySelector('.comment-panel-stub')).toBeTruthy()
  })
})