import { atom } from 'nanostores'
import { supabase, isSupabaseReady, getSession, onAuthChange } from './supabase'

export interface UserProfile {
  id: string
  email: string | undefined
  displayName: string
  avatarColor: string
  avatarSeed: string    // 随机种子，与邮箱脱钩
}

/** 根据邮箱哈希生成稳定的色相 (0-360) */
function hueFromEmail(email: string): number {
  let h = 0
  for (let i = 0; i < email.length; i++) h = ((h << 5) - h + email.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

export const session = atom<any>(null)
export const user = atom<UserProfile | null>(null)

// 初始化：检查已有 session（仅当 Supabase 已配置）
if (isSupabaseReady()) {
  getSession().then(({ data }) => {
    session.set(data.session)
    if (data.session) updateUser(data.session)
  })
}

// 监听登录/登出
if (isSupabaseReady()) {
  onAuthChange((s: any) => {
    session.set(s)
    if (s) updateUser(s)
    else user.set(null)
  })
}

async function updateUser(s: any) {
  const meta = s.user?.user_metadata || {}
  const email = s.user.email || ''
  // 旧用户没有 avatar_seed：从邮箱派生确定性种子，同时异步补发到云端
  let seed = meta.avatar_seed
  if (!seed) {
    seed = String(hueFromEmail(email) * 37 % 99999999).padStart(8, '0')
    meta.avatar_seed = seed
    supabase.auth.updateUser({ data: { avatar_seed: seed } }).catch(e => console.warn('avatar_seed 保存失败:', e))
  }
  user.set({
    id: s.user.id,
    email,
    displayName: meta.display_name || email.split('@')[0] || '用户',
    avatarColor: meta.avatar_color || String(hueFromEmail(email)),
    avatarSeed: meta.avatar_seed || email,
  })
  // 登录后同步收藏
  syncFavoritesWithCloud()
}

/** 云端 + localStorage 收藏双向合并 */
export async function syncFavoritesWithCloud() {
  try {
    const [{ fetchMyFavorites, syncFavorites }, { favorites }] = await Promise.all([
      import('./supabaseData'),
      import('./settingsStore'),
    ])
    let local: string[] = []
    try { local = JSON.parse(localStorage.getItem('iceberg-favorites') || '[]') } catch {}
    const cloud = await fetchMyFavorites()
    const merged = [...new Set([...local, ...cloud])].filter(Boolean)
    favorites.set(merged)
    await syncFavorites(merged)
  } catch (e) {
    console.error('收藏同步失败:', e)
  }
}

// ==========================================
// 密码注册
// ==========================================
export async function signUp(displayName: string, email: string, password: string) {
  if (password.length < 8) return { error: new Error('密码至少 8 位').message }
  const hue = hueFromEmail(email)
  // 随机 8 位 hex 种子，与邮箱完全脱钩
  const seed = Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        avatar_color: String(hue),
        avatar_seed: seed,
      },
    },
  })
  return { error: error?.message || null }
}

// ==========================================
// 密码登录
// ==========================================
export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message || null }
}

// ==========================================
// Magic link 登录（备选）
// ==========================================
export async function signInWithOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
  })
  return { error: error?.message || null }
}

// ==========================================
// 修改昵称
// ==========================================
export async function updateNickname(displayName: string) {
  const { error } = await supabase.auth.updateUser({
    data: { display_name: displayName.trim() },
  })
  if (!error) {
    const cur = user.get()
    if (cur) user.set({ ...cur, displayName: displayName.trim() })
  }
  return { error: error?.message || null }
}

/** 登出 */
export async function signOut() {
  await supabase.auth.signOut()
}
