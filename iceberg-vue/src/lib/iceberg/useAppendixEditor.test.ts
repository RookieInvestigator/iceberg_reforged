import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppendixEditor } from './useAppendixEditor'
import { APPENDIX_TABLES } from './appendix'

/**
 * 编辑器**保存载荷**的集成测试。
 *
 * 断言要拦的两类事故：副表没被载入（载荷为空 = 保存等于清空副表），
 * 以及按「行是否为空」丢行（related.csv 里「source_id 有、target_id 空」的历史行会被误删）。
 * 全程用 stub 的 fetch 捕获请求体，不碰磁盘。
 */
function stubSave() {
  const bodies: Record<string, string> = {}
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    const { file, content } = JSON.parse(init.body) as { file: string; content: string }
    bodies[file] = content
    return { ok: true, json: async () => ({}) } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return bodies
}

afterEach(() => { vi.unstubAllGlobals() })

describe('useAppendixEditor 保存载荷', () => {
  it('真实数据确实被载入（glob 路径写错时这里会空）', () => {
    const ed = useAppendixEditor()
    // 真实副表里这几条是稳定存在的
    ed.selectedId.value = 'b8b7ed6d'
    expect(ed.changeCount('b8b7ed6d')).toBeGreaterThan(0)
    expect(ed.overrideRow('desc')?.value).toBeTruthy()
    expect(ed.contributorRows.value.length).toBeGreaterThan(0)
  })

  it('保存载荷包含历史空值行（related.csv 里 source_id 有、target_id 空的那几条）', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    ed.selectedId.value = 'b8b7ed6d'
    await ed.saveAll()
    const related = bodies['related.csv']
    expect(related).toBeTruthy()
    expect(related).toContain('5374c017,')
    expect(related).toContain('377db1b4,')
    // 行数不能少：与磁盘上的真实行数一致
    const dataRows = related.trim().split(/\r?\n/).slice(1).filter(Boolean)
    expect(dataRows.length).toBeGreaterThanOrEqual(65)
  })

  it('表头恒等于声明（含新增的 contributors.csv）', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    ed.selectedId.value = 'b8b7ed6d'
    await ed.saveAll()
    for (const def of APPENDIX_TABLES) {
      // 文件原有的 BOM 会被沿用（categories.csv 是 Excel 风格），比较时剥掉
      const head = bodies[def.file].replace(/^\uFEFF/, '').split(/\r?\n/)[0]
      expect(head, `${def.file} 表头`).toBe(def.headers.join(','))
    }
  })

  it('只丢「本次新建且仍空白」的行：＋添加后不填 → 不落盘；填了 → 落盘', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    ed.selectedId.value = 'b8b7ed6d'
    const def = APPENDIX_TABLES.find((t) => t.key === 'overrides')!
    const dataRows = () => bodies['overrides.csv'].replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).length

    await ed.saveAll()
    const wholeTable = dataRows()          // 保存写的是整张表，不是只有当前词条
    expect(wholeTable).toBeGreaterThan(1)

    ed.addRow(def)                          // 空白新行
    await ed.saveAll()
    expect(ed.getRows(def).length).toBe(2)  // 内存里还在（desc + 新行）
    expect(dataRows()).toBe(wholeTable)     // 但不落盘

    const rows = ed.getRows(def)
    rows[rows.length - 1].field = 'title'
    rows[rows.length - 1].value = '探针标题'
    await ed.saveAll()
    expect(dataRows()).toBe(wholeTable + 1)
    expect(bodies['overrides.csv']).toContain('探针标题')
  })

  it('标记（extra.csv）：开标记写一行、关标记删行、note 落盘', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    ed.selectedId.value = 'b8b7ed6d'
    const lines = () => bodies['extra.csv'].replace(/^\uFEFF/, '').trim().split(/\r?\n/)
    expect(ed.extraOf('warn').on).toBe(false)

    // 基线：先存一次拿到仓库现有行数 —— 真实副表里可能已经有标记（比如用户手填的），
    // 断言必须相对基线，不能假设空表
    await ed.saveAll()
    const base = lines().length

    ed.toggleExtraFlag('warn')
    ed.setExtraNote('warn', '内容存疑，请谨慎参考')
    await ed.saveAll()
    expect(lines()[0]).toBe('item_id,flag,note')
    expect(lines()).toContain('b8b7ed6d,warn,内容存疑，请谨慎参考')
    expect(lines().length).toBe(base + 1)

    ed.toggleExtraFlag('warn')   // 关掉 = 删行
    expect(ed.extraOf('warn').on).toBe(false)
    await ed.saveAll()
    expect(lines().length).toBe(base)
    expect(lines()).not.toContain('b8b7ed6d,warn,内容存疑，请谨慎参考')
  })
})
