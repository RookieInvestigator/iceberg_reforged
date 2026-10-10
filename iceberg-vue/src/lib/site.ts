// 站点权威域名（唯一来源：site.config.json）—— canonical / og:url / og:image / JSON-LD /
// sitemap / robots 全从它派生，换域名只改配置文件一处。
import cfg from '../../site.config.json'

/** 权威 origin，无尾斜杠 */
export const SITE_ORIGIN: string = String(cfg.origin).replace(/\/+$/, '')

/** 权威域名的显示文本（去协议） */
export const SITE_HOST: string = SITE_ORIGIN.replace(/^https?:\/\//, '')

/** 本项目自己的部署主机名（权威域名 / CF Pages 默认域名 / 本地开发） */
export const PROJECT_HOSTS: readonly string[] = cfg.projectHosts.map((h) => h.toLowerCase())

/** 是否本项目部署（含子域）；否则视为别人的副本，前端会提示数据可能落后 */
export function isProjectHost(hostname: string = typeof location !== 'undefined' ? location.hostname : ''): boolean {
  const host = hostname.toLowerCase().replace(/:\d+$/, '')
  if (!host) return false
  return PROJECT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

/** 路由 path → 绝对 canonical URL（`/` 保留尾斜杠） */
export function canonicalUrl(fullPath: string): string {
  const p = fullPath.startsWith('/') ? fullPath : `/${fullPath}`
  return SITE_ORIGIN + p
}
