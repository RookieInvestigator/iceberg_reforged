/**
 * 副表（`src/data/appendix/*.csv`）的**关系定义与唯一解析入口**。
 *
 * ## 一张表管一个区域，同一区域不允许两张表都能写
 *
 * | 区域       | 表               | 列                              | 键                     | 语义 |
 * | ---------- | ---------------- | ------------------------------- | ---------------------- | ---- |
 * | 标量字段   | `overrides.csv`  | `item_id,field,value`           | (item_id,field)        | `field ∈ {title,desc,tags}`，新值覆盖旧值 |
 * | 分类       | `categories.csv` | `item_id,category,role`         | (item_id,category)     | `role=main` 覆盖主分类（每词条至多一条）；`role=extra`（缺省）追加副分类（OR 叠加） |
 * | 链接       | `references.csv` | `source_id,label,url,role`      | (source_id,url,role)   | `role=main` 覆盖主链接；`role=ref`（缺省）附加参考链接，见 entryLinks.ts |
 * | 推荐书目   | `reading.csv`    | `item_id,title,by,at,url,recommender,note` | (item_id,title)  | 书 / 论文，挂在词条上；同一本书可挂多个词条 |
 * | 关联词条   | `related.csv`    | `source_id,target_id`           | (source_id,target_id)  | 双向索引，见下方 parse |
 * | 署名       | `contributors.csv` | `item_id,by,at`               | (item_id,by)           | 谁贡献过这个词条；`at` 只存档不展示 |
 * | 标记       | `extra.csv`      | `item_id,flag,note`             | (item_id,flag)         | 行的存在即标记为真；`flag ∈ {warn,need}`，`note` 是 tooltip 文案 |
 * | 语义实体   | `entities.csv`   | `item_id,places,times,nouns,platforms` | (item_id)       | 从标题与描述抽取的地名 / 时间 / 核心名词 / 发布平台（`|` 分隔），供词条星图与关联评分使用 |
 *
 * ## 越界不静默
 *
 * `category` / `link` / `related` 是**保留字段**：写进 `overrides.csv` 不会生效（渲染层没有
 * 对应语义），parse 阶段记进 `violations`，由调用方 `console.warn`、由构建门断言为空、
 * 由副表编辑器拒绝保存。
 *
 * 解析与表格定义（列名/键/区域）都集中在本模块：编辑器直接拿它建表单，加列不会漏改一处。
 */
import { isSafeHttpUrl } from '../data'
import { parseCSV } from '../csv'
import { parseEntityList } from './entityExtract'

export type AppendixKey =
  | 'overrides'
  | 'categories'
  | 'references'
  | 'reading'
  | 'related'
  | 'contributors'
  | 'extra'
  | 'entities'

export interface AppendixTableDef {
  key: AppendixKey
  file: string
  /** 编辑器里的模块名 */
  label: string
  /** 区域（一个区域一张表） */
  area: string
  headers: string[]
  /** 词条 id 所在列 */
  idColumn: string
  /** 唯一键（同键 last-wins / 去重） */
  keyColumns: string[]
  writtenBy: string
  /**
   * 文件是否以 UTF-8 BOM 开头（Excel 风格的几张表）。必须显式声明：
   * `?raw` 导入会被 esbuild 剥掉 BOM，靠 hasBom(raw) 永远判成 false，
   * 编辑器一保存就会把 BOM 抹掉、在 diff 里留下无意义的一行改动。
   */
  bom?: boolean
}

