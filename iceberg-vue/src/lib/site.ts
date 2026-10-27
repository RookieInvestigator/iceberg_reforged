// 站点站点域名（唯一来源：site.config.json）—— canonical / og:url / og:image / JSON-LD /
// sitemap / robots 全从它派生，换域名只改配置文件一处。
import cfg from '../../site.config.json'

/** 站点 origin，无尾斜杠 */
export const SITE_ORIGIN: string = String(cfg.origin).replace(/\/+$/, '')

/** 站点域名的显示文本（去协议） */
export const SITE_HOST: string = SITE_ORIGIN.replace(/^https?:\/\//, '')

/** 构建期注入：本地数据内容指纹（不含构建时间戳，见 vite.config.ts 的 __DATA_HASH__） */
declare const __DATA_HASH__: string
export const LOCAL_DATA_HASH: string = typeof __DATA_HASH__ !== 'undefined' ? __DATA_HASH__ : ''

/** 路由 path → 绝对 canonical URL（`/` 保留尾斜杠） */
export function canonicalUrl(fullPath: string): string {
  const p = fullPath.startsWith('/') ? fullPath : `/${fullPath}`
  return SITE_ORIGIN + p
}

/** 当前是否就在站点域名上 —— 只决定提示里要不要放外链，不做任何门禁 */
export function isOnCanonicalOrigin(): boolean {
  if (typeof location === 'undefined') return false
  return location.origin.replace(/\/+$/, '') === SITE_ORIGIN
}

export interface RemoteVersion {
  /** 站点构建时间（秒级 Unix），仅用于展示 */
  generatedAt: number
  /** 站点数据内容指纹 */
  dataHash: string
  /** 站点词条数 */
  total: number
}

const CACHE_KEY = 'iceberg-remote-version'
const CACHE_TTL_MS = 6 * 3600_000

function readCache(): RemoteVersion | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw) as { at: number; data: RemoteVersion }
    return Date.now() - at < CACHE_TTL_MS ? data : null
  } catch {
    return null
  }
}

/** 取站点点的数据版本（构建产物 version.json）；取不到一律返回 null，不抛错 */
export async function fetchRemoteVersion(timeoutMs = 5000): Promise<RemoteVersion | null> {
  const cached = readCache()
  if (cached) return cached
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    const res = await fetch(`${SITE_ORIGIN}/version.json`, { signal: ctl.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (!res.ok) return null
    const raw = (await res.json()) as Partial<RemoteVersion>
    if (typeof raw.dataHash !== 'string' || !raw.dataHash) return null
    const data: RemoteVersion = {
      generatedAt: Number(raw.generatedAt) || 0,
      dataHash: raw.dataHash,
      total: Number(raw.total) || 0,
    }
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
    } catch { /* 隐私模式下写不了就算了 */ }
    return data
  } catch {
    return null
  }
}

/**
 * 远端是否真的有新数据 —— 只比内容指纹，**不看时间**。
 * 数据可能几十天不变（上游不更新），按天数判会一直误报；指纹相同就永远不提示。
 */
export function hasNewerData(remote: RemoteVersion | null, localHash: string = LOCAL_DATA_HASH): boolean {
  if (!remote?.dataHash || !localHash) return false
  return remote.dataHash !== localHash
}
