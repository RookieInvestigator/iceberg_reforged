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

  it('保存沿用 Excel 风格 BOM（categories.csv 带 BOM，其余不带）', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    ed.selectedId.value = 'b8b7ed6d'
    await ed.saveAll()
    expect(bodies['categories.csv'].startsWith('\uFEFF')).toBe(true)
    expect(bodies['references.csv'].startsWith('\uFEFF')).toBe(false)
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

describe('整表模式（不按词条组织，直接铺开一张副表）', () => {
  /**
   * 这组用例**不依赖某张副表初始就有数据行**：副表内容由作者维护，
   * 任何一张都可能被清空（例如 reading.csv 只留表头）。
   * 所以统一「先自己加一行、填好 id」再测行为。
   */
  function seedRow(ed: ReturnType<typeof useAppendixEditor>, key: 'reading' | 'extra', itemId = 'be29bf68') {
    const def = APPENDIX_TABLES.find((t) => t.key === key)!
    ed.addTableRow(def)
    const rows = ed.tableRows(key)
    const row = rows[rows.length - 1]!
    ed.setTableRowCell(def, row, 'item_id', itemId)
    return { def, row }
  }

  it('tableRows 铺开全部行，且每行都带 id', () => {
    const ed = useAppendixEditor()
    seedRow(ed, 'reading')
    const rows = ed.tableRows('reading')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => (r.item_id || '').trim())).toBe(true)
  })

  it('新增行缺 id → invalidRows 报警且保存被整批拒绝（一个文件都不写）', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    const def = APPENDIX_TABLES.find((t) => t.key === 'extra')!
    ed.addTableRow(def)
    const row = ed.tableRows('extra')[ed.tableRows('extra').length - 1]
    ed.setTableRowCell(def, row, 'note', '临时备注')
    expect(ed.invalidRows.value).toHaveLength(1)
    await ed.saveAll()
    expect(ed.saveError.value).toContain('保存被拒绝')
    expect(bodies['extra.csv']).toBeUndefined()

    // 补上 id 后即可保存，行落在该词条下
    ed.setTableRowCell(def, row, 'item_id', 'b8b7ed6d')
    expect(ed.invalidRows.value).toHaveLength(0)
    await ed.saveAll()
    expect(bodies['extra.csv']).toContain('临时备注')
  })

  it('改 id 列会「换桶」：保存后行落在新 id 下，旧 id 不留残影', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    const { def, row } = seedRow(ed, 'reading', 'be29bf68')
    ed.setTableRowCell(def, row, 'title', '示例书目')
    const oldId = 'be29bf68'
    const title = '示例书目'
    await ed.saveAll()

    ed.setTableRowCell(def, row, 'item_id', 'ffffffff')
    await ed.saveAll()
    const lines = bodies['reading.csv'].replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1)
    const moved = lines.filter((l) => l.startsWith('ffffffff,'))
    expect(moved).toHaveLength(1)
    expect(moved[0]).toContain(title)
    expect(lines.filter((l) => l.startsWith(oldId + ',')).some((l) => l.includes(title))).toBe(false)
  })

  it('removeTableRow 删行后保存，该行不再出现', async () => {
    const bodies = stubSave()
    const ed = useAppendixEditor()
    const { def, row } = seedRow(ed, 'reading', 'be29bf68')
    ed.setTableRowCell(def, row, 'title', '独有标题不会被别处提到')
    await ed.saveAll()
    const before = ed.tableRows('reading').length
    expect(before).toBeGreaterThan(0)
    ed.removeTableRow(def, row)
    expect(ed.tableRows('reading').length).toBe(before - 1)
    await ed.saveAll()
    expect(bodies['reading.csv']).not.toContain('独有标题不会被别处提到')
  })
})
