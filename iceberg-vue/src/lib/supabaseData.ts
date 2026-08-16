import { supabase, isSupabaseReady } from './supabase'
import { t } from './i18nStore'
import { reportError } from './report'

// ==========================================
// 评论
// ==========================================
export interface CommentRow {
  id: number
  user_id: string | null
  item_id: string
  content: string
  created_at: string
  anon_name?: string
  author_name?: string
  like_count?: number
  user_liked?: boolean
}

export interface CommentPage {
  rows: CommentRow[]
  /** 是否还有下一页（服务端返回 limit+1 条来判定） */
  hasMore: boolean
}

/** 获取某词条的评论列表（分页） */
export async function fetchComments(itemId: string, userId?: string, opts?: { offset?: number; limit?: number }): Promise<CommentPage> {
  const offset = opts?.offset ?? 0
  const limit = opts?.limit ?? 50
  // F10：offset 必须真正生效 —— 用 range 分页（闭区间取 limit+1 条用于判定 hasMore），
  // 排序加 id 作 tiebreaker 保证同秒评论下分页稳定不重不漏
  const { data, error } = await supabase
    .from('comments')
    .select('id, user_id, item_id, content, created_at, anon_name')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit)
  if (error) { console.warn('[fetchComments]', error); return { rows: [], hasMore: false } }
  if (!data) return { rows: [], hasMore: false }

  const page = data.slice(0, limit)
  const hasMore = data.length > limit
  const ids = page.map(c => c.id)
  const rows: CommentRow[] = []

  // 批量取登录用户的显示名（P0-6：RPC 只返回有 display_name 的用户，
  // 未设昵称/新用户在此回退「匿名用户」展示，避免泄漏邮箱前缀）
  let nameMap = new Map<string, string>()
  try {
    const uids = [...new Set(page.filter(c => c.user_id).map(c => c.user_id!))]
    if (uids.length) {
      const { data: names } = await supabase.rpc('batch_user_display', { uids })
      if (names) for (const n of names as any[]) nameMap.set(n.user_id, n.display_name)
    }
  } catch (e) { reportError('supabase', e, { op: 'batch_user_display' }) }

  // 批量取点赞数（P0-审计 2026-08-16）：interactions_select 已收紧为仅本人，
  // 匿名计数改走 SECURITY DEFINER RPC interaction_counts（分组聚合，不暴露 user_id 明细）。
  let likeCounts: { id: number; count: number }[] = []
  if (ids.length) {
    try {
      const { data: agg, error: aggErr } = await supabase
        .rpc('interaction_counts', { p_type: 'like', p_ids: ids.map(String) })
      // RPC 404（migration 未在线上执行）静默降级，不刷红
      const notFound = aggErr && /404|not found|does not exist/i.test(
        JSON.stringify((aggErr as { message?: string; details?: string }).message || (aggErr as { details?: string }).details || ''))
      if (aggErr && !notFound) reportError('supabase', aggErr, { op: 'comment-like-counts' })
      const countMap = new Map<string, number>()
      for (const l of (agg || []) as { target_id: string; cnt: number }[]) countMap.set(String(l.target_id), Number(l.cnt) || 0)
      likeCounts = ids.map(id => ({ id, count: countMap.get(String(id)) || 0 }))
    } catch (e) {
      reportError('supabase', e, { op: 'comment-like-counts' })
      likeCounts = ids.map(id => ({ id, count: 0 }))
    }
  }

  // 当前用户的点赞状态
  let userLiked = new Set<number>()
  if (userId && ids.length) {
    const { data: likes } = await supabase
      .from('interactions')
      .select('target_id')
      .eq('user_id', userId)
      .eq('target_type', 'comment')
      .eq('type', 'like')
      .filter('target_id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`)
    if (likes) userLiked = new Set(likes.map(l => Number(l.target_id)))
  }

  for (const c of page) {
    rows.push({
      ...c,
      author_name: c.user_id
        ? (nameMap.get(c.user_id) || t('anonymousUser'))
        : (c.anon_name || t('anonymousUser')),
      like_count: likeCounts.find(l => l.id === c.id)?.count || 0,
      user_liked: userLiked.has(c.id),
    })
  }
  return { rows, hasMore }
}

/** 获取某词条的评论总数（只读降级：失败返回 0 并上报） */
export async function fetchCommentCount(itemId: string): Promise<number> {
  const { count, error } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('item_id', itemId)
  if (error) { reportError('supabase', error, { op: 'comment-count' }); return 0 }
  return count || 0
}

/** 发表评论（登录或匿名） */
export async function postComment(itemId: string, content: string, anonName?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload: Record<string, any> = { item_id: itemId, content }
  if (user) {
    payload.user_id = user.id
  } else {
    if (!anonName) throw new Error('匿名名称缺失')
    payload.anon_name = anonName
  }
  const { error } = await supabase.from('comments').insert(payload)
  if (error) throw error
}

/** 删除评论 */
export async function deleteComment(commentId: number) {
  const { error } = await supabase.from('comments').delete().eq('id', commentId)
  if (error) throw error
  // P1-14：其点赞行由数据库触发器 trg_comments_delete_likes 级联清理
  // （见 supabase/migration.sql）。应用层删除他人点赞行受 RLS（auth.uid() = user_id）限制，
  // 无法直接执行，必须依赖触发器。
}

