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

export function reportError(context: string, err: unknown, extra?: ReportMeta): void {
  const meta: ReportMeta = {
    version: pkg.version,
    route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
    ...extra,
  }
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  console.error(`[iceberg:${context}]`, message, meta)
}
