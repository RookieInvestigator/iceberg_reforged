import { describe, expect, it } from 'vitest'
import { layoutPages, parseText, toChineseNum, numToZh, pageNumbers } from './engine'
import { cellStyle, punctKind, titleParts, inkColor, judouStyle } from './render'
import { calcLayout, defaultLayoutConfig, defaultPrefs, JUDOU, FONT_STACKS } from './layout'
import type { Token } from './types'

/**
 * 古籍 v2 门禁。
 *
 * 钉住三件在 v1 里反复出错的事：
 * 1. 夹注一格 4 小字（2 列 × 2 行），两列字数差 ≤ 1
 * 2. layoutPages 不死循环（v1 曾因 span > cap 卡死主线程）
 * 3. 句读三档行为正确
 */

function tokensOf(text: string): Token[] {
  const ci = Array.from({ length: text.length }, (_, i) => (i > 4 ? 0 : -1))
  return parseText(text, ci)
}

describe('夹注分栏（一格 4 小字）', () => {
  it('8 个字 → 2 个字格，每格 4 个', () => {
    const cells = layoutPages(tokensOf('【测试】\n（甲乙丙丁戊己庚辛）'), 10, 20)
    const cms = cells.filter((c) => c.cm)
    expect(cms).toHaveLength(8)

    const groups = new Map<string, typeof cms>()
    for (const c of cms) {
      const k = `${c.rw}/${c.cl}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(c)
    }
    expect(groups.size).toBe(2)
    for (const [, list] of groups) {
      expect(list).toHaveLength(4)
      // 4 个位置（subCol × subRow）互不重复
      expect(new Set(list.map((c) => `${c.subCol}${c.subRow}`)).size).toBe(4)
    }
  })

  it('两列字数差 ≤ 1（对半分，不是右列塞满）', () => {
    const cells = layoutPages(tokensOf('【测试】\n（甲乙丙丁戊己庚辛壬癸）'), 10, 20)
    const cms = cells.filter((c) => c.cm)
    const right = cms.filter((c) => c.subCol === 1).length
    const left = cms.filter((c) => c.subCol === 2).length
    expect(Math.abs(right - left)).toBeLessThanOrEqual(1)
    expect(left).toBeGreaterThan(0)
  })

  it('夹注整块居中在列内（列间距加宽也不偏）', () => {
    const cells = layoutPages(tokensOf('【测试】\n（甲乙丙丁）'), 10, 20)
    const cms = cells.filter((c) => c.cm)
    const right = cms.find((c) => c.subCol === 1)!
    const left = cms.find((c) => c.subCol === 2)!
    // 两列都以列中心为基准，各偏 cw/4（右列 +、左列 -）
    expect(cellStyle(right)).toContain('justify-self:center')
    expect(cellStyle(right)).toContain('0.25')
    expect(cellStyle(left)).toContain('-0.25')
  })
})

describe('正文西文在列尾不整段跳列', () => {
  it('剩余行放不下长串时，切一段留在本列（不留空白行）', () => {
    // 6 行高的版面：先放 2 个汉字占 2 行，再来一个「需要 3 行」的英文串 —— 只剩 4 行，放得下；
    // 关键是被推到列尾的情形：把行数压到 4，汉字 3 个后剩 1 行，英文必须切
    const tokens = parseText('漢漢漢abc', Array.from({ length: 20 }, () => -1))
    const cells = layoutPages(tokens, 4, 4, (t, small) => (small ? 1 : Math.max(1, Math.ceil(t.length * 0.5))))
    const eng = cells.filter((c) => c.isEng)
    // 「abc」在 4 行版面、剩 1 行时切成两段：
    expect(eng.length).toBeGreaterThanOrEqual(1)
    const first = eng[0]!
    expect(first.rw + first.span).toBeLessThanOrEqual(4)
    // 段首必须紧接在汉字之后（rw = 3），不能因为放不下就整段跳到下一列
    expect(first.rw).toBe(cells.find((c) => c.c === '漢' && c.rw === 2)!.rw + 1)
  })
})

describe('夹注里的西文（半行槽）', () => {  it('西文按半行槽计费，整串放进一列而不是被压成 span 1', () => {
    const tokens = parseText('【测试】\n（abc）\n正文', Array.from({ length: 20 }, (_, i) => (i > 4 ? 0 : -1)))
    // small = 夹注：8 个半行槽；正文：2 行
    const cells = layoutPages(tokens, 6, 8, (_t, isSmall) => (isSmall ? 8 : 2))
    const eng = cells.find((c) => c.cm && c.isEng)!
    expect(eng.span).toBe(8)
    // 正文必须仍然排在夹注之后（同一页、行号更大），没有被挤掉
    const body = cells.filter((c) => !c.cm && !c.hw)
    expect(body.length).toBe(2)
    expect(body[0]!.rw).toBeGreaterThan(0)
  })
  it('正文西文仍按整行计费', () => {
    const tokens = parseText('abc', [-1, -1, -1])
    const cells = layoutPages(tokens, 6, 8, (_t, isSmall) => (isSmall ? 8 : 2))
    expect(cells[0]!.span).toBe(2)
  })
})

describe('字母统一处理（拉丁 / 西里尔 / 希腊）', () => {  it('西里尔字母串整体作为一个旋转西文 token', () => {
    const t = tokensOf('ВИ')
    // 「В」「И」都不是汉字也不是数字分支：必须合成**一个** isEng token
    expect(t.filter((x) => x.isEng)).toHaveLength(1)
    expect(t.find((x) => x.isEng)!.c).toBe('ВИ')
  })
  it('混排里字母与数字连写', () => {
    const t = tokensOf('abc123')
    expect(t).toHaveLength(1)
    expect(t[0]!.isEng).toBe(true)
  })
  it('纯数字不进西文分支（要走汉字数字）', () => {
    const t = tokensOf('375')
    expect(t.some((x) => x.isEng)).toBe(false)
    expect(t.map((x) => x.c).join('')).toBe('三七五')
  })
})

describe('layoutPages 不死循环', () => {
  it('超长英文夹注（span 大于单行容量）', () => {
    expect(() => layoutPages(tokensOf(`【测试】\n（${'a'.repeat(200)}）`), 3, 6)).not.toThrow()
  })
  it('极小版面 + 大量内容', () => {
    expect(() => layoutPages(tokensOf('【测试】\n' + '正文'.repeat(500)), 3, 6)).not.toThrow()
  })
  it('空 token 流', () => {
    expect(layoutPages([], 10, 20)).toEqual([])
  })
})

describe('句读（只有显示 / 不显示）', () => {
  it('显示：句号→stop、顿号→pause', () => {
    expect(punctKind('。', true)).toBe('stop')
    expect(punctKind('、', true)).toBe('pause')
  })
  it('不显示：一律 null（白文）', () => {
    expect(punctKind('。', false)).toBeNull()
    expect(punctKind('、', false)).toBeNull()
  })
  it('无标点返回 null', () => {
    expect(punctKind(undefined, true)).toBeNull()
    expect(punctKind('', true)).toBeNull()
  })
})

describe('版面计算', () => {
  it('密排：字格 = 字号 × 1.08', () => {
    const cfg = defaultLayoutConfig(1440, 900)
    const st = calcLayout([], 0, 1440, 900, cfg)
    const cw = parseInt(st.cssVars['--cw']!, 10)
    const fs = parseInt(st.cssVars['--fs']!, 10)
    expect(cw / fs).toBeCloseTo(1.08, 1)
  })

  it('列间距独立于字格（--col-w = --cw + --col-gap）', () => {
    const st = calcLayout([], 0, 1440, 900)
    const cw = parseInt(st.cssVars['--cw']!, 10)
    const gap = parseInt(st.cssVars['--col-gap']!, 10)
    const colW = parseInt(st.cssVars['--col-w']!, 10)
    expect(colW).toBe(cw + gap)
    expect(gap).toBeGreaterThan(0)
  })

  it('列间距为 0 时退回密排', () => {
    const prefs = { ...defaultPrefs(), colGap: 0 }
    const cfg = defaultLayoutConfig(1440, 900, prefs)
    const st = calcLayout([], 0, 1440, 900, cfg)
    expect(parseInt(st.cssVars['--col-gap']!, 10)).toBe(0)
  })

  it('字体栈随偏好切换', () => {
    const prefs = { ...defaultPrefs(), font: 'sotyr' as const }
    const cfg = defaultLayoutConfig(1440, 900, prefs)
    const st = calcLayout([], 0, 1440, 900, cfg)
    expect(st.cssVars['--font-stack']).toContain('Sotyr')
  })

  it('五款字体都自托管，栈里不挂系统楷体/仿宋', () => {
    for (const f of ['song', 'hei', 'kai', 'fangsong', 'sotyr'] as const) {
      const stack = FONT_STACKS[f]
      expect(stack).not.toMatch(/Kaiti|KaiTi|STKaiti|FangSong|STFangsong|SimSun|Songti/)
    }
  })

  it('每款字体的字栈都以花园明朝兜底生僻字', () => {
    for (const f of ['song', 'hei', 'kai', 'fangsong', 'sotyr'] as const) {
      expect(FONT_STACKS[f]).toContain('HanaMinA')
    }
  })

  it('天头 > 地脚', () => {
    const st = calcLayout([], 0, 1440, 900)
    const head = parseInt(st.cssVars['--head-h']!, 10)
    const foot = parseInt(st.cssVars['--foot-h']!, 10)
    expect(head).toBeGreaterThan(foot)
  })

  it('窄屏走单页模式', () => {
    const st = calcLayout([], 0, 390, 844)
    expect(st.single).toBe(true)
  })

  it('cur 越界被夹到 max', () => {
    const st = calcLayout(tokensOf('【测试】\n正文'), 999, 1440, 900)
    expect(st.cur).toBeLessThanOrEqual(st.max)
  })
})

describe('句读定位（固定字格下缘偏右）', () => {
  it('落在字格下缘偏右（古籍圈点位置）', () => {
    const s = judouStyle(JUDOU)
    expect(s).toContain('bottom:')
    expect(s).toContain('right:')
  })

  it('样式含宽高与颜色（否则标记不可见）', () => {
    const s = judouStyle(JUDOU)
    expect(s).toContain('width:')
    expect(s).toContain('height:')
    expect(s).toContain('color:')
  })
})

describe('标题分段', () => {
  it('卷首页只取卷名，不吞后续词条标题', () => {
    const cells = layoutPages(tokensOf('⚐【廣知一】\f【北京公交车】\n正文'), 10, 20)
    const parts = titleParts(cells)
    expect(parts.join('')).toBe('廣知一')
  })
})

describe('宣纸底可读色', () => {
  it('纯白映射成淡墨（不是隐形白）', () => {
    const c = inkColor('#FFFFFF', 0)
    expect(c).not.toBe('#FFFFFF')
    expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('亮色被压暗到可读区间', () => {
    const c = inkColor('#FFF700', 4)
    const n = parseInt(c.slice(1), 16)
    const lum = ((0.299 * ((n >> 16) & 255)) + (0.587 * ((n >> 8) & 255)) + (0.114 * (n & 255))) / 255
    expect(lum).toBeLessThan(0.5)
  })
})

describe('数字转中文（统一读法）', () => {
  it('一位与十位', () => {
    expect(toChineseNum(0)).toBe('〇')
    expect(toChineseNum(1)).toBe('一')
    expect(toChineseNum(10)).toBe('十')
    expect(toChineseNum(12)).toBe('十二')
    expect(toChineseNum(20)).toBe('二十')
    expect(toChineseNum(21)).toBe('二十一')
    expect(toChineseNum(99)).toBe('九十九')
  })
  it('三位以上逐位读（年代、编号、叶码）', () => {
    expect(toChineseNum(100)).toBe('一〇〇')
    expect(toChineseNum(105)).toBe('一〇五')
    expect(numToZh('1999')).toBe('一九九九')
    expect(numToZh('375')).toBe('三七五')
  })
  it('年份 / 版次逐位读（86年 → 八六年，不是八十六年）', () => {
    expect(numToZh('86', true)).toBe('八六')
    expect(numToZh('25', true)).toBe('二五')
    const t = tokensOf('一九八〇年前后')
    expect(t.map((x) => x.c).join('')).toBe('一九八〇年前后')
    const years = parseText('86年与25版的往事', Array.from({ length: 20 }, () => -1))
    expect(years.map((x) => x.c).join('')).toBe('八六年与二五版的往事')
  })
  it('数量仍按十位读（86人 → 八十六人）', () => {
    const t = parseText('86人', [-1, -1, -1])
    expect(t.map((x) => x.c).join('')).toBe('八十六人')
  })
  it('叶码与导航同源：一页一号', () => {
    expect(pageNumbers(0)).toEqual([1, 2])
    expect(pageNumbers(3, true)).toEqual([4])
  })
})

describe('默认配置', () => {
  it('圈点默认值（位置固定，只有一个开关）', () => {
    expect(JUDOU.color).toBe('#b22d1e')
    expect(JUDOU.size).toBeGreaterThan(0.2)
    expect(defaultPrefs().punct).toBe(true)
  })
  it('页边留白可调（书口侧与订口比都在偏好里）', () => {
    const p = defaultPrefs()
    expect(p.marginRatio).toBeGreaterThan(0)
    expect(p.gutterRatio).toBeGreaterThan(1)
  })
})
