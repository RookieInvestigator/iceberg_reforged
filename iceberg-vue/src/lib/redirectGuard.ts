import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { parseRedirectParam } from './deepLink'

/**
 * P1-13：?r= 深链守卫。
 * 消费 404.html 重定向携带的 ?r=（原始 path + search + hash 的一次 encodeURIComponent），
 * 还原为目标路由并 replace 跳转；r 参数同时从地址栏移除，避免二次匹配。
 * 非法/空 r 仅清理参数、停留在当前路径，不产生跳转循环。
 */
export function redirectGuard(to: RouteLocationNormalized): RouteLocationRaw | true {
  const raw = to.query.r
  if (raw === undefined || raw === null) return true

  const value = Array.isArray(raw) ? raw[0] ?? '' : String(raw)
  const cleanQuery = { ...to.query }
  delete cleanQuery.r

  const target = parseRedirectParam(value)
  if (!target) {
    return { path: to.path, query: cleanQuery, hash: to.hash, replace: true }
  }
  return { path: target.path, query: target.query, hash: target.hash, replace: true }
}
