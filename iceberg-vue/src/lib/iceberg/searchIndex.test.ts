import { describe, expect, it } from 'vitest'
import { createSearchIndex, normalizeSearchText, searchTerms } from './searchIndex'

/**
 * 站内搜索门禁：
 * - 精确层：位置罚分（ignoreLocation）关没关 —— 关之前正文第 30 字之后永远搜不到；
 * - 模糊层：拼音全拼 / 首字母 / 混合输入（pinyin-match），精确层有结果时不启用；
 * - 归一化：全角、空白、间隔号写法差异。
 */

const LONG_HEAD = '风'.repeat(150)

const items = [
  // 命中出现在正文第 150 字 —— 旧配置（ignoreLocation 默认 false）下 |150-0|/100 = 1.5 分，直接超阈值
  { id: 'body', title: '无关标题', desc: LONG_HEAD + '水猴子出没' + '地'.repeat(40), category: '民俗', tags: [] },
  { id: 'titled', title: '水猴子传说', desc: '', category: '民俗', tags: [] },
  // 归一化用例：数据里的间隔号是「・」，用户可能输「·」或全角
  { id: 'punct', title: '北京公交车375・330', desc: '', category: '都市传说・超自然事件', tags: [] },
  { id: 'unrelated', title: '天气', desc: '与查询无关的一段话', category: '民俗', tags: [] },
  // 乱序/缺字/同音错字的覆盖层用例（真实数据里的「景国人粥」）
  { id: 'jing', title: '景国人粥', desc: '', category: '民俗', tags: [] },
  { id: 'jing-noise', title: '古滇国杀人祭厉', desc: '', category: '民俗', tags: [] },
]

const index = createSearchIndex(items)

describe('normalizeSearchText / searchTerms', () => {
  it('全角转半角、空白折叠、间隔号统一、小写', () => {
    expect(normalizeSearchText('  ＮＳＦＬ　·　档案 ')).toBe('nsfl ・ 档案')
  })

  it('多关键词按空白切开并去重', () => {
    expect(searchTerms('  水猴子　传说 水猴子 ')).toEqual(['水猴子', '传说'])
  })

  it('纯空白查询没有词', () => {
    expect(searchTerms('　  ')).toEqual([])
  })
})

describe('精确层（Fuse）', () => {
  it('位置罚分已关掉：正文深处的命中也能搜到', () => {
    expect(index.search('水猴子').ids).toEqual(expect.arrayContaining(['body', 'titled']))
    expect(index.search('水猴子').fuzzy).toBe(false)
  })

  it('标题命中排在正文命中之前（相关度序，供速查下拉使用）', () => {
    expect(index.search('水猴子').ids?.[0]).toBe('titled')
  })

  it('全角/半角/间隔号写法差异不影响命中', () => {
    expect(index.search('375·330').ids).toEqual(['punct'])
    expect(index.search('３７５・３３０').ids).toEqual(['punct'])
  })

  it('空格分隔的多关键词是 AND：要两词都命中', () => {
    expect(index.search('水猴子 传说').ids).toEqual(['titled'])
    expect(index.search('水猴子 量子力学').ids).toEqual([])
  })

  it('标题模式只查标题，不查正文', () => {
    expect(index.search('水猴子', 'title').ids).toEqual(['titled'])
    expect(index.search('出没', 'title').ids).toEqual([])
  })

  it('空查询返回 null（= 无搜索），不是空数组（会让词条墙以为一条都没命中）', () => {
    expect(index.search('').ids).toBeNull()
    expect(index.search('   ').ids).toBeNull()
    expect(index.search('　').ids).toBeNull()
  })
})

