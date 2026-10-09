import { describe, expect, it } from 'vitest'
import {
  APPENDIX_TABLES,
  EXTRA_FLAGS,
  OVERRIDE_FIELDS,
  RESERVED_FIELDS,
  appendixViolation,
  contributorLabel,
  detectEol,
  hasBom,
  isEmptyAppendixRow,
  loadAppendix,
  ownerOfField,
  parseAppendix,
  readAppendixRaw,
  serializeAppendixTable,
  shouldDropOnSave,
  tableFile,
} from './appendix'

/**
 * 副表关系的**结构守卫**（2026-10-09 重组）。
 *
 * 这里锁的是「一张表管一个区域」这条规矩本身，而不是某次的具体数据：
 *   · 表定义自洽（键列都在表头里、key/file 唯一）；
 *   · 保留字段有明确归属，且不在通用表允许的字段里；
 *   · **真实副表零越界**（有人把 category 写进 overrides.csv，CI 立刻红）；
 *   · 真实副表表头与 APPENDIX_TABLES 声明一致（代码与文件不会各说各话）。
 */

const EMPTY_RAW = {
  overrides: '', categories: '', references: '', related: '', contributors: '', extra: '',
}

describe('APPENDIX_TABLES 表定义', () => {
  it('六张表，key / file 唯一', () => {
    expect(APPENDIX_TABLES).toHaveLength(6)
    expect(new Set(APPENDIX_TABLES.map((t) => t.key)).size).toBe(6)
    expect(new Set(APPENDIX_TABLES.map((t) => t.file)).size).toBe(6)
  })

  it('每张表的 idColumn 与键列都必须在 headers 里（否则编辑器/解析会静默落空）', () => {
    for (const t of APPENDIX_TABLES) {
      expect(t.headers, `${t.file} 缺 idColumn`).toContain(t.idColumn)
      for (const k of t.keyColumns) {
        expect(t.headers, `${t.file} 缺键列 ${k}`).toContain(k)
      }
      expect(t.keyColumns, `${t.file} 键列应含 idColumn`).toContain(t.idColumn)
    }
  })

  it('每个保留字段都能指到一张存在的专表，且不在通用表允许字段里', () => {
    for (const [field, key] of Object.entries(RESERVED_FIELDS)) {
      expect(APPENDIX_TABLES.map((t) => t.key), `${field} 的归属表不存在`).toContain(key)
      expect(OVERRIDE_FIELDS as readonly string[]).not.toContain(field)
      expect(ownerOfField(field)).toBe(key)
      expect(ownerOfField(` ${field.toUpperCase()} `)).toBe(key) // 容错：大小写/空白
    }
    expect(ownerOfField('desc')).toBeNull()
    expect(tableFile('overrides')).toBe('overrides.csv')
  })
})

describe('parseAppendix', () => {
  it('空输入：四张表都是空 Map，无违规', () => {
    const apx = parseAppendix(EMPTY_RAW)
    expect(apx.overrides.size).toBe(0)
    expect(apx.categories.size).toBe(0)
    expect(apx.references.size).toBe(0)
    expect(apx.related.size).toBe(0)
    expect(apx.contributors.size).toBe(0)
    expect(apx.violations).toEqual([])
  })

  it('overrides：保留字段记违规但保留记录（供编辑器显示与迁移报告）', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      overrides:
        'item_id,field,value\n' +
        'a,category,阴谋论・边缘理论\n' +
        'a,desc,新描述\n' +
        'a,,空字段\n' +
        ',desc,无 id\n',
    })
    expect(apx.overrides.get('a')).toHaveLength(2) // category 行保留 + desc 行
    expect(apx.violations).toEqual(['overrides.csv:category（应写 categories.csv）'])
  })

  it('categories：role 缺省 extra，main 显式；非法 role 记违规；同键去重', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      categories:
        'item_id,category,role\n' +
        'a,民俗・信仰・方术,\n' +
        'a,阴谋论・边缘理论,main\n' +
        'a,民俗・信仰・方术,extra\n' +
        'b,真实犯罪・事故,wrong\n',
    })
    expect(apx.categories.get('a')).toEqual([
      { category: '民俗・信仰・方术', role: 'extra' },
      { category: '阴谋论・边缘理论', role: 'main' },
    ])
    expect(apx.categories.get('b')).toEqual([{ category: '真实犯罪・事故', role: 'extra' }])
    expect(apx.violations).toEqual(['categories.csv:无法识别的 role「wrong」（只认 main / extra）'])
  })

  it('references：角色缺省 ref、main 显式、非法 URL 丢弃、重复行去重', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      references:
        'source_id,label,url,role\n' +
        'a,知乎专栏,https://zhuanlan.zhihu.com/p/1,\n' +
        'a,维基百科,https://zh.wikipedia.org/wiki/A,main\n' +
        'a,重复,https://zhuanlan.zhihu.com/p/1,\n' +
        'a,坏链接,javascript:alert(1),ref\n' +
        'a,错角色,https://example.com,x\n',
    })
    expect(apx.references.get('a')).toEqual([
      { label: '知乎专栏', url: 'https://zhuanlan.zhihu.com/p/1', role: 'ref' },
      { label: '维基百科', url: 'https://zh.wikipedia.org/wiki/A', role: 'main' },
      { label: '错角色', url: 'https://example.com', role: 'ref' },
    ])
    expect(apx.violations).toEqual(['references.csv:无法识别的 role「x」（只认 main / ref）'])
  })

  it('related：双向索引、自环丢弃、保序去重', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      related: 'source_id,target_id\na,b\nb,c\na,b\na,a\n',
    })
    expect(apx.related.get('a')).toEqual(['b'])
    expect(apx.related.get('b')).toEqual(['a', 'c'])
    expect(apx.related.get('c')).toEqual(['b'])
  })
})

