import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import ScatterField from './ScatterField.vue'
import { FILTER_VISIBLE_KEY } from '../../lib/injectionKeys'

const items = Array.from({ length: 20 }, (_, i) => ({
  id: String(i),
  title: `词条${i}`,
  category: 'A',
  categoryColor: '#fff',
  emojis: [],
  tier: 'T1',
}))

// v-show 通过 inline style.display 生效；happy-dom 的 getComputedStyle 不反映 inline display，
// el.isVisible() 在此环境不可靠，故直接断言 style.display
function visibleItems(w: ReturnType<typeof mount>) {
  return w.findAll('.iceberg-item').filter((el) => (el.element as HTMLElement).style.display !== 'none')
}
function mountWithFilter(set: Set<string> | null) {
  return mount(ScatterField, {
    props: { items },
    global: { provide: { [FILTER_VISIBLE_KEY]: ref(set) } },
  })
}

describe('ScatterField（无层级模式）', () => {
  it('渲染全部词条', () => {
    const w = mount(ScatterField, { props: { items } })
    expect(w.findAll('.iceberg-item')).toHaveLength(20)
  })

  it('顺序被随机打乱（不等于输入顺序）', () => {
    const w = mount(ScatterField, { props: { items } })
    const titles = w.findAll('.item-title').map((n) => n.text())
    expect(titles).not.toEqual(items.map((i) => i.title))
  })

  it('打乱后词条无丢失无重复', () => {
    const w = mount(ScatterField, { props: { items } })
    const titles = w.findAll('.item-title').map((n) => n.text())
    expect([...titles].sort()).toEqual(items.map((i) => i.title).sort())
  })

  it('词条带 data-id / data-category（交互委托所需）', () => {
    const w = mount(ScatterField, { props: { items } })
    const first = w.find('.iceberg-item')
    expect(first.attributes('data-id')).toBeDefined()
    expect(first.attributes('data-category')).toBe('A')
  })

  it('filterVisible 未注入（null）时显示全部', () => {
    const w = mount(ScatterField, { props: { items } })
    expect(visibleItems(w)).toHaveLength(20)
  })

  it('filterVisible 为 null 时显示全部', () => {
    const w = mountWithFilter(null)
    expect(visibleItems(w)).toHaveLength(20)
  })

  it('filterVisible 为空 Set 时全部隐藏', () => {
    const w = mountWithFilter(new Set())
    expect(visibleItems(w)).toHaveLength(0)
  })

  it('filterVisible 单条命中时仅显示命中词条', () => {
    const w = mountWithFilter(new Set(['3']))
    const visible = visibleItems(w)
    expect(visible).toHaveLength(1)
    expect(visible[0].attributes('data-id')).toBe('3')
  })

  it('filterVisible 多条命中时显示全部命中词条', () => {
    const w = mountWithFilter(new Set(['2', '5', '9']))
    expect(visibleItems(w)).toHaveLength(3)
  })

  it('容器带上下留白（与层级一致 py-10）', () => {
    const w = mount(ScatterField, { props: { items } })
    const container = w.find('.flex.flex-wrap')
    expect(container.classes()).toContain('py-10')
  })
})
