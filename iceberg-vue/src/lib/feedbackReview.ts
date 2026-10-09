/**
 * 反馈审核工作台纯逻辑（DEV 工具，不进生产包）。
 *
 * 背景：`entry_feedback` 的审阅原本只写在 docs/FEEDBACK_WORKFLOW.md 里（在 Supabase 后台逐条改
 * status），量一上来就不可行。工作台把「看 diff → 决定采纳/驳回 → 导出决定」搬进本地页面，
 * 决定落 `data/feedback/decisions.json`（data/ 不入库），再由 scripts/apply_feedback.py
 * 按决定写入 appendix 两个副表。
 *
 * 分工刻意保持：**页面只记录人的判断，不写副表**；写盘由脚本做（可 dry-run、可审计、可回滚）。
 */

import { normalizeTags } from './tags'

export type Decision = 'accept' | 'reject' | 'later'

/** 工作台里对建议值的就地修改（**不改 Supabase**，只影响本地 decisions.json → 副表落盘） */
export interface FieldEdits {
  title?: string
  desc?: string
  link?: string
  category?: string
  /** 标签：序列化串（JSON 数组，兼容逗号分隔）—— CSV 单列存数组的唯一稳当写法 */
  tags?: string
  /** 链接副表：显示名（留空 = 交给 lib/sourceLabel.ts 按域名自动判） */
  linkLabel?: string
  /** 链接副表角色：main = 覆盖词条主链接；ref/空 = 附加参考链接 */
  linkRole?: string
}

export interface DecisionRecord {
  /** 只改了字段、还没做决定时可以为空 —— 统计里仍算「未决」 */
  decision?: Decision
  reason?: string
  edits?: FieldEdits
  at: string
}

export type DecisionMap = Record<string, DecisionRecord>

export interface FeedbackRow {
  id: string
  itemId: string
  note: string
  userId: string
  createdAt: string
  /** Supabase 里的状态：open / accepted / rejected（拉取范围可切换，用于回看已审条目） */
  status: string
  /** 是否已合入副表（库里 applied=true；仅 accepted 行会为真） */
  applied: boolean
  /** changes 里的五个可落盘字段（与反馈表单一致：title/desc/link/category/tags） */
  link: string
  desc: string
  title: string
  /** 分类名（表单里是下拉选择，单值） */
  category: string
  /** 标签名数组（表单里是多选 pills；落 CSV 时序列化为 JSON 串） */
  tags: string[]
  /** 仍未支持的其它字段（未知 key，只报告不落值） */
  unsupported: string[]
}

export type RowKind = 'link' | 'desc' | 'title' | 'meta' | 'mixed'

const DECISIONS_KEY = 'iceberg-feedback-review-decisions'

// 来源站点识别统一在 lib/sourceLabel.ts（词条链接与参考链接共用同一套），此处不再重复维护域名表

