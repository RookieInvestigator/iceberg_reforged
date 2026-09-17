import { supabase } from './supabase'
import { reportError } from './report'

// ==========================================
// 反馈/订正（整条预填 + 说明 note；匿名不可提交）
// ==========================================
export const FEEDBACK_FIELDS = ['title', 'desc', 'link', 'category', 'tags'] as const
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number]

export interface FeedbackChanges {
  title?: string
  desc?: string
  link?: string
  category?: string
  tags?: string[]
}

export interface FeedbackRow {
  id: number
  item_id: string
  changes: FeedbackChanges
  note: string
  user_id: string
  status: string
  applied: boolean
  created_at: string
}

/** 前端 diff：只收改过的字段（全未改返回空对象，调用方凭此判定纯反馈） */
export function diffFeedback(
  current: Record<FeedbackField, string | string[]>,
  edited: Record<FeedbackField, string | string[]>,
): FeedbackChanges {
  const out: FeedbackChanges = {}
  for (const f of FEEDBACK_FIELDS) {
    const a = current[f]
    const b = edited[f]
    const same = Array.isArray(a) || Array.isArray(b)
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b
    if (!same) (out as Record<string, unknown>)[f] = b
  }
  return out
}

/** 提交反馈（必须登录；说明必填；说明空 + 全未改拒绝） */
export async function postFeedback(itemId: string, changes: FeedbackChanges, note: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('请先登录')
  const cleanNote = note.trim()
  if (!cleanNote) throw new Error('请填写反馈说明')
  if (cleanNote.length + JSON.stringify(changes).length > 2000) throw new Error('内容过长')
  const { error } = await supabase.from('entry_feedback').insert({
    item_id: itemId,
    changes,
    note: cleanNote,
    user_id: user.id,
  })
  if (error) throw error
}

/** 本人的反馈列表（UserModal "我的反馈"；只读降级返回空） */
export async function fetchMyFeedback(): Promise<FeedbackRow[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('entry_feedback')
      .select('id, item_id, changes, note, user_id, status, applied, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100)
    if (error || !data) return []
    return data as FeedbackRow[]
  } catch (e) {
    reportError('supabase', e, { op: 'my-feedback' })
    return []
  }
}

/** 撤回本人反馈 */
export async function deleteFeedback(feedbackId: number) {
  const { error } = await supabase.from('entry_feedback').delete().eq('id', feedbackId)
  if (error) throw error
}
