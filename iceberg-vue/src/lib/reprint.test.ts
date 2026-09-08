import { describe, expect, it } from 'vitest'
import meta from '../data/meta.json'
import { buildReprintText, getContributors, parseContributors, REPRINT_LICENSE } from './reprint'

describe('parseContributors', () => {
  it('解析标准标记（带括号后缀）', () => {
    expect(parseContributors('前言\n\n参与创作者（按首字母排序）：A、B、C。后记')).toEqual(['A', 'B', 'C'])
  })
  it('兼容无括号旧标记', () => {
    expect(parseContributors('参与创作者：A、B')).toEqual(['A', 'B'])
  })
  it('无标记返回空数组', () => {
    expect(parseContributors('没有名单')).toEqual([])
  })
  it('过滤空片段与首尾空白', () => {
    expect(parseContributors('参与创作者：A、 、B、')).toEqual(['A', 'B'])
  })
})

describe('buildReprintText', () => {
  it('模板四行：标题/链接/许可，不含来源网址与名单（名单独立展示）', () => {
    const text = buildReprintText('测试标题', 'https://example.com/x')
    expect(text).toContain('测试标题')
    expect(text).toContain('https://example.com/x')
    expect(text).toContain(REPRINT_LICENSE)
    expect(text.split('\n')).toHaveLength(4)
    expect(text).not.toContain('参与创作者')
    expect(text).not.toContain('hezihezi.com')
  })
  it('名单独立可用：getContributors 非空且全为有效字符串', () => {
    const names = getContributors()
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(typeof n).toBe('string')
  })
})

describe('contributors 与数据源一致', () => {
  it('meta.json 名单与管线同源（非空且与 introText 解析一致）', async () => {
    const mod = (await import('../data/iceberg.json')) as unknown as {
      default?: { introText?: unknown }
      introText?: unknown
    }
    const intro = (mod.default ?? mod).introText as string
    const fromIntro = parseContributors(intro)
    expect(getContributors()).toEqual(fromIntro)
    expect((meta as { contributors?: unknown }).contributors).toEqual(fromIntro)
  })
})