export const APPENDIX_TABLES: readonly AppendixTableDef[] = [
  {
    key: 'overrides',
    file: 'overrides.csv',
    label: '标量字段订正（标题 / 描述 / 标签）',
    area: '标量字段',
    headers: ['item_id', 'field', 'value'],
    idColumn: 'item_id',
    keyColumns: ['item_id', 'field'],
    writtenBy: '反馈工作台采纳 + 副表编辑器手填',
  },
  {
    key: 'categories',
    file: 'categories.csv',
    label: '分类（主分类覆盖 / 副分类追加）',
    area: '分类',
    headers: ['item_id', 'category', 'role'],
    idColumn: 'item_id',
    keyColumns: ['item_id', 'category'],
    writtenBy: '反馈工作台采纳 + 副表编辑器手填',
    bom: true,
  },
  {
    key: 'references',
    file: 'references.csv',
    label: '链接（主链接覆盖 / 附加参考）',
    area: '链接',
    headers: ['source_id', 'label', 'url', 'role'],
    idColumn: 'source_id',
    keyColumns: ['source_id', 'url', 'role'],
    writtenBy: '反馈工作台采纳 + 副表编辑器手填',
  },
  {
    key: 'reading',
    file: 'reading.csv',
    label: '推荐阅读书目（书 / 论文）',
    area: '推荐书目',
    headers: ['item_id', 'title', 'by', 'at', 'url', 'recommender', 'note'],
    idColumn: 'item_id',
    keyColumns: ['item_id', 'title'],
    writtenBy: '副表编辑器手填',
  },
  {
    key: 'related',
    file: 'related.csv',
    label: '关联词条',
    area: '关联词条',
    headers: ['source_id', 'target_id'],
    idColumn: 'source_id',
    keyColumns: ['source_id', 'target_id'],
    writtenBy: '副表编辑器手填',
  },
  {
    key: 'contributors',
    file: 'contributors.csv',
    label: '署名（谁贡献了这个词条）',
    area: '署名',
    headers: ['item_id', 'by', 'at'],
    idColumn: 'item_id',
    keyColumns: ['item_id', 'by'],
    writtenBy: '反馈工作台采纳时自动记一笔 + 副表编辑器手填',
  },
  {
    key: 'extra',
    file: 'extra.csv',
    label: '标记（警示 / 需补充）',
    area: '标记',
    headers: ['item_id', 'flag', 'note'],
    idColumn: 'item_id',
    keyColumns: ['item_id', 'flag'],
    writtenBy: '副表编辑器手填',
  },
  {
    key: 'entities',
    file: 'entities.csv',
    label: '抽取实体（地名 / 时间 / 名词 / 平台）',
    area: '语义实体',
    headers: ['item_id', 'places', 'times', 'nouns', 'platforms'],
    idColumn: 'item_id',
    keyColumns: ['item_id'],
    writtenBy: 'scripts/generate_entities.mjs 抽取 + 副表编辑器微调',
  },
] as const

/**
 * `extra.csv` 的 flag 取值（**行的存在即该标记为真**，删行即取消）。
 * 以后加标记只在这里加一项 + 补三语文案。
 */
export const EXTRA_FLAGS = ['warn', 'need'] as const
export type ExtraFlag = (typeof EXTRA_FLAGS)[number]

export function isExtraFlag(v: string): v is ExtraFlag {
  return (EXTRA_FLAGS as readonly string[]).includes(v)
}

/** 通用表（overrides.csv）允许承载的字段 —— 与 scripts/apply_feedback.py 的 SUPPORTED 同口径 */
export const OVERRIDE_FIELDS = ['title', 'desc', 'tags'] as const
export type OverrideField = (typeof OVERRIDE_FIELDS)[number]

/** 保留字段 → 它所属的专表；通用表不得承载（越界记入 violations） */
export const RESERVED_FIELDS: Readonly<Record<string, AppendixKey>> = {
  category: 'categories',
  link: 'references',
  related: 'related',
}

/** 字段归属：保留字段返回专表 key，其余返回 null（= 通用表可收） */
export function ownerOfField(field: string): AppendixKey | null {
  return RESERVED_FIELDS[(field || '').trim().toLowerCase()] ?? null
}

/** 通用表能否承载该字段 */
export function isOverrideField(field: string): boolean {
  return (OVERRIDE_FIELDS as readonly string[]).includes((field || '').trim().toLowerCase())
}

export interface OverrideRecord {
  field: string
  value: string
}

export type CategoryRole = 'main' | 'extra'

export interface CategoryRecord {
  category: string
  /** main = 覆盖主分类；extra = 追加副分类 */
  role: CategoryRole
}

export type LinkRole = 'main' | 'ref'

export interface ReferenceRecord {
  label: string
  url: string
  role: LinkRole
}

