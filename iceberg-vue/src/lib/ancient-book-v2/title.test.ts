import { describe, expect, it } from 'vitest'
import { layoutPages, parseText } from './engine'
import { titleParts } from './render'

describe('书名页标题', () => {
  it('titleParts 返回正确顺序的标题', () => {
    const text = '⚑【中文兔子洞冰山圖】\f'
    const ci = Array.from({ length: text.length }, () => -1)
    const tokens = parseText(text, ci)
    const cells = layoutPages(tokens, 10, 20)
    const parts = titleParts(cells)
    console.log('parts:', JSON.stringify(parts))
    console.log('joined:', parts.join(''))
    expect(parts.join('')).toBe('中文兔子洞冰山圖')
  })
})
