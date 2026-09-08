import { beforeEach, describe, expect, it } from 'vitest'
import { clearTipFit, fitTipIntoView } from './fitTip'

function mockRect(el: HTMLElement, rect: { left: number; right: number }) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, top: 0, bottom: 0, width: rect.right - rect.left, height: 0 }),
  })
}

describe('fitTipIntoView', () => {
  let host: HTMLElement
  let link: HTMLElement
  let tip: HTMLElement
  beforeEach(() => {
    document.body.innerHTML = ''
    host = document.createElement('div')
    host.className = 'modal-body'
    link = document.createElement('a')
    link.className = 'meta-chip'
    tip = document.createElement('span')
    tip.className = 'meta-tip'
    link.appendChild(tip)
    host.appendChild(link)
    document.body.appendChild(host)
    mockRect(host, { left: 100, right: 600 })
  })

  it('左溢出右移', () => {
    mockRect(tip, { left: 40, right: 300 })
    fitTipIntoView(link)
    expect(tip.style.marginLeft).toBe('68px')
  })

  it('右溢出左移', () => {
    mockRect(tip, { left: 400, right: 660 })
    fitTipIntoView(link)
    expect(tip.style.marginLeft).toBe('-68px')
  })

  it('界内不动', () => {
    mockRect(tip, { left: 200, right: 400 })
    fitTipIntoView(link)
    expect(tip.style.marginLeft).toBe('')
  })

  it('无 tip / 无 link 不抛错', () => {
    expect(() => fitTipIntoView(document.createElement('div'))).not.toThrow()
    expect(() => fitTipIntoView(null)).not.toThrow()
  })

  it('clearTipFit 清除位移', () => {
    mockRect(tip, { left: 40, right: 300 })
    fitTipIntoView(link)
    expect(tip.style.marginLeft).not.toBe('')
    clearTipFit(link)
    expect(tip.style.marginLeft).toBe('')
  })
})