/** changes 可能是对象（REST）或 JSON 字符串（CSV 导出），其它一律视为空 */
function parseChanges(v: unknown): Record<string, string> {
  if (v && typeof v === 'object') return v as Record<string, string>
  if (typeof v === 'string' && v.trim()) {
    try {
      const o = JSON.parse(v)
      return o && typeof o === 'object' ? (o as Record<string, string>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/** 把 REST / CSV 两种来源的行归一成同一形状；缺 item_id 的行丢弃 */
export function normalizeRows(raw: Array<Record<string, unknown>>): FeedbackRow[] {
  const out: FeedbackRow[] = []
  for (const r of raw) {
    const itemId = str(r.item_id)
    if (!itemId) continue
    const ch = parseChanges(r.changes)
    const unsupported: string[] = []
    for (const k of Object.keys(ch)) {
      if (k !== 'link' && k !== 'desc' && k !== 'title' && k !== 'category' && k !== 'tags') unsupported.push(k)
    }
    out.push({
      id: str(r.id),
      itemId,
      note: str(r.note),
      userId: str(r.user_id),
      createdAt: str(r.created_at),
      status: str(r.status) || 'open',
      applied: r.applied === true || str(r.applied) === 'true',
      link: str(ch.link),
      desc: str(ch.desc),
      title: str(ch.title),
      category: str(ch.category),
      tags: normalizeTags(ch.tags),
      unsupported,
    })
  }
  return out
}

export function kindOf(row: FeedbackRow): RowKind {
  const kinds: RowKind[] = []
  if (row.link) kinds.push('link')
  if (row.desc) kinds.push('desc')
  if (row.title) kinds.push('title')
  if (row.category || row.tags.length) kinds.push('meta')
  if (kinds.length > 1) return 'mixed'
  return kinds[0] || 'mixed'
}

export interface ReviewStats {
  total: number
  accept: number
  reject: number
  later: number
  undecided: number
}

export function stats(rows: FeedbackRow[], decisions: DecisionMap): ReviewStats {
  const s: ReviewStats = { total: rows.length, accept: 0, reject: 0, later: 0, undecided: 0 }
  for (const r of rows) {
    const d = decisions[r.id]?.decision
    if (d === 'accept') s.accept++
    else if (d === 'reject') s.reject++
    else if (d === 'later') s.later++
    else s.undecided++
  }
  return s
}

/** 只把「采纳」交给落盘脚本 —— 待定与驳回一律不动 */
export function acceptedIds(rows: FeedbackRow[], decisions: DecisionMap): string[] {
  return rows.filter((r) => decisions[r.id]?.decision === 'accept').map((r) => r.id)
}

/** 拉取范围：与 Supabase 查询的 `status=eq.X` 一一对应（all = 不加过滤） */
export type ReviewScope = 'open' | 'accepted' | 'rejected' | 'all'
/** 类型筛选：unsupported 是「有未知字段」这一特殊桶 */
export type ReviewKind = 'all' | 'link' | 'desc' | 'title' | 'meta' | 'unsupported'

export interface ReviewFilter {
  scope: ReviewScope
  kind: ReviewKind
  /** 只看未决（本地 decisions 里没有决定的行）——与库里的 status 是两回事，故分开两个开关 */
  undecidedOnly: boolean
  query: string
  /** item_id → 标题，供关键词搜索命中词条名 */
  titles?: Record<string, string>
}

/**
 * 工作台列表筛选（纯函数，2026-10-09 从视图里提出来）。
 *
 * 顺序固定：**库状态 → 类型 → 未决 → 关键词**，四步互不干扰。
 * 「已审」有两个口径，故意分成两个开关而不是合成一个：
 *   · `scope` 走库里的 `status`（open / accepted / rejected）——回填之后 open 里查不到，
 *     想看已审就得切 scope；Supabase 模式下它同时是查询过滤，CSV 离线模式下就靠这里兜；
 *   · `undecidedOnly` 走本地 `decisions.json` ——「我在这台机器上决定过没有」。
 * 两者会不一致（比如线上已 accepted，本地 decisions 没有），合成一个必然有一边说不清。
 */
export function filterReviewRows(
  rows: FeedbackRow[],
  decisions: DecisionMap,
  f: ReviewFilter,
): FeedbackRow[] {
  let list = rows
  if (f.scope !== 'all') list = list.filter((r) => r.status === f.scope)
  if (f.kind === 'unsupported') list = list.filter((r) => r.unsupported.length > 0)
  else if (f.kind !== 'all') list = list.filter((r) => !!(r as unknown as Record<string, unknown>)[f.kind])
  if (f.undecidedOnly) list = list.filter((r) => !decisions[r.id])
  const q = f.query.trim().toLowerCase()
  if (q) {
    const titles = f.titles || {}
    list = list.filter(
      (r) =>
        r.itemId.includes(q) ||
        r.id === q ||
        r.note.toLowerCase().includes(q) ||
        (titles[r.itemId] || '').toLowerCase().includes(q),
    )
  }
  return list
}

/** 这批反馈涉及多少个**词条**（去重 item_id）——「审了多少条」与「动了多少个词条」不是一回事 */
export function itemIdsOf(rows: FeedbackRow[]): string[] {
  return [...new Set(rows.map((r) => r.itemId).filter(Boolean))]
}

export type TextField = 'title' | 'desc' | 'link' | 'category'

/** 落盘与展示用的字段值：**编辑优先**，其次反馈原值（空编辑视为「未改」，不做删除语义） */
export function effectiveValue(
  row: FeedbackRow,
  edits: FieldEdits | undefined,
  field: TextField,
): string {
  const e = edits?.[field]
  return typeof e === 'string' && e.trim() ? e : row[field] || ''
}

/** 标签：编辑优先（序列化串或数组），其次反馈原数组 */
export function effectiveTags(row: FeedbackRow, edits: FieldEdits | undefined): string[] {
  const e = edits?.tags
  if (typeof e === 'string' && e.trim()) return normalizeTags(e)
  return row.tags
}

/** 标签落 CSV 的序列化：JSON 数组（标签名不含引号，且能避开逗号歧义） */
export const serializeTags = (list: string[]): string => JSON.stringify(list)

/** 合并编辑补丁：空串/空白表示撤销该字段的编辑（删 key），其余覆盖 */
export function mergeEdits(prev: FieldEdits | undefined, patch: FieldEdits): FieldEdits {
  const out: FieldEdits = { ...(prev || {}) }
  for (const k of ['title', 'desc', 'link', 'category', 'tags', 'linkLabel', 'linkRole'] as const) {
    if (!(k in patch)) continue
    const v = patch[k]
    if (typeof v === 'string' && v.trim()) out[k] = v
    else delete out[k]
  }
  return out
}

export const hasEdits = (edits: FieldEdits | undefined): boolean => !!edits && Object.keys(edits).length > 0

export function loadDecisions(): DecisionMap {
  try {
    const raw = localStorage.getItem(DECISIONS_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? (o as DecisionMap) : {}
  } catch {
    return {}
  }
}

export function saveDecisions(m: DecisionMap): void {
  try {
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(m))
  } catch {
    /* 隐私模式：忽略（磁盘副本仍在） */
  }
}

/** 磁盘副本（data/feedback/decisions.json，由 dev 中间件读写）——localStorage 被清也能救回 */
export async function loadDecisionsFromDisk(): Promise<DecisionMap | null> {
  try {
    const resp = await fetch('/__feedback-decisions')
    if (!resp.ok) return null
    const body = await resp.json() as { decisions?: DecisionMap }
    return body.decisions && typeof body.decisions === 'object' ? body.decisions : null
  } catch {
    return null
  }
}

export async function saveDecisionsToDisk(m: DecisionMap): Promise<boolean> {
  try {
    const resp = await fetch('/__feedback-decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: m }),
    })
    return resp.ok
  } catch {
    return false
  }
}

/** 落盘命令（CLI 等价路径，文档/脚本用；工作台里已改为一键调用 dev 中间件） */
export const APPLY_COMMAND =
  'python scripts/apply_feedback.py --from-api --decisions data/feedback/decisions.json --write'

/**
 * 读 JSON 响应。为什么不能直接 `resp.json()`：dev server 在 `vite.config.ts` 变更后会自行重启，
 * 重启窗口内所有请求都收到纯文本 `503 The server is being restarted` —— 盲解会把一句人话
 * 变成 `Unexpected token 'T', "The server"... is not valid JSON` 这种无从排查的报错。
 */
export async function readJsonResponse<T>(resp: Response): Promise<{ ok: boolean; data?: T; error?: string }> {
  const text = await resp.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    const hint = /being restarted/i.test(text) ? '（dev server 正在重启，稍等几秒再试）' : ''
    return { ok: false, error: `HTTP ${resp.status}${hint}：服务端返回的不是 JSON —— ${(text || '(空响应)').slice(0, 200)}` }
  }
  if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}：${text.slice(0, 200)}` }
  return { ok: true, data: data as T }
}