// ==========================================
// 互动（点赞 + 收藏）
// ==========================================
export type InteractionType = 'like' | 'favorite'

/**
 * F11：统一错误检查 —— 写操作与状态查询失败一律抛出，由调用方回滚 UI 并展示可恢复错误，
 * 避免本地状态与云端悄然漂移。
 */
function throwIfError<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error
  return res
}

/** 获取某目标的互动计数（P0-审计：改走 interaction_counts RPC，只读降级：失败返回 0 并上报） */
export async function fetchInteractionCount(targetType: 'item' | 'comment', targetId: string, type: InteractionType) {
  try {
    const { data, error } = await supabase
      .rpc('interaction_counts', { p_type: type, p_ids: [String(targetId)] })
    // P0-审计：migration.sql 尚未在线上执行时 RPC 404 —— 静默降级为 0，不上报刷红
    if (error) {
      const notFound = typeof error === 'object' && error !== null &&
        /404|not found|does not exist/i.test(JSON.stringify((error as { message?: string; details?: string }).message || (error as { details?: string }).details || ''))
      if (!notFound) reportError('supabase', error, { op: 'interaction-count' })
      return 0
    }
    const row = (data as { target_id: string; cnt: number }[] | null)?.[0]
    return row ? Number(row.cnt) || 0 : 0
  } catch (e) {
    reportError('supabase', e, { op: 'interaction-count' })
    return 0
  }
}

/**
 * 切换互动状态（点赞/取消，收藏/取消）。
 * F11：delete 返回被删行，省去预查询；全部错误显式抛出（RLS 拒绝 / 网络失败由调用方回滚）。
 * 幂等性：唯一约束兜底 —— 并发双插时 insert 抛错，调用方回滚，不产生脏数据。
 */
export async function toggleInteraction(targetType: 'item' | 'comment', targetId: string, type: InteractionType) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('请先登录')

  // 存在则删（delete().select() 返回被删行），否则插入 —— 单次往返完成「读 + 反转」
  const { data: deleted } = await throwIfError(
    await supabase.from('interactions').delete()
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('type', type)
      .select('target_id')
      .maybeSingle()
  )
  if (deleted) return false // 已取消

  await throwIfError(
    await supabase.from('interactions').insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      type,
    })
  )
  return true // 已设置
}

/** 获取当前用户对一批目标的互动状态 */
export async function fetchMyInteractions(targetType: 'item' | 'comment', targetIds: string[], type: InteractionType) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Set<string>()
  const { data } = await throwIfError(
    await supabase.from('interactions')
      .select('target_id')
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('type', type)
      .in('target_id', targetIds)
  )
  return new Set((data || []).map(r => r.target_id))
}

/** 同步本地收藏到云端（本地为权威源的双向 diff：新增缺失、删除多余）。F11：错误全部抛出 */
export async function syncFavorites(itemIds: string[]) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // 获取云端已有收藏
  const { data: existing } = await throwIfError(
    await supabase.from('interactions')
      .select('target_id')
      .eq('user_id', user.id)
      .eq('target_type', 'item')
      .eq('type', 'favorite')
  )

  const existingIds = new Set((existing || []).map(r => r.target_id))
  const localIds = new Set(itemIds)

  // 新增
  const toAdd = [...localIds].filter(id => id && !existingIds.has(id))
  if (toAdd.length) {
    await throwIfError(
      await supabase.from('interactions').insert(
        toAdd.map(id => ({ user_id: user.id, target_type: 'item', target_id: id, type: 'favorite' }))
      ).select()
    )
  }
  // 删除（云端有、本地无 → 传播删除）
  const toRemove = [...existingIds].filter(id => !localIds.has(id))
  if (toRemove.length) {
    await throwIfError(
      await supabase.from('interactions').delete()
        .eq('user_id', user.id)
        .eq('target_type', 'item')
        .eq('type', 'favorite')
        .in('target_id', toRemove)
    )
  }
}

/** 用户统计 */
export interface UserStats {
  comments: number
  favorites: number
  likes: number
  favoriteIds: string[]
}

export async function fetchUserStats(): Promise<UserStats | null> {
  if (!isSupabaseReady()) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [cRes, fRes, lRes] = await Promise.all([
    supabase.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('interactions').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id).eq('target_type', 'item').eq('type', 'favorite'),
    supabase.from('interactions').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id).eq('type', 'like'),
  ])

  const { data: favs } = await supabase.from('interactions').select('target_id').eq('user_id', user.id).eq('target_type', 'item').eq('type', 'favorite')

  return {
    comments: cRes.count || 0,
    favorites: fRes.count || 0,
    likes: lRes.count || 0,
    favoriteIds: (favs || []).map(r => r.target_id),
  }
}

/** 从云端拉取收藏 */
export async function fetchMyFavorites(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await throwIfError(
    await supabase.from('interactions')
      .select('target_id')
      .eq('user_id', user.id)
      .eq('target_type', 'item')
      .eq('type', 'favorite')
  )
  return (data || []).map(r => r.target_id)
}
