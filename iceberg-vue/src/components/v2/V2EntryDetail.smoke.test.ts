// V2 详情弹窗接线守卫：真实挂载 V2EntryCard / V2Sheet，确认内容区能 inject 到外壳
// provide 的交互单实例（ENTRY_IA_KEY），且关键分区都渲染出来。
// 若有人改回 prop 传 ia 或漏 provide，这里会立刻失败。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import V2EntryCard from './V2EntryCard.vue'
import V2Sheet from './V2Sheet.vue'
import type { EntryView } from '../../lib/iceberg/entryView'

// V2EntryMetaBadges 用 useRoute()，测试环境需挂一个最小 router
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
})

const item: EntryView = {
  id: 'e1',
  title: '测试词条',
  tier: '第一层',
  desc: '这是一段用于冒烟测试的描述文本，长度超过一百字以覆盖长描述分支。'.repeat(3),
  category: '都市传说',
  categoryColor: '#FF3333',
  tags: ['校园', '目击'],
  link: 'https://example.com',
  related: [{ id: 'e2', title: '关联词条' }],
  recommended: [{ id: 'e3', title: '推荐词条' }],
  prevId: 'e0',
  nextId: 'e2',
}

// useEntryInteractions 依赖 supabase 与网络；此处仅验证接线与渲染，用桩替掉
vi.mock('../../lib/useEntryInteractions', () => {
  const { ref, computed } = require('vue')
  return {
    useEntryInteractions: () => ({
      favs: ref([]),
      copied: ref(false),
      titleCopied: ref(false),
      liked: ref(false),
      likeCount: ref(0),
      commentCount: ref(0),
      updatingLike: ref(false),
      commentsOpen: ref(false),
      supabaseReady: ref(false),
      toggleItemLike: () => {},
      toggleFav: () => {},
      copyShareLink: () => {},
      copyTitle: () => {},
      openComments: () => {},
    }),
  }
})

const errors: unknown[] = []
beforeEach(() => {
  errors.length = 0
  vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a) })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('V2 详情弹窗冒烟', () => {
  it('V2EntryCard：inject 到 ia 并渲染出内容区', async () => {
    const w = mount(V2EntryCard, { props: { item }, attachTo: document.body, global: { plugins: [router] } })
    await nextTick()
    const html = document.body.innerHTML
    expect(html).toContain('测试词条')
    expect(html).toContain('这是一段用于冒烟测试的描述')
    expect(html).toContain('都市传说')
    expect(html).toContain('关联词条')
    expect(html).toContain('v2act-btn')  // 动作条已外迁到 BaseModal 的 #footer，由 V2EntryActions 渲染
    expect(errors).toEqual([])
    w.unmount()
  })

  it('V2Sheet：inject 到 ia 并渲染出内容区', async () => {
    const w = mount(V2Sheet, { props: { item }, attachTo: document.body, global: { plugins: [router] } })
    await nextTick()
    await nextTick()
    const html = document.body.innerHTML
    expect(html).toContain('测试词条')
    expect(html).toContain('v2sheet-head')
    expect(html).toContain('关联词条')
    expect(errors).toEqual([])
    w.unmount()
  })
})
