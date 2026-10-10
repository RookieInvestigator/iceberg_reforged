import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CSP 双下发点一致性守卫：index.html 的 <meta http-equiv> ↔ public/_headers。
 *
 * 为什么要守：全站 CSP 写了两份（meta 覆盖所有部署形态，_headers 只在 CF Pages 生效，
 * 且是唯一能下发 frame-ancestors 的位置）。frame-ancestors 是两者唯一允许的差异
 * —— 其余指令若只改一处，线上实际生效的策略（浏览器取交集）会与源码里那份悄悄分叉，
 * 症状是某条白名单莫名失效（例：加了 script-src 却没同步 connect-src，上报被拦但页面不报错）。
 *
 * CSP 还承载 Cloudflare Web Analytics 手工片段的白名单：
 * script-src 放行静态 beacon、connect-src 放行 cloudflareinsights.com 上报端点
 * （片段由 vite.config.ts 的 cf-web-analytics 插件在构建期注入，见第二个用例）。
 *
 * 测试文件位于 src/lib/ 只是因为 vitest include 限定 `src/**\/*.test.ts`；
 * 断言读取的是仓库内的构建配置文本，无任何运行期副作用。
 * 路径基准用 process.cwd()（vitest root = 运行目录，npm run test 在 iceberg-vue/ 下执行）：
 * vitest 里 import.meta.url 不是 file: 协议，readFileSync(new URL(…)) 会抛
 * “The URL must be of scheme file”。
 */
const readProjectFile = (rel: string): string => {
  const file = path.resolve(process.cwd(), rel)
  if (!existsSync(file)) {
    throw new Error(`找不到 ${rel} —— 请在 iceberg-vue/ 目录下运行 npm run test`)
  }
  return readFileSync(file, 'utf-8')
}

const readMetaCsp = (): string => {
  const html = readProjectFile('index.html')
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)
  if (!m) throw new Error('index.html 里找不到 CSP meta')
  return m[1]
}

const readHeadersCsp = (): string => {
  const headers = readProjectFile('public/_headers')
  // _headers 首行 `/*` 区块下的 Content-Security-Policy（值到行尾）
  const m = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)
  if (!m) throw new Error('public/_headers 里找不到 Content-Security-Policy')
  return m[1].trim()
}

/** 拆成 指令 → 值列表（值排序，避免顺序差异被误判为不一致） */
const parseCsp = (csp: string): Map<string, string[]> =>
  new Map(
    csp
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const [name, ...values] = d.split(/\s+/)
        return [name, values.sort()] as const
      }),
  )

describe('CSP 双下发点', () => {
  it('除 frame-ancestors（meta 不支持）外，指令逐条一致', () => {
    const meta = parseCsp(readMetaCsp())
    const headers = parseCsp(readHeadersCsp())

    expect(meta.has('frame-ancestors')).toBe(false) // meta 里写了也会被浏览器忽略
    expect(headers.get('frame-ancestors')).toEqual(["'none'"])

    headers.delete('frame-ancestors') // 唯一的合法差异
    expect(Object.fromEntries(headers)).toEqual(Object.fromEntries(meta))
  })

  it('放行 Cloudflare Web Analytics 手工片段所需的两个来源', () => {
    for (const csp of [readMetaCsp(), readHeadersCsp()]) {
      const directives = parseCsp(csp)
      expect(directives.get('script-src')).toContain('https://static.cloudflareinsights.com/beacon.min.js')
      expect(directives.get('connect-src')).toContain('https://cloudflareinsights.com')
      // default-src 是白名单兜底，别被 beacon 放行顺手改宽
      expect(directives.get('default-src')).toEqual(["'self'"])
    }
  })
})