/**
 * 推荐阅读书目（`reading.csv` 的一行）。
 * `by` 是**作者**（与 contributors.csv 的提交者区分）；`at` 是出版年；
 * `url` 可选（纸质书留空）；`recommender` 是**谁推荐了这本书**。
 * 同一本书可以挂到多个词条：每个词条各写一行（推荐者可按行不同）。
 */
export interface ReadingRecord {
  title: string
  by: string
  at: string
  url: string
  recommender: string
  note: string
}

/** 署名：谁为这个词条出过力（`by` 为提交者显示名；`at` 为日期，仅存档不展示） */
export interface ContributorRecord {
  by: string
  at: string
}

/** 标记：`extra.csv` 的一行（行的存在 = 该标记为真；note 是 hover 提示） */
export interface ExtraRecord {
  flag: ExtraFlag
  note: string
}

/** 抽取实体：`entities.csv` 的一行（从标题/描述抽取的规范化语义特征） */
export interface EntityRecord {
  places: string[]
  times: string[]
  nouns: string[]
  platforms: string[]
}

export interface AppendixData {
  /** item_id → 订正记录（按 CSV 顺序；同 (item_id,field) 多行时 last-wins，由 overrides.ts 决定） */
  overrides: Map<string, OverrideRecord[]>
  /** item_id → 分类记录（保序；含 main 与 extra） */
  categories: Map<string, CategoryRecord[]>
  /** source_id → 链接记录（role=main / ref） */
  references: Map<string, ReferenceRecord[]>
  /** item_id → 推荐阅读书目（保序去重 (item_id,title)） */
  reading: Map<string, ReadingRecord[]>
  /** 双向关联：source → target 与 target → source 都存在 */
  related: Map<string, string[]>
  /** item_id → 署名记录（保序去重 (item_id,by)，同 by 取较晚的 at） */
  contributors: Map<string, ContributorRecord[]>
  /** item_id → 标记记录（保序去重 (item_id,flag)） */
  extra: Map<string, ExtraRecord[]>
  /** item_id → 抽取实体（地名 / 时间 / 核心名词） */
  entities: Map<string, EntityRecord>
  /** 越界写法（去重，形如 `overrides.csv:category（应写 categories.csv）`），调用方必须外显 */
  violations: string[]
}

export interface AppendixRaw {
  overrides: string
  categories: string
  references: string
  reading: string
  related: string
  contributors: string
  extra: string
  entities: string
}

