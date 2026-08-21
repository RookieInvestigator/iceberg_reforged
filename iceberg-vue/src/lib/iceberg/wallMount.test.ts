import { describe, expect, it } from 'vitest'
import { initialMountCount, MOUNT_INITIAL_TIERS, nextMountCount } from './wallMount'

describe('initialMountCount（首屏挂载数）', () => {
  it('viewportOnly：前 N 层（2），其余逐帧补齐', () => {
    expect(initialMountCount(8, true)).toBe(MOUNT_INITIAL_TIERS)
    expect(initialMountCount(2, true)).toBe(2)
  })

  it('viewportOnly 且层级不足：全量', () => {
    expect(initialMountCount(1, true)).toBe(1)
    expect(initialMountCount(0, true)).toBe(0)
  })

  it('需要完整墙（深链/筛选取向）：全量', () => {
    expect(initialMountCount(8, false)).toBe(8)
    expect(initialMountCount(0, false)).toBe(0)
  })
})

describe('nextMountCount（逐帧补齐）', () => {
  it('逐层递增直至全量', () => {
    expect(nextMountCount(2, 8)).toBe(3)
    expect(nextMountCount(7, 8)).toBe(8)
  })

  it('已全量：幂等封顶（不再增长）', () => {
    expect(nextMountCount(8, 8)).toBe(8)
    expect(nextMountCount(9, 8)).toBe(8)
  })
})