describe('模糊层（pinyin-match）', () => {  it('拼音首字母缩写能找到中文标题', () => {
    const r = index.search('shz')
    expect(r.ids).toContain('titled')
    expect(r.fuzzy).toBe(true)
  })

  it('拼音全拼能找到中文标题', () => {
    expect(index.search('shuihouzi').ids).toContain('titled')
  })

  it('精确层有结果时不出模糊结果（避免污染精确命中）', () => {
    const r = index.search('水猴')
    expect(r.fuzzy).toBe(false)
    expect(r.ids).toEqual(expect.arrayContaining(['titled']))
    expect(r.ids).not.toContain('unrelated')
  })

  it('多关键词在模糊层同样是 AND', () => {
    // 只有 titled 的标题同时能匹配 shz（水猴子）与 cs（传说）
    expect(index.search('shz cs').ids).toEqual(['titled'])
    expect(index.search('shz cs 天气').ids).toEqual([])
  })

  it('完全不相关的查询不会靠模糊层瞎命中', () => {
    const r = index.search('量子力学')
    expect(r.ids).toEqual([])
  })

  it('同音错字容忍：水候子 → 水猴子（候/猴 同声母，且一半以上字直接命中）', () => {
    expect(index.search('水候子').ids).toContain('titled')
  })

  it('非同音的错字不硬凑：水猴孑 零命中（孑 在标题里没有同声母替身）', () => {
    expect(index.search('水猴孑').ids).toEqual([])
  })

  it('「精确」开关关掉模糊层：拼音查询零命中，而不是回落到近似结果', () => {
    const r = index.search('shz', 'full', { allowFuzzy: false })
    expect(r.ids).toEqual([])
    expect(r.fuzzy).toBe(false)
    expect(r.exactCount).toBe(0)
    // 精确层本来就能命中的查询不受开关影响
    expect(index.search('水猴子', 'full', { allowFuzzy: false }).ids).toEqual(expect.arrayContaining(['titled']))
  })

  it('模糊模式下精确命中与拼音命中同列（精确在前，模糊只补不重复）', () => {
    // 造一条「字面就含 shz」的标题，让同一次查询既有精确命中又有拼音命中
    const mixed = createSearchIndex([
      ...items,
      { id: 'literal', title: 'shz 专辑', desc: '', category: '民俗', tags: [] },
    ])
    const r = mixed.search('shz')
    expect(r.exactCount).toBeGreaterThan(0)
    expect(r.ids?.[0]).toBe('literal')          // 精确命中排最前
    expect(r.ids).toContain('titled')           // 拼音命中也在（水猴子传说）
    expect(r.fuzzy).toBe(true)
    // 精确模式则只留字面命中
    expect(mixed.search('shz', 'full', { allowFuzzy: false }).ids).toEqual(['literal'])
  })
})

describe('覆盖层（中文乱序 / 缺字 / 同音）', () => {
  it('乱序两个字也能命中：景人 → 景国人粥', () => {
    expect(index.search('景人').ids?.[0]).toBe('jing')
  })

  it('乱序三个字也能命中：景人国 → 景国人粥', () => {
    expect(index.search('景人国').ids?.[0]).toBe('jing')
  })

  it('同音错字也能命中：精国人 → 景国人粥（精/景 同声母，且排序在前）', () => {
    const ids = index.search('精国人').ids ?? []
    expect(ids).toContain('jing')
    expect(ids[0]).toBe('jing')
  })

  it('精确模式不做覆盖匹配（宁可零命中，由 UI 提示切模糊）', () => {
    expect(index.search('景人', 'full', { allowFuzzy: false }).ids).toEqual([])
    expect(index.search('精国人', 'full', { allowFuzzy: false }).ids).toEqual([])
  })

  it('单字查询不跑覆盖层（噪音太大），只走精确层', () => {
    // 「景」在精确层就能按子串命中
    expect(index.search('景').ids).toContain('jing')
    // 单字查询不该把「古滇国…」这类只有「国」的条目拉进来
    expect(index.search('景').ids).not.toContain('jing-noise')
  })

  it('覆盖层也遵守多关键词 AND', () => {
    expect(index.search('景人 天气').ids).toEqual([])
  })
})