/** 读全部副表（构建期 raw 文本）。键名与 APPENDIX_TABLES 的 key 一致 */
export function readAppendixRaw(): AppendixRaw {
  const mods = import.meta.glob('../../data/appendix/*.csv', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const out: AppendixRaw = {
    overrides: '', categories: '', references: '', reading: '', related: '', contributors: '', extra: '', entities: '',
  }
  for (const def of APPENDIX_TABLES) {
    out[def.key] = mods[`../../data/appendix/${def.file}`] || ''
  }
  return out
}

/** 解析全部副表（纯函数，便于测试与构建门复用） */
export function parseAppendix(raw: AppendixRaw): AppendixData {
  const out: AppendixData = {
    overrides: new Map(),
    categories: new Map(),
    references: new Map(),
    reading: new Map(),
    related: new Map(),
    contributors: new Map(),
    extra: new Map(),
    entities: new Map(),
    violations: [],
  }
  const violations = new Set<string>()

  // ── overrides.csv：item_id → [{field,value}] ───────────────────────────────
  for (const row of parseCSV(raw.overrides)) {
    const id = (row.item_id || '').trim()
    if (!id) continue
    const field = (row.field || '').trim()
    if (!field) continue
    // 保留字段：记违规但**仍然保留记录**（供编辑器显示 / export 报告），由 overrides.ts 拒绝生效
    const owner = ownerOfField(field)
    if (owner) violations.add(`overrides.csv:${field}（应写 ${tableFile(owner)}）`)
    if (!out.overrides.has(id)) out.overrides.set(id, [])
    out.overrides.get(id)!.push({ field, value: row.value || '' })
  }

  // ── categories.csv：item_id → [{category,role,by,at}]，保序去重 ─────────────
  for (const row of parseCSV(raw.categories)) {
    const id = (row.item_id || '').trim()
    const category = (row.category || '').trim()
    if (!id || !category) continue
    const rawRole = (row.role || '').trim().toLowerCase()
    // 缺省 = extra（无 role 列时一律按「追加副分类」）
    const role: CategoryRole = rawRole === 'main' ? 'main' : 'extra'
    if (rawRole && rawRole !== 'main' && rawRole !== 'extra') {
      violations.add(`categories.csv:无法识别的 role「${rawRole}」（只认 main / extra）`)
    }
    const list = out.categories.get(id) || []
    if (list.some((r) => r.category === category && r.role === role)) continue
    list.push({ category, role })
    out.categories.set(id, list)
  }

  // ── references.csv：source_id → [{label,url,role}] ─────────────────────────
  for (const row of parseCSV(raw.references)) {
    const src = (row.source_id || '').trim()
    const label = (row.label || '').trim()
    const url = (row.url || '').trim()
    if (!src || !url) continue
    if (!isSafeHttpUrl(url)) continue // F34：副表 URL 同样过 schema 校验
    const rawRole = (row.role || '').trim().toLowerCase()
    const role: LinkRole = rawRole === 'main' ? 'main' : 'ref'
    if (rawRole && rawRole !== 'main' && rawRole !== 'ref') {
      violations.add(`references.csv:无法识别的 role「${rawRole}」（只认 main / ref）`)
    }
    const list = out.references.get(src) || []
    if (list.some((r) => r.url === url && r.role === role)) continue
    // label 允许为空：展示层按域名统一派生站点名（见 lib/sourceLabel.ts）
    list.push({ label, url, role })
    out.references.set(src, list)
  }

  // ── reading.csv：item_id → [{title,by,at,url,recommender,note}]，保序去重 (item_id,title) ──
  for (const row of parseCSV(raw.reading)) {
    const id = (row.item_id || '').trim()
    const title = (row.title || '').trim()
    if (!id || !title) continue
    const rawUrl = (row.url || '').trim()
    // 链接可选：填了但不合法 → 丢掉链接、保留书目（书本身还在），并记违规
    const url = rawUrl && isSafeHttpUrl(rawUrl) ? rawUrl : ''
    if (rawUrl && !url) violations.add(`reading.csv:非法 URL「${rawUrl}」（已忽略链接、保留书目）`)
    const list = out.reading.get(id) || []
    if (list.some((r) => r.title === title)) continue
    list.push({
      title,
      by: (row.by || '').trim(),
      at: (row.at || '').trim(),
      url,
      recommender: (row.recommender || '').trim(),
      note: (row.note || '').trim(),
    })
    out.reading.set(id, list)
  }

  // ── related.csv：双向索引（source → target 与 target → source） ─────────────
  for (const row of parseCSV(raw.related)) {
    const src = (row.source_id || '').trim()
    const tgt = (row.target_id || '').trim()
    if (!src || !tgt || src === tgt) continue
    for (const [a, b] of [[src, tgt], [tgt, src]] as const) {
      const list = out.related.get(a) || []
      if (!list.includes(b)) list.push(b)
      out.related.set(a, list)
    }
  }

  // ── contributors.csv：item_id → [{by,at}]，同 by 取较晚的 at ────────────────
  for (const row of parseCSV(raw.contributors)) {
    const id = (row.item_id || '').trim()
    const by = (row.by || '').trim()
    if (!id || !by) continue
    const at = (row.at || '').trim()
    const list = out.contributors.get(id) || []
    const hit = list.find((c) => c.by === by)
    if (hit) {
      if (at > hit.at) hit.at = at
    } else {
      list.push({ by, at })
    }
    out.contributors.set(id, list)
  }

  // ── extra.csv：item_id → [{flag,note}]，保序去重 (item_id,flag) ─────────────
  for (const row of parseCSV(raw.extra)) {
    const id = (row.item_id || '').trim()
    const flag = (row.flag || '').trim().toLowerCase()
    if (!id || !flag) continue
    if (!isExtraFlag(flag)) {
      violations.add(`extra.csv:无法识别的 flag「${flag}」（只认 ${EXTRA_FLAGS.join(' / ')}）`)
      continue
    }
    const list = out.extra.get(id) || []
    if (list.some((r) => r.flag === flag)) continue
    list.push({ flag, note: (row.note || '').trim() })
    out.extra.set(id, list)
  }

  // ── entities.csv：item_id → {places,times,nouns,platforms}（`|` 分隔，last-wins）────
  // platforms 列是后加的，旧 CSV 无此列时 parseEntityList(undefined) 返回空数组，兼容
  for (const row of parseCSV(raw.entities || '')) {
    const id = (row.item_id || '').trim()
    if (!id) continue
    out.entities.set(id, {
      places: parseEntityList(row.places),
      times: parseEntityList(row.times),
      nouns: parseEntityList(row.nouns),
      platforms: parseEntityList(row.platforms),
    })
  }

  out.violations = [...violations]
  return out
}

/** 读 + 解析（视图与编辑器用） */
export function loadAppendix(): AppendixData {
  return parseAppendix(readAppendixRaw())
}

/** key → 文件名（violations 文案用） */
export function tableFile(key: AppendixKey): string {
  return APPENDIX_TABLES.find((t) => t.key === key)?.file || key
}

/**
 * 越界检查（编辑器保存前调用，与 parseAppendix 的 violations 同口径）：
 * 保留字段写进通用表 → 返回原因；合法则返回 null。
 */
export function appendixViolation(def: AppendixTableDef, row: Record<string, string>): string | null {
  if (def.key !== 'overrides') return null
  const field = (row.field || '').trim()
  const owner = ownerOfField(field)
  return owner ? `${field} 归 ${tableFile(owner)} 管，不能写在 ${def.file}` : null
}

/** 整行只填了 id（点了「+ 添加」又没填）——**仅供判断「本次新建的行是否还空着」** */
export function isEmptyAppendixRow(def: AppendixTableDef, row: Record<string, string>): boolean {
  return def.headers.every((h) => h === def.idColumn || !(row[h] || '').trim())
}

/**
 * 保存时该不该丢这一行：**只有「本次新建、且仍然空白」的行才丢**。
 *
 * ⚠️ 绝不能只看「空不空」：历史副表里确实存在「source_id 有、target_id 空」的行
 * （related.csv 里有 4 条），按空值判会把它们当垃圾行删掉。所以「新建」必须由调用方显式告知。
 */
export function shouldDropOnSave(
  def: AppendixTableDef,
  row: Record<string, string>,
  isFresh: boolean,
): boolean {
  return isFresh && isEmptyAppendixRow(def, row)
}

/**
 * 序列化为 CSV（编辑器保存用）：RFC 4180 子集，与 lib/csv.ts 的 parseCSV 对称 ——
 * 含逗号/引号/换行的单元格加引号并把 `"` 转成 `""`。
 * **原样写出传入的每一行**（要不要丢行由调用方用 shouldDropOnSave 决定，见上）。
 * 表头固定取 `def.headers`，所以列顺序与声明永远一致（表头门也因此恒过）。
 *
 * `eol` / BOM 由调用方按**该文件原有约定**传入：手写过的副表是 Excel 风格
 * （BOM + CRLF），脚本写过的是 UTF-8 + LF —— 统一改写会让整表在 diff 里全变。
 */
export function serializeAppendixTable(
  def: AppendixTableDef,
  rows: Array<Record<string, string>>,
  eol: '\n' | '\r\n' = '\n',
): string {
  const lines = [def.headers.join(',')]
  for (const row of rows) {
    lines.push(
      def.headers
        .map((h) => {
          const v = (row[h] || '').trim()
          return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
        })
        .join(','),
    )
  }
  return lines.join(eol) + eol
}

/** 原始 CSV 的行尾约定（供编辑器保存时沿用） */
export function detectEol(raw: string): '\n' | '\r\n' {
  return raw.includes('\r\n') ? '\r\n' : '\n'
}

/** 原始 CSV 是否带 UTF-8 BOM（供编辑器保存时沿用） */
export function hasBom(raw: string): boolean {
  return raw.charCodeAt(0) === 0xfeff
}

/**
 * 署名文案（图标 tooltip）：**只给名字，不带日期**（`at` 仅存档）。多人时取前两位 + 「等 N 人」。
 */
export function contributorLabel(rows: ContributorRecord[] | undefined): string {
  if (!rows?.length) return ''
  const names = rows.map((r) => r.by).filter(Boolean)
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 人`
}
