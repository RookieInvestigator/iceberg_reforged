import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useV2NavVisibility } from './useV2NavVisibility'

function mountNav() {
  let api!: ReturnType<typeof useV2NavVisibility>
  const Host = defineComponent({
    setup() {
      api = useV2NavVisibility({ tierOrder: ['Tier 1'], suggestOpen: ref(false) })
      return { api }
    },
    template: `<div :ref="(el) => { api.barRef.value = el }"></div>`,
  })
  const w = mount(Host, { attachTo: document.body })
  return { api, w }
}

describe('useV2NavVisibility togglePanel', () => {
  it('栏内按钮正常开关', () => {
    const { api, w } = mountNav()
    expect(api.expanded.value).toBe(false)
    api.togglePanel('bar')
    expect(api.expanded.value).toBe(true)
    api.togglePanel('bar')
    expect(api.expanded.value).toBe(false)
    w.unmount()
  })

  it('FAB 在外部 mousedown 关面板后点一次不重开，再点打开', () => {
    const { api, w } = mountNav()
    api.togglePanel('bar')
    expect(api.expanded.value).toBe(true)
    // 外部 mousedown（目标为 body，非栏内）→ 关闭并立 flag
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(api.expanded.value).toBe(false)
    api.togglePanel('fab')
    expect(api.expanded.value).toBe(false)
    api.togglePanel('fab')
    expect(api.expanded.value).toBe(true)
    w.unmount()
  })

  it('scrollToTier 目标缺失不抛错', () => {
    const { api, w } = mountNav()
    expect(() => api.scrollToTier('不存在的层级')).not.toThrow()
    w.unmount()
  })
})
