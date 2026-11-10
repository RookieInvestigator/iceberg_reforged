import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { searchFuzzyMode, searchQuery } from '../../filterStore'
import { DESC_MAP_KEY, RENDER_ITEMS_KEY } from '../../injectionKeys'
import { searchHits, searchHitsExactCount, searchHitsFuzzy, searchHitsQuery } from '../wallState'
import { useV2SearchSuggest } from './useV2SearchSuggest'

/**
 * 速查下拉门禁：命中来自 wallState.searchHits（与词条墙同一份 Worker 结果），
 * 自己不再建第二个 Fuse —— 两条路径的必然结局是「下拉说无结果、墙上有命中」。
 */

const ITEMS = [
  { id: 'a1', title: '北京公交车', category: '都市传说', desc: '' },
  { id: 'b2', title: '冥车加油', category: '都市传说', desc: '' },
  { id: 'c3', title: '无关标题', category: '民俗', desc: '传说里有一辆冥车在雨夜加油' },
]

const DESCS = new Map(ITEMS.map((i) => [i.id, i.desc]))

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
    global: {
      provide: {
        [RENDER_ITEMS_KEY as symbol]: { value: ITEMS },
        [DESC_MAP_KEY as symbol]: DESCS,
      },
    },
  })
  return { api, w }
}

describe('useV2SearchSuggest', () => {
  afterEach(() => {
    searchQuery.set('')
    searchFuzzyMode.set('fuzzy')
    searchHits.value = null
    searchHitsFuzzy.value = false
    searchHitsExactCount.value = 0
    searchHitsQuery.value = ''
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

  it('行来自 searchHits：顺序保留、最多 6 条', () => {
    const { api, w } = mountSearch()
    searchQuery.set('车')
    searchHits.value = ['b2', 'a1', 'c3']
    searchHitsQuery.value = '车'
    expect(api.suggestRows.value.map((r) => r.id)).toEqual(['b2', 'a1', 'c3'])
    w.unmount()
  })

  it('正文命中给摘要，标题命中不给（说明命中原因）', () => {
    const { api, w } = mountSearch()
    searchQuery.set('冥车')
    searchHits.value = ['c3', 'b2']
    searchHitsQuery.value = '冥车'
    const rows = api.suggestRows.value
    expect(rows[0].id).toBe('c3')
    expect(rows[0].snippet).toContain('冥车')
    expect(rows[1].id).toBe('b2')
    expect(rows[1].snippet).toBe('')
    w.unmount()
  })

  it('结果还没回来（命中对应的是旧查询）时不算「无结果」', () => {
    const { api, w } = mountSearch()
    searchQuery.set('新的查询')
    searchHits.value = ['a1']
    searchHitsQuery.value = '旧的查询'
    expect(api.suggestSettled.value).toBe(false)
    searchHitsQuery.value = '新的查询'
    expect(api.suggestSettled.value).toBe(true)
    w.unmount()
  })

  it('模糊层命中时建议标注「模糊匹配」，混着精确命中时换一种说法', () => {
    const { api, w } = mountSearch()
    searchQuery.set('shz')
    searchHits.value = ['a1']
    searchHitsQuery.value = 'shz'
    searchHitsFuzzy.value = true
    expect(api.suggestFuzzy.value).toBe(true)
    expect(api.suggestMixed.value).toBe(false)
    searchHitsExactCount.value = 1
    expect(api.suggestMixed.value).toBe(true)
    searchHitsFuzzy.value = false
    expect(api.suggestFuzzy.value).toBe(false)
    w.unmount()
  })

  it('精确模式零命中时提示切到模糊（只在这条查询的结果已回来时）', () => {
    const { api, w } = mountSearch()
    searchFuzzyMode.set('exact')
    searchQuery.set('shz')
    searchHits.value = []
    searchHitsQuery.value = 'shz'
    expect(api.suggestSwitchToFuzzy.value).toBe(true)

    // 结果还没回来：不提示（避免一闪而过的错误引导）
    searchHitsQuery.value = '别的查询'
    expect(api.suggestSwitchToFuzzy.value).toBe(false)

    // 精确模式有命中：不提示
    searchHitsQuery.value = 'shz'
    searchHits.value = ['a1']
    expect(api.suggestSwitchToFuzzy.value).toBe(false)

    // 模糊模式下零命中：不提示（已经是模糊了）
    searchHits.value = []
    searchFuzzyMode.set('fuzzy')
    expect(api.suggestSwitchToFuzzy.value).toBe(false)
    w.unmount()
  })

  it('一键切到模糊：把 searchFuzzyMode 置回 fuzzy', () => {
    const { api, w } = mountSearch()
    searchFuzzyMode.set('exact')
    api.switchToFuzzy()
    expect(searchFuzzyMode.get()).toBe('fuzzy')
    w.unmount()
  })

  it('键盘导航：下/上/回车/Esc', () => {
    const { api, w } = mountSearch()
    searchQuery.set('车')
    searchHits.value = ['a1', 'b2']
    searchHitsQuery.value = '车'
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
