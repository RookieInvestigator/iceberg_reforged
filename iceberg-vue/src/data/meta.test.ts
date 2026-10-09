import { describe, expect, it } from 'vitest'
import raw from './iceberg.json'
import meta from './meta.json'
import idIndex from './id-index.json'
import categoriesRaw from './appendix/categories.csv?raw'
import handbookRaw from './handbook.md?raw'
import { parseCSV } from '../lib/csv'
import { parseSections } from '../lib/handbook'

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

  it('tagMap / categoryColors 的 key 无首尾空白（上游 superscript 脏数据回归守卫）', () => {
    for (const k of Object.keys(data.tagMap)) expect(k, `tagMap 脏 key ${JSON.stringify(k)}`).toBe(k.trim())
    for (const k of Object.keys(meta.tagMap)) expect(k, `meta tagMap 脏 key ${JSON.stringify(k)}`).toBe(k.trim())
    for (const k of Object.keys(data.categoryColors)) expect(k).toBe(k.trim())
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

  it('categories.csv 副表：item_id 存在、分类合法、extra 不与主分类重复', () => {
    const all = Object.values(data.tiers).flat()
    const ids = new Set(all.map((it) => it.id))
    const mainOf = new Map(all.map((it) => [it.id, it.category ?? '']))
    const known = new Set(Object.keys(data.categoryColors))
    for (const row of parseCSV(categoriesRaw)) {
      const iid = (row.item_id || '').trim()
      const cat = (row.category || '').trim()
      if (!iid && !cat) continue
      const role = (row.role || '').trim().toLowerCase() === 'main' ? 'main' : 'extra'
      expect(ids.has(iid), `副表孤儿 item_id ${iid}`).toBe(true)
      expect(known.has(cat), `副表未知分类 ${cat}`).toBe(true)
      // role=extra 是「叠加」：与主分类相同就没有意义（主分类覆盖请用 role=main）
      if (role === 'extra') {
        expect(cat, `副表与主分类重复 ${iid}`).not.toBe(mainOf.get(iid))
      }
    }
  })
})

/**
 * 术语表覆盖守卫（2026-10-08）。
 *
 * 背景：tagMap 由 API 管线产出（现 69 个），handbook.md 的「划定标准」节是它的释义侧。
 * 管线加标签时术语表不会自动跟随，此前就积了 57 个只有标签、没有词条的缺口 ——
 * 徽章 hover 与术语表页都查不到释义，且没有任何报错。这里把它变成硬门：
 * 管线新增标签而未补术语表条目时 CI 立刻失败。
 *
 * 注意判定口径与渲染一致：`parseSections` 只收录**释义非空**的条目（`if (name && desc)`），
 * 因此只有 `### 名称` 而没写正文的条目不算「有」，占位写「待补充。」才算真正可见。
 */
describe('术语表覆盖（tagMap / categoryColors → handbook.md）', () => {
  const entries = parseSections(handbookRaw).get('划定标准') || {}

  it('每个标签都在术语表「划定标准」节里有可见条目', () => {
    const missing = Object.values(meta.tagMap).filter((name) => !entries[name])
    expect(missing, `术语表缺标签释义：${missing.join('、')}`).toEqual([])
  })

  it('每个分类都在术语表「划定标准」节里有可见条目', () => {
    const missing = Object.keys(meta.categoryColors).filter((name) => !entries[name])
    expect(missing, `术语表缺分类释义：${missing.join('、')}`).toEqual([])
  })
})
