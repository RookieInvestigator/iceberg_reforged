import { describe, expect, it } from 'vitest'
import raw from './iceberg.json'
import meta from './meta.json'
import idIndex from './id-index.json'

/**
 * 派生数据一致性守卫。
 *
 * meta.json（~3.5KB）与 id-index.json（~106KB）由 build_data_api.py 与 iceberg.json 同批产出，
 * 是首页 / 术语表 / 用户面板的轻量数据源。若有人绕过管线手改了任一文件、或管线映射逻辑变更，
 * 这里会立刻失败，避免线上出现「统计数字对不上」或「收藏分类查不到」这类静默错误。
 */
describe('派生数据与 iceberg.json 一致', () => {
  const data = raw as {
    generatedAt: number
    tierOrder: string[]
    tiers: Record<string, Array<{ id: string; title: string; category?: string }>>
    categoryColors: Record<string, string>
    tagMap: Record<string, string>
  }

  it('meta.total 等于各层词条数之和', () => {
    const sum = Object.values(data.tiers).reduce((n, items) => n + items.length, 0)
    expect(meta.total).toBe(sum)
  })

  it('meta.tierOrder 与主数据同序相同', () => {
    expect(meta.tierOrder).toEqual(data.tierOrder)
  })

  it('meta.tierCounts 逐层匹配实际条目数', () => {
    const actual: Record<string, number> = {}
    for (const name of data.tierOrder) actual[name] = (data.tiers[name] || []).length
    expect(meta.tierCounts).toEqual(actual)
  })

  it('meta 的分类色与标签表与主数据完全一致', () => {
    expect(meta.categoryColors).toEqual(data.categoryColors)
    expect(meta.tagMap).toEqual(data.tagMap)
  })

  it('meta.generatedAt 与主数据一致', () => {
    expect(meta.generatedAt).toBe(data.generatedAt)
  })

  it('id-index 覆盖全部条目，且标题与分类与主数据一致', () => {
    const all = Object.values(data.tiers).flat()
    const index = idIndex as Record<string, { t: string; c: string }>
    expect(Object.keys(index).length).toBe(all.length)
    for (const it of all) {
      const entry = index[it.id]
      expect(entry, `缺少 id ${it.id} 的索引`).toBeTruthy()
      expect(entry.t).toBe(it.title)
      expect(entry.c).toBe(it.category ?? '')
    }
  })
})