describe('编辑器用的纯函数（保存/越界/空行）', () => {
  const overrides = APPENDIX_TABLES.find((t) => t.key === 'overrides')!
  const categories = APPENDIX_TABLES.find((t) => t.key === 'categories')!

  it('序列化：列序恒等于声明、含逗号/引号/换行的单元格按 RFC 4180 转义', () => {
    const csv = serializeAppendixTable(overrides, [
      { item_id: 'a', field: 'desc', value: '含,逗号 与 "引号"' },
      { item_id: 'b', field: 'title', value: '换\n行' },
    ])
    expect(csv.split('\n')[0]).toBe('item_id,field,value')
    expect(csv).toContain('"含,逗号 与 ""引号"""')
    expect(csv).toContain('"换\n行"')
  })

  it('序列化 → 解析 往返一致（与 lib/csv.ts 对称）', () => {
    const rows = [
      { item_id: 'a', category: '民俗・信仰・方术', role: 'extra' },
      { item_id: 'b', category: '阴谋论・边缘理论', role: 'main' },
    ]
    const apx = parseAppendix({ ...EMPTY_RAW, categories: serializeAppendixTable(categories, rows) })
    expect(apx.categories.get('a')).toEqual([{ category: '民俗・信仰・方术', role: 'extra' }])
    expect(apx.categories.get('b')).toEqual([{ category: '阴谋论・边缘理论', role: 'main' }])
  })

  it('保存只丢「本次新建且仍空白」的行 —— 历史空值行必须保留', () => {
    // 序列化本身不丢行（要不要丢由调用方按 shouldDropOnSave 决定）
    const csv = serializeAppendixTable(overrides, [
      { item_id: 'a', field: '', value: '' },
      { item_id: 'b', field: 'desc', value: '有内容' },
    ])
    expect(csv.trim().split('\n')).toHaveLength(3)
    // 新建 + 仍空白 → 丢；历史行即使空白也**绝不能**丢
    expect(shouldDropOnSave(overrides, { item_id: 'a', field: ' ' }, true)).toBe(true)
    expect(shouldDropOnSave(overrides, { item_id: 'a', field: ' ' }, false)).toBe(false)
    // 真实形态：related.csv 里有 source_id 有、target_id 空的行（4 条）—— 曾被误删过
    const relatedDef = APPENDIX_TABLES.find((t) => t.key === 'related')!
    expect(shouldDropOnSave(relatedDef, { source_id: '5374c017', target_id: '' }, false)).toBe(false)
    expect(isEmptyAppendixRow(relatedDef, { source_id: '5374c017', target_id: '' })).toBe(true)
  })

  it('行尾与 BOM 按原文件沿用（Excel 风格 BOM+CRLF 不被改写成 LF）', () => {
    const rows = [{ item_id: 'a', field: 'desc', value: 'v' }]
    expect(serializeAppendixTable(overrides, rows, '\r\n')).toContain('\r\n')
    expect(serializeAppendixTable(overrides, rows, '\n')).not.toContain('\r\n')
    expect(detectEol('\ufeffa,b\r\n1,2\r\n')).toBe('\r\n')
    expect(detectEol('a,b\n1,2\n')).toBe('\n')
    expect(hasBom('\ufeffa,b\n')).toBe(true)
    expect(hasBom('a,b\n')).toBe(false)
  })

  it('越界检查：通用表写保留字段被点名，专表不受影响', () => {
    expect(appendixViolation(overrides, { item_id: 'a', field: 'category' }))
      .toBe('category 归 categories.csv 管，不能写在 overrides.csv')
    expect(appendixViolation(overrides, { item_id: 'a', field: 'desc' })).toBeNull()
    expect(appendixViolation(categories, { item_id: 'a', category: '任意' })).toBeNull()
  })
})

