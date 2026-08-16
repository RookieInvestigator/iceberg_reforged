import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, toRef } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('./supabase', () => ({
  supabase: { auth: { updateUser: vi.fn(() => Promise.resolve({ error: null })) } },
  isSupabaseReady: () => true,
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthChange: vi.fn(),
}))
vi.mock('./supabaseData', () => ({
  toggleInteraction: vi.fn(async () => true),
  fetchInteractionCount: vi.fn(async () => 2),
  fetchMyInteractions: vi.fn(async () => new Set<string>(['a'])),
  fetchCommentCount: vi.fn(async () => 5),
}))

import { useEntryInteractions } from './useEntryInteractions'
import { fetchInteractionCount, toggleInteraction } from './supabaseData'
import { favorites } from './settingsStore'

// 宿主组件：把 composable 暴露到模板供点击驱动
const Host = defineComponent({
  props: { id: { type: String, default: '' } },
  setup(props) {
    const itemId = toRef(props, 'id')
    const ui = useEntryInteractions(itemId)
    return { ...ui }
  },
  template: '<div><button id="fav" @click="toggleFav(&quot;a&quot;)"/><button id="like" @click="toggleItemLike()"/><button id="copy" @click="copyShareLink(&quot;a&quot;)"/><button id="cmt" @click="openComments()"/></div>',
})

const flush = async () => { await new Promise(r => setTimeout(r, 0)) }

describe('useEntryInteractions（P2-14 共享交互）', () => {
  beforeEach(() => {
    favorites.set([])
    vi.mocked(fetchInteractionCount).mockClear()
    vi.mocked(toggleInteraction).mockClear()
    // happy-dom 无 clipboard：注入可控 stub
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    })
  })

  it('挂载即加载点赞/我的点赞/评论计数', async () => {
    const w = mount(Host, { props: { id: 'a' } })
    await flush()
    expect(fetchInteractionCount).toHaveBeenCalledWith('item', 'a', 'like')
    expect(w.vm.likeCount).toBe(2)
    expect(w.vm.liked).toBe(true) // fetchMyInteractions 默认返回 { 'a' }
    expect(w.vm.commentCount).toBe(5)
  })

  it('toggleFav 本地收藏开/关（未登录不同步云端）', async () => {
    const w = mount(Host, { props: { id: 'a' } })
    await w.find('#fav').trigger('click')
    expect(favorites.get()).toEqual(['a'])
    await w.find('#fav').trigger('click')
    expect(favorites.get()).toEqual([])
    expect(toggleInteraction).not.toHaveBeenCalled()
  })

  it('toggleItemLike 乐观更新计数', async () => {
    const w = mount(Host, { props: { id: 'a' } })
    await flush()
    await w.find('#like').trigger('click')
    await flush()
    expect(w.vm.liked).toBe(true)
    expect(w.vm.likeCount).toBe(3) // 2 + 1
  })

  it('词条切换重置状态并重载计数；评论区状态复位', async () => {
    vi.mocked(fetchInteractionCount)
      .mockResolvedValueOnce(2) // 词条 a
      .mockResolvedValueOnce(7) // 词条 b
    const w = mount(Host, { props: { id: 'a' } })
    await flush()
    await w.find('#cmt').trigger('click')
    expect(w.vm.commentsOpen).toBe(true)
    await w.setProps({ id: 'b' })
    await flush()
    expect(fetchInteractionCount).toHaveBeenLastCalledWith('item', 'b', 'like')
    expect(w.vm.likeCount).toBe(7)
    expect(w.vm.commentsOpen).toBe(false)
  })

  it('F12 序号防护：旧词条慢响应不覆盖新词条状态', async () => {
    let resolveStale: ((v: number) => void) | null = null
    // 第一次调用（词条 a）挂起；后续调用（词条 b）立即返回 9
    vi.mocked(fetchInteractionCount)
      .mockImplementationOnce(() => new Promise<number>(res => { resolveStale = res }))
      .mockResolvedValueOnce(9)
    const w = mount(Host, { props: { id: 'a' } })
    await w.setProps({ id: 'b' })
    await flush()
    expect(w.vm.likeCount).toBe(9)
    // 旧响应（词条 a 的 2）此时才回来 —— 必须被丢弃
    resolveStale!(2)
    await flush()
    expect(w.vm.likeCount).toBe(9)
  })

  it('copyShareLink 写入剪贴板并 1.5s 后复位反馈', async () => {
    const w = mount(Host, { props: { id: 'a' } })
    await w.find('#copy').trigger('click')
    await flush()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('#a'))
    expect(w.vm.copied).toBe(true)
    await new Promise(r => setTimeout(r, 1600))
    expect(w.vm.copied).toBe(false)
  })
})
