import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase 未配置：请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
    _client = createClient(url, key)
  }
  return _client
}

/** 懒加载 Supabase 客户端，未配置时返回 null */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    try { return Reflect.get(getClient(), prop) }
    catch { return undefined }
  },
  apply(_, _thisArg, args) {
    try { return Reflect.apply(getClient() as any, _thisArg, args) }
    catch { return undefined }
  },
})

/** 检查 Supabase 是否已配置 */
export function isSupabaseReady(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

/** 当前登录用户（响应式），null = 未登录 */
export function getSession() {
  if (!isSupabaseReady()) return Promise.resolve({ data: { session: null } })
  return getClient().auth.getSession()
}

export function onAuthChange(cb: (session: any) => void) {
  if (!isSupabaseReady()) return { data: { subscription: { unsubscribe() {} } } }
  return getClient().auth.onAuthStateChange((_event, session) => cb(session))
}
