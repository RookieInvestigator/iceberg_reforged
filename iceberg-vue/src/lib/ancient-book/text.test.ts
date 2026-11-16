import { describe, expect, it } from 'vitest'
import raw from '../../data/iceberg.json'
import { normalizeData } from '../data'
import { toPlainText } from '../richText'

/**
 * 古籍页文本后处理门禁。
 *
 * 历史 bug：`plainDesc(id, rawDesc)` 改成按 id 查规范化文本后，
 * 调用点仍传 `it.desc`（字符串）当 id → 查不到 → **所有词条正文变空**。
 * 这里钉住「按 id 能取到非空正文」与「标点已规范化」两件事。
 */
describe('古籍页正文后处理', () => {
  const normalized = normalizeData(raw)
  const byId = new Map<string, { title: string; desc: string }>()
  for (const items of Object.values(normalized.tiers)) {
    for (const it of items) byId.set(it.id, { title: it.title, desc: it.desc || '' })
  }

  it('按 id 能取到非空正文（不是空串）', () => {
    const withDesc = [...byId.entries()].filter(([, v]) => v.desc.trim().length > 0)
    expect(withDesc.length).toBeGreaterThan(100)
    // 抽样：前 20 条有正文的，plainDesc 结果都非空
    for (const [id, v] of withDesc.slice(0, 20)) {
      const plain = toPlainText(v.desc.replace(/<[^>]*>/g, ''))
      expect(plain.trim().length).toBeGreaterThan(0)
    }
  })

  it('标点已规范化：无半角引号、无三个点、无间隔号两侧空格', () => {
    const all = [...byId.values()].map((v) => v.desc).join('\n')
    expect(all).not.toMatch(/\.{3,}/)
    expect(all).not.toMatch(/\s·\s/)
    // 引号统一为直角
    expect(all).not.toMatch(/["“”]/)
  })

  it('标题同样规范化', () => {
    const titles = [...byId.values()].map((v) => v.title).join('\n')
    expect(titles).not.toMatch(/["“”]/)
  })
})
