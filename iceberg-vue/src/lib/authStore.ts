import { atom } from 'nanostores'
import { supabase, getSession, onAuthChange } from './supabase'
import { user, isSupabaseReady } from './userState'
import { reportError } from './report'

// P1-10: user atom 与 UserProfile 迁移至轻量 userState（首屏可安全读取）
export { user } from './userState'
export type { UserProfile } from './userState'

/** 根据邮箱哈希生成稳定的色相 (0-360) */
function hueFromEmail(email: string): number {
  let h = 0
  for (let i = 0; i < email.length; i++) h = ((h << 5) - h + email.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

/** P1-15: 用 FNV-1a 从邮箱派生 8 位 hex 种子（与 GeoAvatar.vue 哈希风格一致）。
 *  旧实现 `hue * 37 % 99999999` 只有 360 种取值，头像多样性严重不足。 */
function seedFromEmail(email: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export const session = atom<any>(null)

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
    seed = seedFromEmail(email)
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

/**
 * F13：同步请求排队（promise 链）而非布尔锁丢弃 —— 多次触发（getSession 与
 * onAuthChange(INITIAL_SESSION) 并发）串行执行，仍避免并发撞 PK 23505。
 */
let syncQueue: Promise<void> = Promise.resolve()
export function syncFavoritesWithCloud() {
  if (!isSupabaseReady()) return Promise.resolve()
  syncQueue = syncQueue.then(runFavoritesSync).catch((e) => {
    reportError('auth', e, { op: 'favorites-sync' })
  })
  // 返回队列 promise，便于调用方/测试等待完成
  return syncQueue
}

/**
 * 收藏同步冲突策略（本地优先 + 初始化护栏）：
 * 1. 显示用并集：本地 ∪ 云端立即写入 favorites atom —— 展示不丢任何一边的收藏。
 * 2. 本地非空 → 双向 diff 同步（syncFavorites：本地有云端无 → 插入；云端有本地无 → 删除，
 *    登出期间的取消收藏在下次登录时传播到云端）。同步**成功**后才把显示校正为本地权威集；
 *    同步抛错（F11 后网络/RLS 失败会抛出）时显示保持并集，不覆盖合并结果。
 * 3. 本地为空（新设备/首次登录）→ 视为「初始化」，仅合并云端、不传播删除，
 *    避免把用户云端收藏清空（取舍：登出期间删光本地全部收藏的场景不传播删除，避免误删）。
 * 4. tombstone/updated_at 需要数据库 schema 支持，当前以「本地优先 + 同步成功才校正显示」近似。
 */
async function runFavoritesSync() {
  const [{ fetchMyFavorites, syncFavorites }, { favorites }] = await Promise.all([
    import('./supabaseData'),
    import('./settingsStore'),
  ])
  let local: string[] = []
  try { local = JSON.parse(localStorage.getItem('iceberg-favorites') || '[]') } catch {}
  const cloud = await fetchMyFavorites()
  // 显示用并集
  const merged = [...new Set([...local, ...cloud])].filter(Boolean)
  favorites.set(merged)
  // 本地非空 → 双向 diff 同步（传播删除）；本地为空 → 仅展示云端，不删除
  if (local.length > 0) {
    await syncFavorites(local)
    favorites.set(local)
  }
}

// ==========================================
// 密码注册
// ==========================================
export async function signUp(displayName: string, email: string, password: string) {
  // P0-4: 未配置 Supabase 时优雅返回错误，避免对 undefined 取属性抛 TypeError
  if (!isSupabaseReady()) return { error: '登录服务未配置' }
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
  if (!isSupabaseReady()) return { error: '登录服务未配置' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return { error: error?.message || null }
}

// ==========================================
// Magic link 登录（备选）
// ==========================================
export async function signInWithOtp(email: string) {
  if (!isSupabaseReady()) return { error: '登录服务未配置' }
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
  if (!isSupabaseReady()) return { error: '登录服务未配置' }
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
  try {
    if (isSupabaseReady()) await supabase.auth.signOut()
  } catch {
    // P1-20: onAuthChange 回调可能因网络异常等不触发，本地状态必须直接清理，避免残留
  } finally {
    user.set(null)
    session.set(null)
  }
}
