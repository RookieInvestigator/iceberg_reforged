import { describe, expect, it } from 'vitest'
import {
  NAV_HOT_ZONE,
  NAV_SCROLL_THRESHOLD,
  NAV_TOP_ZONE,
  isInNavHotZone,
  navShouldShowOnPointer,
  navShouldShowOnScroll,
  type NavScrollState,
} from './navVisibility'

function scroll(over: Partial<NavScrollState> = {}): NavScrollState {
  return {
    y: 1200,
    dy: 0,
    inHotZone: false,
    coarsePointer: false,
    forceVisible: false,
    alwaysVisible: false,
    ...over,
  }
}

describe('导航显隐规则', () => {
  it('页顶常显', () => {
    expect(navShouldShowOnScroll(scroll({ y: 0 }))).toBe('show')
    expect(navShouldShowOnScroll(scroll({ y: NAV_TOP_ZONE - 1 }))).toBe('show')
  })

  it('页顶以外按方向：上滚显、下滚隐', () => {
    expect(navShouldShowOnScroll(scroll({ dy: -20 }))).toBe('show')
    expect(navShouldShowOnScroll(scroll({ dy: 20 }))).toBe('hide')
  })

  it('阈值内保持原状（防抖）', () => {
    expect(navShouldShowOnScroll(scroll({ dy: NAV_SCROLL_THRESHOLD }))).toBe('keep')
    expect(navShouldShowOnScroll(scroll({ dy: -NAV_SCROLL_THRESHOLD }))).toBe('keep')
    expect(navShouldShowOnScroll(scroll())).toBe('keep')
  })

  it('触屏、热区、强制态都常显', () => {
    expect(navShouldShowOnScroll(scroll({ dy: 40, coarsePointer: true }))).toBe('show')
    expect(navShouldShowOnScroll(scroll({ dy: 40, inHotZone: true }))).toBe('show')
    expect(navShouldShowOnScroll(scroll({ dy: 40, forceVisible: true }))).toBe('show')
    expect(navShouldShowOnScroll(scroll({ dy: 40, alwaysVisible: true }))).toBe('show')
  })

  it('指针规则：在热区/强制态常显，否则隐藏', () => {
    expect(navShouldShowOnPointer({ inHotZone: true, coarsePointer: false, forceVisible: false, alwaysVisible: false })).toBe('show')
    expect(navShouldShowOnPointer({ inHotZone: false, coarsePointer: false, forceVisible: false, alwaysVisible: true })).toBe('show')
    expect(navShouldShowOnPointer({ inHotZone: false, coarsePointer: true, forceVisible: false, alwaysVisible: false })).toBe('show')
    expect(navShouldShowOnPointer({ inHotZone: false, coarsePointer: false, forceVisible: true, alwaysVisible: false })).toBe('show')
    expect(navShouldShowOnPointer({ inHotZone: false, coarsePointer: false, forceVisible: false, alwaysVisible: false })).toBe('hide')
  })

  it('热区判定：负值（指针未进入页面）不算热区', () => {
    expect(isInNavHotZone(-1)).toBe(false)
    expect(isInNavHotZone(0)).toBe(true)
    expect(isInNavHotZone(NAV_HOT_ZONE - 1)).toBe(true)
    expect(isInNavHotZone(NAV_HOT_ZONE)).toBe(false)
  })
})
