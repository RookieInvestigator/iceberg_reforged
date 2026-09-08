import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { searchQuery } from '../../filterStore'
import { RENDER_ITEMS_KEY } from '../../injectionKeys'
import { useV2SearchSuggest } from './useV2SearchSuggest'

const ITEMS = [
  { id: 'a1', title: '北京公交车', category: '都市传说', tags: [] },
  { id: 'b2', title: '冥车加油', category: '都市传说', tags: [] },
]

function mountSearch() {
  let api!: ReturnType<typeof useV2SearchSuggest>
  const Host = defineComponent({
    setup() {
      api = useV2SearchSuggest()
      return { api }
    },
    template: `<div></div>`,
  })
  const w = mount(Host, {
    attachTo: document.body,
    global: { provide: { [RENDER_ITEMS_KEY as symbol]: { value: ITEMS } } },
  })
  return { api, w }
}

describe('useV2SearchSuggest', () => {
  afterEach(() => {
    searchQuery.set('')
    vi.useRealTimers()
  })

  it('输入防抖写 store 并打开下拉', () => {
    vi.useFakeTimers()
    const { api, w } = mountSearch()
    const input = document.createElement('input')
    input.value = '北京'
    api.onSearchInputEvent({ target: input } as unknown as Event)
    expect(searchQuery.get()).toBe('')
    vi.advanceTimersByTime(150)
    expect(searchQuery.get()).toBe('北京')
    expect(api.suggestOpen.value).toBe(true)
    w.unmount()
  })

  it('Fuse 标题匹配出候选行', () => {
    const { api, w } = mountSearch()
    searchQuery.set('冥车')
    expect(api.suggestRows.value.map((r) => r.id)).toEqual(['b2'])
    w.unmount()
  })

  it('键盘导航：下/上/回车/Esc', () => {
    const { api, w } = mountSearch()
    searchQuery.set('车')
    const seen: string[] = []
    document.addEventListener('open-item-modal', (e) => seen.push((e as CustomEvent).detail))
    api.onSuggestKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(api.suggestOpen.value).toBe(true)
    api.onSuggestKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(api.suggestIdx.value).toBe(1)
    api.onSuggestKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(api.suggestIdx.value).toBe(0)
    api.onSuggestKey(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(seen).toEqual([api.suggestRows.value[0].id])
    api.onSuggestKey(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(api.suggestOpen.value).toBe(false)
    w.unmount()
  })
})
