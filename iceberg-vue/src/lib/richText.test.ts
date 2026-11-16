import { describe, expect, it } from 'vitest'
import {
  groupUnbreakable,
  hrefKind,
  normalizeDesc,
  parseRichBlocks,
  safeHref,
  segmentDesc,
  splitParagraphs,
  stripMdEm,
  toPlainText,
} from './richText'

describe('segmentDesc 行内标记', () => {
  it('三种标记各自生效且不进入输出', () => {
    const segs = segmentDesc('甲==强调==乙**粗**丙*斜*丁')
    expect(segs.map((s) => s.text).join('')).toBe('甲强调乙粗丙斜丁')
    expect(segs.find((s) => s.text === '强调')).toMatchObject({ em: true, bold: false, italic: false })
    expect(segs.find((s) => s.text === '粗')).toMatchObject({ em: false, bold: true })
    expect(segs.find((s) => s.text === '斜')).toMatchObject({ italic: true })
  })

  it('标记可嵌套：粗套斜', () => {
    const segs = segmentDesc('**粗*斜*粗**')
    const inner = segs.find((s) => s.text === '斜')
    expect(inner).toMatchObject({ bold: true, italic: true })
  })

  it('链接优先生成带 href 的段，危险协议按普通文字处理', () => {
    const ok = segmentDesc('见[维基](https://zh.wikipedia.org/wiki/ARG)')
    expect(ok.find((s) => s.href)?.href).toBe('https://zh.wikipedia.org/wiki/ARG')
    const bad = segmentDesc('点[这里](javascript:alert(1))')
    expect(bad.every((s) => !s.href)).toBe(true)
  })
})

describe('safeHref / hrefKind', () => {
  it('站内路径、锚点、http(s) 通过，其余协议拒绝', () => {
    expect(safeHref('/home')).toBe('/home')
    expect(safeHref('?tab=criteria')).toBe('?tab=criteria')
    expect(safeHref('#anchor')).toBe('#anchor')
    expect(safeHref('https://a.example')).toBe('https://a.example')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
  })

  it('分类', () => {
    expect(hrefKind('https://a.example')).toBe('external')
    expect(hrefKind('/home')).toBe('internal')
    expect(hrefKind('#x')).toBe('hash')
  })
})

describe('parseRichBlocks 引用块', () => {
  it('普通段落按空行切分', () => {
    expect(parseRichBlocks('第一段\n\n第二段')).toEqual([
      { type: 'p', text: '第一段' },
      { type: 'p', text: '第二段' },
    ])
  })

  it('整段以 > 开头 = 引用块，并剥掉行首标记', () => {
    expect(parseRichBlocks('前言\n\n> 引文一\n> 引文二')).toEqual([
      { type: 'p', text: '前言' },
      { type: 'quote', text: '引文一\n引文二' },
    ])
  })

  it('混排（部分行引用）按普通段落处理，不吞正文里的 >', () => {
    const blocks = parseRichBlocks('看这个 > 符号\n> 但只有一行是引用')
    expect(blocks).toEqual([{ type: 'p', text: '看这个 > 符号\n> 但只有一行是引用' }])
  })

  it('引用块内保留行内标记（由 RichInline 再解析）', () => {
    const [block] = parseRichBlocks('> 这段**很粗**')
    expect(block.type).toBe('quote')
    expect(segmentDesc(block.text).find((s) => s.text === '很粗')?.bold).toBe(true)
  })

  it('空段落被过滤', () => {
    expect(parseRichBlocks('\n\n   \n\n正文\n\n')).toEqual([{ type: 'p', text: '正文' }])
  })
})

describe('纯文本降级', () => {
  it('stripMdEm 剥标记、链接只留文字', () => {
    expect(stripMdEm('这是==强调==与**粗**和*斜*')).toBe('这是强调与粗和斜')
    expect(stripMdEm('见[维基](https://a.example)')).toBe('见维基')
  })

  it('toPlainText 连引用标记一起去掉', () => {
    expect(toPlainText('正文\n\n> 引文一\n> 引文二')).toBe('正文\n\n引文一\n引文二')
    expect(toPlainText('> **粗**引文')).toBe('粗引文')
  })
})

describe('normalizeDesc 换行规整', () => {
  it('软换行按中英文回流：中文不加空格、拉丁文补空格', () => {
    expect(normalizeDesc('中文\n换行')).toBe('中文换行')
    expect(normalizeDesc('hello\nworld')).toBe('hello world')
  })

  it('行尾反斜杠 / 两个空格 = 硬换行', () => {
    expect(normalizeDesc('第一行\\\n第二行')).toBe('第一行\n第二行')
    expect(normalizeDesc('第一行  \n第二行')).toBe('第一行\n第二行')
  })

  it('空行 = 段落分隔', () => {
    expect(normalizeDesc('甲\n\n乙')).toBe('甲\n\n乙')
    expect(splitParagraphs('甲\n\n乙')).toEqual(['甲', '乙'])
  })

  it('引用块的行不被回流合并（否则整段引用会被拼成一行）', () => {
    const out = normalizeDesc('前言\n\n> 引文一\n> 引文二')
    expect(out).toBe('前言\n\n> 引文一\n> 引文二')
    expect(parseRichBlocks(out)[1]).toEqual({ type: 'quote', text: '引文一\n引文二' })
  })
})

// clreq §6.1.2 符号分离禁则
describe('groupUnbreakable 不可断行组', () => {
  it('省略号 / 破折号作为整体，不得从中间拆行', () => {
    const parts = groupUnbreakable('他说……然后——停住')
    expect(parts.filter((p) => p.nobreak).map((p) => p.text)).toEqual(['……', '——'])
    expect(parts.map((p) => p.text).join('')).toBe('他说……然后——停住')
  })

  it('数字串与 % ℃ 等单位符号不被拆开', () => {
    expect(groupUnbreakable('温度 38℃ 增长 50%')
      .filter((p) => p.nobreak).map((p) => p.text)).toEqual(['38℃', '50%'])
    expect(groupUnbreakable('1999年').find((p) => p.nobreak)?.text).toBe('1999')
  })

  it('普通中文文本不被切碎、原样可还原', () => {
    const src = '这是一段普通的中文正文，没有数字。'
    expect(groupUnbreakable(src).map((p) => p.text).join('')).toBe(src)
    expect(groupUnbreakable(src).every((p) => !p.nobreak)).toBe(true)
  })

  it('空串返回空数组', () => {
    expect(groupUnbreakable('')).toEqual([])
  })
})
