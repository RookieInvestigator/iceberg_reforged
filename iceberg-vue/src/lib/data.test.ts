import { describe, expect, it } from 'vitest'
import { normalizeData } from './data'

/** 走 normalizeData 的 title/desc，等于走完整的 replaceQuotes 管线。 */
function norm(title: string, desc = '', style?: 'corner' | 'curly') {
  const raw = {
    generatedAt: 1,
    tierOrder: ['Tier 1'],
    tiers: { 'Tier 1': [{ id: 'a', title, category: '民俗', tags: [], desc, link: '' }] },
    categoryColors: { 民俗: '#fff' },
    tagMap: {},
    introText: '',
    defaultColor: '#fff',
  }
  return normalizeData(raw, style).tiers['层级 1']![0]!
}

// clreq §6.3.1 密排 / §5.4.1 省略号（A2 / B4 回归守卫）
describe('replaceQuotes 中文排版规范化', () => {
  it('A2：间隔号两侧不插入西文空格（密排原则）', () => {
    expect(norm('鲁迅·朝花夕拾').title).toBe('鲁迅·朝花夕拾')
    // 全角中点统一为 U+00B7，但仍不加空格
    expect(norm('都市传说・超自然事件').title).toBe('都市传说·超自然事件')
    expect(norm('鲁迅 · 朝花夕拾').title).toBe('鲁迅·朝花夕拾')
  })

  it('B4：已成型的 …… 不再膨胀成十二点', () => {
    expect(norm('他说……然后').title).toBe('他说……然后')
    expect(norm('……').title).toBe('……')
    expect(norm('欲言又止…').title).toBe('欲言又止……')
    expect(norm('三点...').title).toBe('三点……')
  })

  it('B4：双破折号保持 2em，不被压成单个', () => {
    expect(norm('他——愣住').title).toBe('他——愣住')
    expect(norm('A--B').title).toBe('A—B')
  })

  it('引号 / 书名号 / 中文后英文标点仍按既有规则归一', () => {
    expect(norm('“引号”').title).toBe('「引号」')
    expect(norm('<<书名>>').title).toBe('《书名》')
    expect(norm('真的,好的').title).toBe('真的，好的')
  })

  it('desc 与 introText 同样生效', () => {
    const raw = {
      generatedAt: 1, tierOrder: [], tiers: {},
      categoryColors: {}, tagMap: {}, defaultColor: '#fff',
      introText: '说明·其一',
    }
    expect(normalizeData(raw).introText).toBe('说明·其一')
  })
})

// 实验开关：两种引号风格（clreq §2.1.2 地区差异）
describe('引号风格切换（quoteStyle）', () => {
  it('默认直角引号「」『』', () => {
    expect(norm('「引号」').title).toBe('「引号」')
    expect(norm('『书名』').title).toBe('『书名』')
  })

  it('curly 风格输出弯引号 “”‘’', () => {
    expect(norm('「引号」', '', 'curly').title).toBe('“引号”')
    expect(norm('『书名』', '', 'curly').title).toBe('‘书名’')
    expect(norm('“引号”', '', 'curly').title).toBe('“引号”')
  })

  it('来回切换可逆：不会越切越乱', () => {
    const once = norm('「甲」和“乙”', '', 'curly').title
    expect(once).toBe('“甲”和“乙”')
    const back = norm(once, '', 'corner').title
    expect(back).toBe('「甲」和「乙」')
    expect(norm(back, '', 'curly').title).toBe('“甲”和“乙”')
  })

  it('不同风格各自缓存，互不串味', () => {
    const raw = {
      generatedAt: 1, tierOrder: ['Tier 1'],
      tiers: { 'Tier 1': [{ id: 'a', title: '「甲」', category: '民俗', tags: [], desc: '', link: '' }] },
      categoryColors: { 民俗: '#fff' }, tagMap: {}, introText: '', defaultColor: '#fff',
    }
    expect(normalizeData(raw, 'corner').tiers['层级 1']![0]!.title).toBe('「甲」')
    expect(normalizeData(raw, 'curly').tiers['层级 1']![0]!.title).toBe('“甲”')
    expect(normalizeData(raw, 'corner').tiers['层级 1']![0]!.title).toBe('「甲」')
  })
})
