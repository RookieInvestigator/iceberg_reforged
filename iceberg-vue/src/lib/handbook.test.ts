import { describe, expect, it } from 'vitest'
import { getShortMap, parseSections, segmentDesc, stripMdEm, normalizeDesc, splitParagraphs, hrefKind } from './handbook'

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
  it('首行 `> ` 从 desc 剥离，其余按软换行回流', () => {
    const m = parseSections(MD)
    // 两行之间没有空行、也没有行尾硬换行标记 → 视为同一段落，中文直接相接
    expect(m.get('划定标准')?.['甲类']).toBe('甲完整释义第一段。甲完整释义第二段。')
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
      { text: '这是', em: false, italic: false, bold: false },
      { text: '强调', em: true, italic: false, bold: false },
      { text: '文本', em: false, italic: false, bold: false },
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
      { text: '前', em: false, italic: false, bold: false },
      { text: '后', em: true, italic: false, bold: false },
    ])
    expect(plain('前==后')).toBe('前后')
  })

  it('🔒 引号 / 书名号不作强调定界符，原样输出', () => {
    const s = '俗称「鬼打墙」，见《山海经》与“民间传说”，另有『异闻』与‘讹传’'
    expect(segmentDesc(s)).toEqual([{ text: s, em: false, italic: false, bold: false }])
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
    expect(segmentDesc('「」《》')).toEqual([{ text: '「」《》', em: false, italic: false, bold: false }])
    expect(segmentDesc('====')).toEqual([])
  })
})

describe('normalizeDesc 换行语义', () => {
  it('软换行回流：中文行与行之间不加空格', () => {
    expect(normalizeDesc('互动解谜叙事体\n验。在互联网讨论中')).toBe('互动解谜叙事体验。在互联网讨论中')
  })

  it('软换行回流：拉丁文相邻补空格', () => {
    expect(normalizeDesc('Alternate Reality\nGame 的缩写')).toBe('Alternate Reality Game 的缩写')
  })

  it('行尾两个空格 = 显式硬换行（想断就断）', () => {
    expect(normalizeDesc('第一行  \n第二行')).toBe('第一行\n第二行')
  })

  it('行尾反斜杠同样是硬换行', () => {
    expect(normalizeDesc('第一行\\\n第二行')).toBe('第一行\n第二行')
  })

  it('空行 = 段落分隔', () => {
    expect(normalizeDesc('第一段\n\n第二段')).toBe('第一段\n\n第二段')
  })

  it('中文与拉丁混排直接相接时不补空格', () => {
    expect(normalizeDesc('中文\nARG 缩写')).toBe('中文ARG 缩写')
  })
})

describe('splitParagraphs 分段与换行区分', () => {
  it('空行切段，段内硬换行保留', () => {
    expect(splitParagraphs('第一段甲\n第一段乙\n\n第二段')).toEqual(['第一段甲\n第一段乙', '第二段'])
  })

  it('连续多个空行只切一次，忽略空段', () => {
    expect(splitParagraphs('甲\n\n\n\n乙')).toEqual(['甲', '乙'])
  })

  it('单段文本原样返回', () => {
    expect(splitParagraphs('只有一段。')).toEqual(['只有一段。'])
  })
})

describe('segmentDesc 斜体与加粗', () => {
  it('*斜体* 生成 italic 段，标记不出现', () => {
    const segs = segmentDesc('前*New Age*后')
    expect(segs.map((s) => s.text).join('')).toBe('前New Age后')
    expect(segs.filter((s) => s.italic).map((s) => s.text)).toEqual(['New Age'])
  })

  it('**加粗** 生成 bold 段', () => {
    const segs = segmentDesc('**重点**普通')
    expect(segs.filter((s) => s.bold).map((s) => s.text)).toEqual(['重点'])
  })

  it('可嵌套：加粗里套斜体', () => {
    const segs = segmentDesc('**粗*斜*粗**')
    expect(segs.filter((s) => s.bold && s.italic).map((s) => s.text)).toEqual(['斜'])
  })

  it('stripMdEm 同样剥掉星号', () => {
    expect(stripMdEm('*斜*与**粗**')).toBe('斜与粗')
  })
})

describe('segmentDesc 链接', () => {
  it('外链生成带 href 的段，文字为 label', () => {
    const segs = segmentDesc('见 [维基](https://zh.wikipedia.org/wiki/ARG) 条目')
    const link = segs.find((s) => s.href)
    expect(link?.text).toBe('维基')
    expect(link?.href).toBe('https://zh.wikipedia.org/wiki/ARG')
    expect(segs.map((s) => s.text).join('')).toBe('见 维基 条目')
  })

  it('站内路径与锚点保留', () => {
    expect(segmentDesc('[主页](/home)')[0]).toMatchObject({ text: '主页', href: '/home', }
    )
    expect(segmentDesc('[锚](#a)')[0]).toMatchObject({ text: '锚', href: '#a' })
  })

  it('危险协议不进链接，按原文字输出', () => {
    const segs = segmentDesc('点[这里](javascript:alert(1))')
    expect(segs.every((s) => !s.href)).toBe(true)
  })

  it('hrefKind 分类', () => {
    expect(hrefKind('https://a.example')).toBe('external')
    expect(hrefKind('/home')).toBe('internal')
    expect(hrefKind('#x')).toBe('hash')
  })

  it('stripMdEm 把链接还原为显示文字', () => {
    expect(stripMdEm('见[维基](https://a.example)')).toBe('见维基')
  })
})
