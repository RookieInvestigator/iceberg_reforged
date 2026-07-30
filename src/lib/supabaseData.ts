import { supabase } from './supabase'

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

/** 获取某词条的评论列表 */
export async function fetchComments(itemId: string, userId?: string) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, user_id, item_id, content, created_at, anon_name')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.warn('[fetchComments]', error); return [] }
  if (!data) return []

  const ids = data.map(c => c.id)
  const rows: CommentRow[] = []

  // 批量取登录用户的显示名
  let nameMap = new Map<string, string>()
  try {
    const uids = [...new Set(data.filter(c => c.user_id).map(c => c.user_id!))]
    if (uids.length) {
      const { data: names } = await supabase.rpc('batch_user_display', { uids })
      if (names) for (const n of names as any[]) nameMap.set(n.user_id, n.display_name)
    }
  } catch { /* RPC 不可用时 fallback */ }

  // 批量取点赞数（单次查询 + 客户端分组，消除 N+1）
  let likeCounts: { id: number; count: number }[] = []
  try {
    const { data: allLikes } = await supabase
      .from('interactions')
      .select('target_id')
      .eq('target_type', 'comment')
      .eq('type', 'like')
      .in('target_id', ids.map(String))
    if (allLikes) {
      const countMap = new Map<string, number>()
      for (const l of allLikes as any[]) {
        const tid = l.target_id
        countMap.set(tid, (countMap.get(tid) || 0) + 1)
      }
      likeCounts = ids.map(id => ({ id, count: countMap.get(String(id)) || 0 }))
    } else {
      likeCounts = ids.map(id => ({ id, count: 0 }))
    }
  } catch {
    likeCounts = ids.map(id => ({ id, count: 0 }))
  }

  // 当前用户的点赞状态
  let userLiked = new Set<number>()
  if (userId) {
    const { data: likes } = await supabase
      .from('interactions')
      .select('target_id')
      .eq('user_id', userId)
      .eq('target_type', 'comment')
      .eq('type', 'like')
      .in('target_id', ids.map(String))
    if (likes) userLiked = new Set(likes.map(l => Number(l.target_id)))
  }

  for (const c of data) {
    rows.push({
      ...c,
      author_name: c.user_id
        ? (nameMap.get(c.user_id) || c.user_id.slice(0, 8))
        : (c.anon_name || '匿名用户'),
      like_count: likeCounts.find(l => l.id === c.id)?.count || 0,
      user_liked: userLiked.has(c.id),
    })
  }
  return rows
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
}

// ==========================================
// 互动（点赞 + 收藏）
// ==========================================
export type InteractionType = 'like' | 'favorite'

/** 获取某目标的互动计数 */
export async function fetchInteractionCount(targetType: 'item' | 'comment', targetId: string, type: InteractionType) {
  const { count, error } = await supabase
    .from('interactions')
    .select('*', { count: 'exact', head: true })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('type', type)
  if (error) { console.warn('[fetchInteractionCount]', error); return 0 }
  return count || 0
}

/** 切换互动状态（点赞/取消，收藏/取消） */
export async function toggleInteraction(targetType: 'item' | 'comment', targetId: string, type: InteractionType) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('请先登录')

  const { data: existing } = await supabase
    .from('interactions')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('type', type)
    .maybeSingle()

  if (existing) {
    await supabase.from('interactions').delete()
      .eq('user_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('type', type)
    return false // 已取消
  } else {
    await supabase.from('interactions').insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      type,
    })
    return true // 已设置
  }
}

/** 获取当前用户对一批目标的互动状态 */
export async function fetchMyInteractions(targetType: 'item' | 'comment', targetIds: string[], type: InteractionType) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Set<string>()
  const { data } = await supabase
    .from('interactions')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('type', type)
    .in('target_id', targetIds)
  return new Set((data || []).map(r => r.target_id))
}

/** 同步本地收藏到云端 */
export async function syncFavorites(itemIds: string[]) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // 获取云端已有收藏
  const { data: existing } = await supabase
    .from('interactions')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', 'item')
    .eq('type', 'favorite')

  const existingIds = new Set((existing || []).map(r => r.target_id))
  const localIds = new Set(itemIds)

  // 新增
  const toAdd = [...localIds].filter(id => id && !existingIds.has(id))
  if (toAdd.length) {
    await supabase.from('interactions').insert(
      toAdd.map(id => ({ user_id: user.id, target_type: 'item', target_id: id, type: 'favorite' }))
    ).select()
  }
  // 删除
  const toRemove = [...existingIds].filter(id => !localIds.has(id))
  if (toRemove.length) {
    await supabase.from('interactions').delete()
      .eq('user_id', user.id)
      .eq('target_type', 'item')
      .eq('type', 'favorite')
      .in('target_id', toRemove)
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
  const { data } = await supabase
    .from('interactions')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('target_type', 'item')
    .eq('type', 'favorite')
  return (data || []).map(r => r.target_id)
}
