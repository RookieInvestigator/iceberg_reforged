import { describe, expect, it } from 'vitest'
import { layoutPages, parseWenyan } from './engine'
import { cellStyle } from './render'

/**
 * 双行小字夹注（古籍「小字双行」）门禁：
 * **一个字格内必须是 4 个小字**（2 条竖行 × 每条 2 字），
 * 且 4 个位置互不重复（右上 / 右下 / 左上 / 左下）。
 */
describe('双行小字夹注', () => {
  function layout(text: string) {
    const ci = Array.from({ length: text.length }, (_, i) => (i > 4 ? 0 : -1))
    const tokens = parseWenyan(text, ci)
    return layoutPages(tokens, 10, 20)
  }

  it('一个字格内放 4 个小字（2 行 × 2 字）', () => {
    const cells = layout('【测试】\n（甲乙丙丁戊己庚辛）')
    const cms = cells.filter((c) => c.cm)
    expect(cms).toHaveLength(8)

    // 按字格（rw/cl）分组
    const groups = new Map<string, typeof cms>()
    for (const c of cms) {
      const k = `${c.rw}/${c.cl}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(c)
    }

    // 8 个字 → 2 个字格，每格 4 个
    expect(groups.size).toBe(2)
    for (const [, list] of groups) {
      expect(list).toHaveLength(4)
      // 4 个位置互不重复
      const pos = new Set(list.map((c) => `${c.sc}${c.sr}`))
      expect(pos.size).toBe(4)
    }
  })

  it('4 个位置分别落在字格的四个角（transform 各不相同）', () => {
    const cells = layout('【测试】\n（甲乙丙丁）')
    const cms = cells.filter((c) => c.cm)
    const styles = cms.map((c) => cellStyle(c, 10, 20))
    // 同一字格的 4 个 style 必须互不相同
    expect(new Set(styles).size).toBe(4)
    // 且都含 translate
    for (const s of styles) expect(s).toContain('transform:translate')
  })

  it('夹注不与正文占用同一行（主文行按夹注占用推进）', () => {
    const cells = layout('【测试】\n（甲乙丙丁戊己庚辛）\n正文开始')
    const cms = cells.filter((c) => c.cm)
    const body = cells.filter((c) => !c.cm && !c.hw)
    const cmRows = new Set(cms.map((c) => `${c.cl}:${c.rw}`))
    for (const b of body) {
      expect(cmRows.has(`${b.cl}:${b.rw}`)).toBe(false)
    }
  })
})
