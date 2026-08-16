import { atom } from 'nanostores'

export interface UserProfile {
  id: string
  email: string | undefined
  displayName: string
  avatarColor: string
  avatarSeed: string    // 随机种子，与邮箱脱钩
}

/**
 * P1-10: 轻量用户态模块 —— 只依赖 nanostores 与环境变量，不引入 Supabase SDK，
 * 供首屏组件（Header 等）读取登录态；重逻辑（会话恢复/onAuthChange）留在 authStore，
 * 由空闲预载触发，从而把 @supabase/supabase-js 移出首屏关键路径。
 */

/** 当前登录用户（响应式），null = 未登录 */
export const user = atom<UserProfile | null>(null)

/** 检查 Supabase 是否已配置（仅读环境变量，无 SDK 依赖） */
export function isSupabaseReady(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}
