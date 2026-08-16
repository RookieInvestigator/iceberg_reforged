import { describe, it, expect } from 'vitest'
import { parseRedirectParam } from './deepLink'

// P1-13：?r= 深链参数还原（404.html 的 encodeURIComponent(path + search + hash) 格式）
describe('parseRedirectParam', () => {
  it('还原纯路径', () => {
    expect(parseRedirectParam('/features')).toEqual({ path: '/features', query: {}, hash: '' })
  })

  it('还原路径 + query', () => {
    expect(parseRedirectParam('/features/slug?x=1&y=2')).toEqual({
      path: '/features/slug',
      query: { x: '1', y: '2' },
      hash: '',
    })
  })

  it('还原路径 + query + hash', () => {
    expect(parseRedirectParam('/3d?item=abc#panel')).toEqual({
      path: '/3d',
      query: { item: 'abc' },
      hash: 'panel',
    })
  })

  it('空路径部分回退到首页（仅 hash 的链接）', () => {
    expect(parseRedirectParam('#top')).toEqual({ path: '/', query: {}, hash: 'top' })
  })

  it('二次百分号解码（路由器已先解一次 query）', () => {
    // 原始 URL 为 /中文 → 404 读到 %E4%B8%AD → encodeURIComponent 后是 %25E4%25B8%25AD
    // → 路由解析 query 后得到 %E4%B8%AD → 此处再解码为中文路径
    expect(parseRedirectParam('%E4%B8%AD%E6%96%87')?.path).toBe('/中文')
  })

  it('非法编码返回 null（守卫仅清理 r 参数）', () => {
    expect(parseRedirectParam('bad%zz')).toBeNull()
  })

  it('空值返回 null', () => {
    expect(parseRedirectParam('')).toBeNull()
  })
})
