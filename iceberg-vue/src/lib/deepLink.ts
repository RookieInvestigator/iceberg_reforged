/**
 * ?r= 深链消费（P1-13）。
 *
 * 404.html 在部署层 404 时执行：
 *   location.replace(root + '?r=' + encodeURIComponent(path + location.search + location.hash))
 * 本模块把该参数还原为 router 可用的目标路由。
 * 注意：Vue Router 解析 URL 时已对 query 做了一次 percent 解码，
 * 因此这里需要再次 decodeURIComponent 才能还原 404.html 的 encodeURIComponent。
 */
export interface RedirectTarget {
  path: string
  query: Record<string, string>
  hash: string
}

export function parseRedirectParam(raw: string): RedirectTarget | null {
  if (!raw) return null

  let rest = ''
  try {
    rest = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!rest) return null

  let hash = ''
  const hashIdx = rest.indexOf('#')
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx + 1)
    rest = rest.slice(0, hashIdx)
  }

  const query: Record<string, string> = {}
  let path = rest
  const qIdx = rest.indexOf('?')
  if (qIdx >= 0) {
    path = rest.slice(0, qIdx)
    const qs = rest.slice(qIdx + 1)
    new URLSearchParams(qs).forEach((v, k) => {
      query[k] = v
    })
  }

  if (!path.startsWith('/')) path = '/' + path
  return { path: path || '/', query, hash }
}
