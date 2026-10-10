import { describe, expect, it } from 'vitest'
import { getShortMap, parseSections, segmentDesc, stripMdEm } from './handbook'

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

describe('segmentDesc（术语表描述强调解析）', () => {
  const plain = (t: string) => segmentDesc(t).map((s) => s.text).join('')
  const emText = (t: string) => segmentDesc(t).filter((s) => s.em).map((s) => s.text).join('|')

  it('==...== 只切换高亮，标记不进输出', () => {
    expect(segmentDesc('这是==强调==文本')).toEqual([
      { text: '这是', em: false },
      { text: '强调', em: true },
      { text: '文本', em: false },
    ])
    expect(plain('这是==强调==文本')).toBe('这是强调文本')
  })

  it('嵌套 ==：内层关闭后回到高亮，标记同样不输出', () => {
    expect(emText('a==b==c==d==e')).toBe('b|d')
    expect(plain('a==b==c==d==e')).toBe('abcde')
  })

  it('未闭合的 == 一路高亮到末尾（标记仍不输出）', () => {
    const segs = segmentDesc('前==后')
    expect(segs).toEqual([
      { text: '前', em: false },
      { text: '后', em: true },
    ])
    expect(plain('前==后')).toBe('前后')
  })

  it('🔒 引号 / 书名号不作强调定界符，原样输出', () => {
    const s = '俗称「鬼打墙」，见《山海经》与“民间传说”，另有『异闻』与‘讹传’'
    expect(segmentDesc(s)).toEqual([{ text: s, em: false }])
    expect(emText(s)).toBe('')
    // 引号原样保留，不被吞掉
    expect(plain(s)).toBe(s)
  })

  it('引号里套 == 时只有 == 部分高亮', () => {
    expect(emText('「这是==重点==的」')).toBe('重点')
    expect(plain('「这是==重点==的」')).toBe('「这是重点的」')
  })

  it('空串 / 纯引号 / 纯 == 都安全', () => {
    expect(segmentDesc('')).toEqual([])
    expect(segmentDesc('「」《》')).toEqual([{ text: '「」《》', em: false }])
    expect(segmentDesc('====')).toEqual([])
  })
})
