import { describe, expect, it } from 'vitest'
import { getShortMap, parseSections, stripMdEm } from './handbook'

const MD = [
  '# 术语表',
  '',
  '前言（首节前必须有前言行，否则 split 会吃掉第一节，与真实 md 一致）。',
  '## 划定标准',
  '### 甲类',
  '> 甲一句话短版。',
  '甲完整释义第一段。',
  '甲完整释义第二段。',
  '### 乙类',
  '乙完整释义（无短版）。',
  '## 各类概念',
  '### 丙',
  '> 丙短版。',
  '丙释义。',
].join('\n')

describe('parseSections 短版行剥离', () => {
  it('首行 `> ` 从 desc 剥离，其余不动', () => {
    const m = parseSections(MD)
    expect(m.get('划定标准')?.['甲类']).toBe('甲完整释义第一段。\n甲完整释义第二段。')
    expect(m.get('划定标准')?.['乙类']).toBe('乙完整释义（无短版）。')
    expect(m.get('各类概念')?.['丙']).toBe('丙释义。')
  })
})

describe('stripMdEm', () => {
  it('去掉 == 标记留文字，残缺标记也清掉', () => {
    expect(stripMdEm('这是==强调==文本')).toBe('这是强调文本')
    expect(stripMdEm('无标记')).toBe('无标记')
    expect(stripMdEm('残缺==标记')).toBe('残缺标记')
  })
})
describe('getShortMap', () => {
  it('只收各节首行 `> `，非首行不管', () => {
    const MD2 = MD + '\n## 人物作品\n### 丁\n丁释义。\n> 非首行引用\n'
    expect(getShortMap(MD2)).toMatchObject({
      '甲类': '甲一句话短版。',
      '丙': '丙短版。',
    })
    expect(getShortMap(MD2)['乙类']).toBeUndefined()
    expect(getShortMap(MD2)['丁']).toBeUndefined()
  })
})
