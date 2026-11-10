import { describe, expect, it } from 'vitest'
import meta from '../../data/meta.json'
import { CATEGORY_SLUGS, categoryFromSlug, categorySlug } from './categorySlug'

/**
 * 分类 slug 表守卫。
 *
 * 分类页靠这张表出 URL，缺一行就会让某个分类的地址变成 `c-xxxxxxxx` 这种
 * 没人愿意点、也没法做外链的形态。meta.json 是分类的权威来源（UI 顺序也取它），
 * 这里逐条比对，保证「数据里有分类 → 表里有 slug」。
 */
describe('categorySlug', () => {
  const names = Object.keys((meta as { categoryColors: Record<string, string> }).categoryColors)

  it('meta.json 的每个分类都有 slug', () => {
    expect(names.filter((n) => !CATEGORY_SLUGS[n])).toEqual([])
  })

  it('slug 全局唯一且格式合法（小写字母/数字/连字符）', () => {
    const slugs = Object.values(CATEGORY_SLUGS)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.filter((s) => !/^[a-z0-9-]+$/.test(s))).toEqual([])
  })

  it('slug ↔ 分类名双向可逆', () => {
    for (const name of names) {
      expect(categoryFromSlug(categorySlug(name))).toBe(name)
    }
  })

  it('未知分类回退为稳定地址（不抛错、不返回空串）', () => {
    const s = categorySlug('不存在的分类')
    expect(s).toMatch(/^c-[0-9a-f]{8}$/)
    expect(categorySlug('不存在的分类')).toBe(s) // 确定性
    expect(categoryFromSlug(s)).toBeNull()
  })
})
