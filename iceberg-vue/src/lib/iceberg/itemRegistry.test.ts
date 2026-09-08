import { describe, expect, it, vi } from 'vitest'
import { clearItemRegistry, getItemEl, onItemMount, registerItem } from './itemRegistry'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

describe('itemRegistry', () => {
  it('注册 / 查询 / 注销', () => {
    clearItemRegistry()
    const el = document.createElement('span')
    expect(getItemEl('a1')).toBeUndefined()
    registerItem('a1', el)
    expect(getItemEl('a1')).toBe(el)
    registerItem('a1', null)
    expect(getItemEl('a1')).toBeUndefined()
  })

  it('新挂载通知监听者，作用域销毁后不再通知', () => {
    clearItemRegistry()
    const fn = vi.fn()
    const Host = defineComponent({
      setup() {
        onItemMount(fn)
        return () => null
      },
    })
    const w = mount(Host)
    const el = document.createElement('span')
    registerItem('b2', el)
    expect(fn).toHaveBeenCalledWith('b2', el)
    w.unmount()
    registerItem('c3', el)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
