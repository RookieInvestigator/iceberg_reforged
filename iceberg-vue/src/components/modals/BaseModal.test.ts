import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import BaseModal from './BaseModal.vue'

// P1-7：对话框语义 + 焦点管理（打开移焦 / Tab 循环 / 关闭还原）
// 注意：BaseModal 内容 Teleport 到 body，断言需从 document.body 查询
function panelEl(): HTMLElement | null {
  return document.body.querySelector('.modal-panel')
}

describe('BaseModal', () => {
  it('渲染 dialog 语义并用标题建立 labelledby 关联', () => {
    const wrapper = mount(BaseModal, { props: { title: '测试标题' }, attachTo: document.body })
    const panel = panelEl()
    expect(panel).toBeTruthy()
    expect(panel!.getAttribute('role')).toBe('dialog')
    expect(panel!.getAttribute('aria-modal')).toBe('true')
    const labelledby = panel!.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(document.getElementById(labelledby!)?.textContent).toBe('测试标题')
    wrapper.unmount()
  })

  it('打开时焦点移入面板内第一个可聚焦元素，卸载后还原到触发元素', async () => {
    const trigger = document.createElement('button')
    trigger.className = 'open-trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    const wrapper = mount(BaseModal, {
      props: { title: '测试' },
      slots: { default: '<button class="first-ctl">确定</button><button class="second-ctl">取消</button>' },
      attachTo: document.body,
    })
    await nextTick()
    // DOM 顺序上头部关闭按钮是面板内第一个可聚焦元素
    expect(document.activeElement?.className).toContain('modal-close')
    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('Tab / Shift+Tab 在面板内循环不逃逸', async () => {
    const wrapper = mount(BaseModal, {
      props: { title: '测试' },
      slots: { default: '<button class="first-ctl">确定</button><button class="second-ctl">取消</button>' },
      attachTo: document.body,
    })
    await nextTick()
    const first = document.body.querySelector('.modal-close') as HTMLElement
    const last = document.body.querySelector('.second-ctl') as HTMLElement
    last.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first)
    first.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('Escape 触发 close', async () => {
    const wrapper = mount(BaseModal, { props: { title: '测试' }, attachTo: document.body })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
