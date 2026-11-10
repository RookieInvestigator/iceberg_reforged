// 开发模式专用：拉取全站互动与用户数据的聚合视图（点赞 / 收藏 / 评论 / 反馈）。
//
// 实现口径与线上一致：
// - 点赞 / 收藏走 `interaction_counts` RPC（线上同款，一次传全部 item id）；
// - 评论/互动/反馈的用户数与条数需要按行聚合，按 1000/page 分页拉取后在本地累加；
// - 反馈表是 `entry_feedback`（与反馈审核工作台同一张表、同一 anon 权限）。
// 只在 DEV 页面调用；失败一律抛出，由页面展示「不可用」而不是静默 0。
import { supabase, isSupabaseReady } from '../supabase'

export type InteractionType = 'like' | 'favorite'

export interface InteractionStats {
  likes: Map<string, number>
  favorites: Map<string, number>
  comments: Map<string, number>
  /** 各类互动的「去重用户数」 */
  users: { likes: number; favorites: number; comments: number; feedback: number; any: number }
  /** 各类互动的行数 */
  rows: { likes: number; favorites: number; comments: number; feedback: number }
  /** 反馈工作台同源数据 */
  feedback: { total: number; open: number; accepted: number; rejected: number }
}

const PAGE = 1000
const MAX_PAGES = 50

interface Row { user_id?: string; type?: string; item_id?: string; status?: string }

/** 分页拉一张表的指定列（anon 只读） */
async function fetchRows(table: string, columns: string): Promise<Row[]> {
  const out: Row[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw error
    const batch = (data as Row[] | null) || []
    out.push(...batch)
    if (batch.length < PAGE) break
  }
  return out
}

async function fetchCounts(ids: string[], type: InteractionType): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!ids.length) return out
  const { data, error } = await supabase.rpc('interaction_counts', { p_type: type, p_ids: ids })
  if (error) throw error
  for (const row of (data as { target_id: string; cnt: number }[] | null) || []) {
    const n = Number(row.cnt) || 0
    if (n > 0) out.set(String(row.target_id), n)
  }
  return out
}

/** 拉全站互动 + 用户聚合；Supabase 未配置时直接抛错（DEV 页面会显示原因）。 */
export async function fetchInteractionStats(itemIds: string[]): Promise<InteractionStats> {
  if (!isSupabaseReady) throw new Error('Supabase 未配置（.env 缺 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）')

  const [likes, favorites, interactionRows, commentRows, feedbackRows] = await Promise.all([
    fetchCounts(itemIds, 'like'),
    fetchCounts(itemIds, 'favorite'),
    fetchRows('interactions', 'user_id,type'),
    fetchRows('comments', 'item_id,user_id'),
    fetchRows('entry_feedback', 'user_id,status'),
  ])

  // 互动行 → 按类型分用户的集合 + 行数
  const likeUsers = new Set<string>()
  const favUsers = new Set<string>()
  let likeRows = 0
  let favRows = 0
  for (const row of interactionRows) {
    const uid = row.user_id
    if (row.type === 'like') {
      likeRows++
      if (uid) likeUsers.add(uid)
    } else if (row.type === 'favorite') {
      favRows++
      if (uid) favUsers.add(uid)
    }
  }

  // 评论：每行一个 user_id，同时聚合成「每词条评论数」
  const commentUsers = new Set<string>()
  const comments = new Map<string, number>()
  for (const row of commentRows) {
    if (row.item_id) {
      const id = String(row.item_id)
      comments.set(id, (comments.get(id) || 0) + 1)
    }
    if (row.user_id) commentUsers.add(row.user_id)
  }

  // 反馈：条数 + 提交者 + 状态分布
  const feedbackUsers = new Set<string>()
  const feedback = { total: 0, open: 0, accepted: 0, rejected: 0 }
  for (const row of feedbackRows) {
    feedback.total++
    if (row.user_id) feedbackUsers.add(row.user_id)
    if (row.status === 'open') feedback.open++
    else if (row.status === 'accepted') feedback.accepted++
    else if (row.status === 'rejected') feedback.rejected++
  }

  const anyUsers = new Set<string>([...likeUsers, ...favUsers, ...commentUsers, ...feedbackUsers])

  return {
    likes,
    favorites,
    comments,
    users: {
      likes: likeUsers.size,
      favorites: favUsers.size,
      comments: commentUsers.size,
      feedback: feedbackUsers.size,
      any: anyUsers.size,
    },
    rows: {
      likes: likeRows,
      favorites: favRows,
      comments: commentRows.length,
      feedback: feedback.total,
    },
    feedback,
  }
}

/** 注册用户总数（走 dev 中间件 → Supabase Admin API；未配置 service_role 时返回 error）。 */
export async function fetchUserTotal(): Promise<{ total: number | null; error?: string }> {
  try {
    const resp = await fetch('/__admin/user-count')
    const body = (await resp.json().catch(() => ({}))) as { total?: number; error?: string }
    if (!resp.ok) return { total: null, error: body.error || `HTTP ${resp.status}` }
    return { total: typeof body.total === 'number' ? body.total : null, error: body.error }
  } catch (e) {
    return { total: null, error: e instanceof Error ? e.message : String(e) }
  }
}
