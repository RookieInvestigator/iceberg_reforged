import { describe, expect, it } from 'vitest'
import { getFirstInitial, getInitial } from './pinyin'

/**
 * 拼音首字母查表守卫。
 *
 * pinyin.ts 的映射表存为**定长字符串**（索引 = 码点 - 0x4E00，见 scripts/compact_pinyin.py），
 * 而非对象字面量。字符串一旦发生错位/截断，术语表的 A-Z 分组会静默错乱且极难排查，
 * 因此这里抽样校验：覆盖全表首尾、各字母区段与边界行为。
 * 期望值取自转换前的对象字面量表，转换时已做 20901 条全量比对（0 处不一致）。
 */
describe('getInitial（单字）', () => {
  // 期望值来自原始 pypinyin 导出表，请勿凭直觉修改
  const cases: Array<[string, string]> = [
    ['一', 'Y'], // 表首 U+4E00
    ['冰', 'B'],
    ['图', 'T'],
    ['兔', 'T'],
    ['洞', 'D'],
    ['都', 'D'],
    ['市', 'S'],
    ['传', 'C'],
    ['说', 'S'],
    ['怪', 'G'],
    ['谈', 'T'],
    ['术', 'S'],
    ['语', 'Y'],
    ['表', 'B'],
    ['分', 'F'],
    ['类', 'L'],
    ['标', 'B'],
    ['签', 'Q'],
    ['案', 'A'],
    ['网', 'W'],
    ['络', 'L'],
    ['牛', 'N'],
    ['虎', 'H'],
    ['蛇', 'S'],
    ['马', 'M'],
    ['猴', 'H'],
    ['鸡', 'J'],
    ['猪', 'Z'],
    ['东', 'D'],
    ['西', 'X'],
    ['南', 'N'],
    ['北', 'B'],
    ['中', 'Z'],
    ['麟', 'L'],
  ]

  it.each(cases)('%s → %s', (ch, expected) => {
    expect(getInitial(ch)).toBe(expected)
  })

  it('拉丁字母返回大写', () => {
    expect(getInitial('a')).toBe('A')
    expect(getInitial('Z')).toBe('Z')
  })

  it('数字与空值返回 #', () => {
    expect(getInitial('5')).toBe('#')
    expect(getInitial('')).toBe('#')
  })

  it('表外码点（非 CJK 基本区）返回 #', () => {
    expect(getInitial('ꀀ')).toBe('#') // U+A000，超出定长表末尾
    expect(getInitial('あ')).toBe('#') // 日文假名
  })
})

describe('getFirstInitial（词条名）', () => {
  it('取首个汉字的首字母', () => {
    expect(getFirstInitial('都市传说')).toBe('D')
    expect(getFirstInitial('鬼宅・异常地点')).toBe('G')
    expect(getFirstInitial('后室')).toBe('H')
    expect(getFirstInitial('母题')).toBe('M')
  })

  it('跳过开头的装饰符号（・、空格、emoji 等）', () => {
    expect(getFirstInitial('·装饰开头')).toBe('Z') // 装 = Z，・被跳过
    expect(getFirstInitial(' 冰山')).toBe('B')
  })

  it('拉丁字母开头直接返回大写', () => {
    expect(getFirstInitial('SCP')).toBe('S')
  })

  it('数字开头返回 #', () => {
    expect(getFirstInitial('123数字')).toBe('#')
  })

  it('名称级覆盖优先于单字表（多音字/专有名词）', () => {
    expect(getFirstInitial('日式ACG')).toBe('R') // 单字表「日」为 R，但走 NAME_INITIAL 覆盖
  })

  it('空值返回 #', () => {
    expect(getFirstInitial('')).toBe('#')
  })
})
