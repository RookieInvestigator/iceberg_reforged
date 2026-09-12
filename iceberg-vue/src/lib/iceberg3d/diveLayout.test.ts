import { describe, expect, it } from 'vitest'
import {
  BERG_TIP_Y,
  BERG_TOP_RADIUS,
  DIVE_BAND_HEIGHT,
  DIVE_FLOOR_Y,
  bergRadiusAt,
  depthMeters,
  idSeed,
  nodePosition,
  tierAtY,
  tierBandY,
} from './diveLayout'

describe('diveLayout', () => {
  it('8 带等分，终止于海床', () => {
    expect(DIVE_BAND_HEIGHT).toBe(60)
    expect(DIVE_FLOOR_Y).toBe(-480)
    expect(tierBandY(0)).toBe(-30)
    expect(tierBandY(7)).toBe(-450)
    expect(tierBandY(99)).toBe(-450)
    expect(tierBandY(-3)).toBe(-30)
  })

  it('同 id 位置稳定，不同 id 大概率不同', () => {
    expect(nodePosition('87fbcd52', 0)).toEqual(nodePosition('87fbcd52', 0))
    const a = JSON.stringify(nodePosition('87fbcd52', 0))
    const b = JSON.stringify(nodePosition('be29bf68', 0))
    expect(a).not.toBe(b)
  })

  it('节点绕冰山分布：壳内径大于锥体半径 + 余量', () => {
    const shallow = nodePosition('87fbcd52', 0)
    const deep = nodePosition('87fbcd52', 7)
    expect(Math.abs(shallow.y - tierBandY(0))).toBeLessThanOrEqual(DIVE_BAND_HEIGHT * 0.35 + 1)
    expect(Math.abs(deep.y - tierBandY(7))).toBeLessThanOrEqual(DIVE_BAND_HEIGHT * 0.35 + 1)
    for (const [p, t] of [[shallow, 0], [deep, 7]] as const) {
      const r = Math.hypot(p.x, p.z)
      expect(r).toBeGreaterThan(bergRadiusAt(p.y) + 10)
      expect(r).toBeLessThanOrEqual(335)
    }
  })

  it('冰山锥体水面宽、尖端收零', () => {
    expect(bergRadiusAt(0)).toBe(BERG_TOP_RADIUS)
    expect(bergRadiusAt(BERG_TIP_Y)).toBe(0)
    expect(bergRadiusAt(-9999)).toBe(0)
  })

  it('深度与层级互逆', () => {
    expect(depthMeters(0)).toBe(0)
    expect(depthMeters(-100)).toBe(200)
    expect(tierAtY(10)).toBe(0)
    expect(tierAtY(-30)).toBe(0)
    expect(tierAtY(-90)).toBe(1)
    expect(tierAtY(-9999)).toBe(7)
  })

  it('idSeed 为无符号 32 位', () => {
    const s = idSeed('be29bf68')
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(4294967296)
  })
})
