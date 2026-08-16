import { describe, it, expect } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'
import { redirectGuard } from './redirectGuard'

// P1-13：?r= 深链守卫逻辑（router.beforeEach 直接消费）
function fakeTo(partial: Partial<RouteLocationNormalized>) {
  return {
    path: '/',
    query: {},
    hash: '',
    ...partial,
  } as RouteLocationNormalized
}

describe('redirectGuard', () => {
  it('无 r 参数时放行', () => {
    expect(redirectGuard(fakeTo({ query: { x: '1' } }))).toBe(true)
  })

  it('有效 r：还原 path + query + hash 并 replace', () => {
    const result = redirectGuard(fakeTo({ query: { r: '/features/abc?x=1#sec' } }))
    expect(result).toEqual({
      path: '/features/abc',
      query: { x: '1' },
      hash: 'sec',
      replace: true,
    })
  })

  it('r 为数组时取第一个值', () => {
    const result = redirectGuard(fakeTo({ query: { r: ['/home', '/other'] } }))
    expect(result).toMatchObject({ path: '/home' })
  })

  it('非法 r：仅移除 r，停留在当前路径不循环', () => {
    const result = redirectGuard(fakeTo({ path: '/not-found-page', query: { r: 'bad%zz' } }))
    expect(result).toEqual({ path: '/not-found-page', query: {}, hash: '', replace: true })
  })

  it('还原后的跳转不带 r（不会二次进入守卫）', () => {
    const result = redirectGuard(fakeTo({ query: { r: '/' } }))
    expect(result).toMatchObject({ path: '/' })
    expect((result as { query?: Record<string, string> }).query?.r).toBeUndefined()
  })
})