describe('署名副表 contributors.csv + 页脚署名行', () => {
  it('解析：保序、同 by 取较晚的 at、空 by / 空 id 丢弃', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      contributors:
        'item_id,by,at\n' +
        'a,DoneyTon,2026-09-27\n' +
        'a,某人,2026-10-01\n' +
        'a,DoneyTon,2026-10-09\n' +   // 同 by 更晚 → 覆盖 at
        'a,,2026-10-09\n' +            // 空 by 丢弃
        ',匿名,2026-10-09\n',          // 空 id 丢弃
    })
    expect(apx.contributors.get('a')).toEqual([
      { by: 'DoneyTon', at: '2026-10-09' },
      { by: '某人', at: '2026-10-01' },
    ])
    expect(apx.violations).toEqual([])
  })

  it('署名文案：只给名字，不带日期（tooltip 用）', () => {
    expect(contributorLabel(undefined)).toBe('')
    expect(contributorLabel([])).toBe('')
    expect(contributorLabel([{ by: 'DoneyTon', at: '2026-09-27' }])).toBe('DoneyTon')
    expect(contributorLabel([{ by: 'A', at: '' }, { by: 'B', at: '2026-10-01' }])).toBe('A、B')
    expect(contributorLabel([
      { by: 'A', at: '' }, { by: 'B', at: '' }, { by: 'C', at: '' }, { by: 'D', at: '' },
    ])).toBe('A、B 等 4 人')
  })

  it('署名不再挂在字段表上：overrides / categories 的表头里没有 by / at', () => {
    for (const key of ['overrides', 'categories'] as const) {
      const def = APPENDIX_TABLES.find((t) => t.key === key)!
      expect(def.headers).not.toContain('by')
      expect(def.headers).not.toContain('at')
    }
    const def = APPENDIX_TABLES.find((t) => t.key === 'contributors')!
    expect(def.headers).toEqual(['item_id', 'by', 'at'])
    expect(def.keyColumns).toEqual(['item_id', 'by'])
  })
})

describe('标记副表 extra.csv（警示 / 需补充）', () => {
  it('解析：flag 大小写归一、同 (item_id,flag) 去重、未知 flag 记违规并丢弃', () => {
    const apx = parseAppendix({
      ...EMPTY_RAW,
      extra:
        'item_id,flag,note\n' +
        'a,warn,内容存疑\n' +
        'a,WARN,重复\n' +          // 归一后与上一行同键 → 去重
        'a,need,\n' +
        'b,what,未知标记\n' +       // 未知 flag → violations
        ',warn,无 id\n',
    })
    expect(apx.extra.get('a')).toEqual([
      { flag: 'warn', note: '内容存疑' },
      { flag: 'need', note: '' },
    ])
    expect(apx.extra.get('b')).toBeUndefined()
    expect(apx.violations).toEqual([`extra.csv:无法识别的 flag「what」（只认 ${EXTRA_FLAGS.join(' / ')}）`])
  })

  it('空表：零标记零违规', () => {
    const apx = parseAppendix(EMPTY_RAW)
    expect(apx.extra.size).toBe(0)
    expect(apx.violations).toEqual([])
  })

  it('表定义：flag 是键列，note 不是（同一词条同一标记只能一行）', () => {
    const def = APPENDIX_TABLES.find((t) => t.key === 'extra')!
    expect(def.headers).toEqual(['item_id', 'flag', 'note'])
    expect(def.keyColumns).toEqual(['item_id', 'flag'])
  })
})

describe('真实副表门（数据文件与声明一致）', () => {
  it('表头与 APPENDIX_TABLES 声明逐字一致（含列顺序）', () => {
    const raw = readAppendixRaw()
    for (const t of APPENDIX_TABLES) {
      const firstLine = raw[t.key].replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].trim()
      expect(firstLine, `${t.file} 表头与声明不一致`).toBe(t.headers.join(','))
    }
  })

  it('零越界：每张表只写自己那一段，保留字段不出现在 overrides.csv 里', () => {
    expect(loadAppendix().violations).toEqual([])
  })

  it('分类主分类覆盖：同一词条至多一条 role=main', () => {
    const multi = [...loadAppendix().categories.entries()]
      .filter(([, rows]) => rows.filter((r) => r.role === 'main').length > 1)
      .map(([id]) => id)
    expect(multi).toEqual([])
  })
})
