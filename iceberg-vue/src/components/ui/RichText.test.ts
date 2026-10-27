import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RichText from './RichText.vue'

// RouterLink 走桩，聚焦「渲染结构 + 标记类名 + 链接安全属性」这几件真实会坏的事
const stubs = {
  RouterLink: { props: ['to'], template: '<a class="rt-link internal" :to="to"><slot /></a>' },
}
const mountRich = (text: string, inline = false) =>
  mount(RichText, { props: { text, inline }, global: { stubs } })

describe('RichText 块级渲染', () => {
  it('一个段落渲染为一个 p，多段落各一个', () => {
    const w = mountRich('第一段\n\n第二段')
    expect(w.findAll('p.rt-p').map((p) => p.text())).toEqual(['第一段', '第二段'])
    expect(w.find('blockquote').exists()).toBe(false)
  })

  it('> 开头的段落渲染为 blockquote，并剥掉行首标记', () => {
    const w = mountRich('前言\n\n> 引文一\n> 引文二')
    expect(w.findAll('p.rt-p')).toHaveLength(1)
    expect(w.find('blockquote.rt-quote').text()).toBe('引文一\n引文二')
  })

  it('行内标记输出对应类名，标记符号不出现', () => {
    const w = mountRich('甲==强调==乙**粗**丙*斜*丁')
    expect(w.find('.rt-em').text()).toBe('强调')
    expect(w.find('.rt-b').text()).toBe('粗')
    expect(w.find('.rt-i').text()).toBe('斜')
    expect(w.text()).not.toContain('==')
    expect(w.text()).not.toContain('**')
  })

  it('外链带 target/rel，站内链接走路由，危险协议不出链接', () => {
    const ok = mountRich('[站点](https://a.example) 与 [手册](/handbook)')
    const ext = ok.find('a.rt-link:not(.internal)')
    expect(ext.attributes('href')).toBe('https://a.example')
    expect(ext.attributes('target')).toBe('_blank')
    expect(ext.attributes('rel')).toContain('noopener')
    expect(ok.find('a.internal').exists()).toBe(true)

    const bad = mountRich('点[这里](javascript:alert(1))')
    expect(bad.find('a').exists()).toBe(false)
    expect(bad.text()).toContain('这里')
  })

  it('引用块内同样解析行内标记', () => {
    const w = mountRich('> 这段**很粗**')
    expect(w.find('blockquote .rt-b').text()).toBe('很粗')
  })
})

describe('RichText 内联模式（tooltip）', () => {
  it('不产生块级元素，标记与链接照常渲染', () => {
    const w = mountRich('甲==强调==见[维基](https://a.example)', true)
    expect(w.element.tagName).toBe('SPAN')
    expect(w.find('p').exists()).toBe(false)
    expect(w.find('.rt-em').exists()).toBe(true)
    expect(w.find('a.rt-link').attributes('href')).toBe('https://a.example')
  })

  it('段内换行由 pre-line 处理，不拆成多行元素', () => {
    const w = mountRich('第一行\n第二行', true)
    expect(w.text()).toBe('第一行\n第二行')
  })
})
