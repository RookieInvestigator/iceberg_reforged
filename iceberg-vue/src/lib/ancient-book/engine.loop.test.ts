import { describe, expect, it } from 'vitest'
import { layoutPages, parseWenyan } from './engine'

/**
 * 死循环回归门禁：layoutPages 必须在有限步内返回。
 *
 * 历史 bug：夹注块里 `placed === 0` 时只 `nextCol()` 而不推进 `bi`，
 * 若某个 token 的 span 大于单行容量（英文长串），就会无限循环 ——
 * 表现为页面完全卡死、F12 都点不动（主线程被占满）。
 */
describe('layoutPages 不会死循环', () => {
  function run(text: string, cols = 10, rows = 20) {
    const ci = Array.from({ length: text.length }, () => 0)
    const tokens = parseWenyan(text, ci)
    return layoutPages(tokens, cols, rows)
  }

  it('普通中文', () => {
    expect(run('【标题】\n正文内容').length).toBeGreaterThan(0)
  })

  it('夹注里含超长英文串（span 大于单行容量）', () => {
    // 20 行 → 单行容量 40 槽；这里给一个 60 字符的英文串
    const long = 'a'.repeat(60)
    expect(() => run(`【标题】\n（${long}）`)).not.toThrow()
  })

  it('夹注里含超长英文串 + 极小版面', () => {
    const long = 'a'.repeat(200)
    expect(() => run(`【标题】\n（${long}）`, 3, 6)).not.toThrow()
  })

  it('夹注只有英文', () => {
    expect(() => run('【标题】\n（hello world）')).not.toThrow()
  })

  it('极小版面 + 大量内容', () => {
    expect(() => run('【标题】\n' + '正文'.repeat(500), 3, 6)).not.toThrow()
  })
})
