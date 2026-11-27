/**
 * 最低限度线上诊断（audit F08）。
 *
 * - 生产构建 esbuild 仅 drop debug 日志（console.log/info/debug），保留 console.error，
 *   本模块是生产可观察性的统一出口。
 * - 记录版本、路由与上下文；**不采集内容正文**（词条描述/评论/链接等一律不上报）。
 * - 扩展点：未来接入远端上报时在此替换实现，调用方无需改动。
 */
import pkg from '../../package.json'

export interface ReportMeta {
  [key: string]: string | number | boolean | undefined
}

export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message ? `${err.name}: ${err.message}` : err.name
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>
    const code = typeof rec.code === 'string' || typeof rec.code === 'number' ? String(rec.code).trim() : ''
    const status = typeof rec.status === 'number' && rec.status > 0 ? rec.status : null
    const msg = typeof rec.message === 'string' ? rec.message.trim() : ''
    const details = typeof rec.details === 'string' ? rec.details.trim() : ''
    const hint = typeof rec.hint === 'string' ? rec.hint.trim() : ''
    const prefix = code ? `[${code}] ` : status ? `[HTTP ${status}] ` : ''
    const primary = msg || details || hint
    if (primary) {
      const extra = details && details !== primary ? ` (${details})` : ''
      return `${prefix}${primary}${extra}`
    }
    try {
      return JSON.stringify(rec)
    } catch {
      return Object.prototype.toString.call(err)
    }
  }
  return String(err)
}

export function reportError(context: string, err: unknown, extra?: ReportMeta): void {
  const meta: ReportMeta = {
    version: pkg.version,
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
    ...extra,
  }
  console.error(`[iceberg:${context}]`, formatError(err), meta)
}
