import { describe, expect, it } from 'vitest'
import { floatOffsetFor } from './floatOffset'

describe('floatOffsetFor', () => {
  it('同 id 输出稳定', () => {
    expect(floatOffsetFor('87fbcd52')).toEqual(floatOffsetFor('87fbcd52'))
  })
  it('落在旧逻辑真实区间内（有符号哈希：tx ∈ [-4.5, 1.5)，ty ∈ [-9, 3)，两位小数）', () => {
    for (const id of ['87fbcd52', 'be29bf68', 'a', '']) {
      const { x, y } = floatOffsetFor(id)
      const nx = Number(x)
      const ny = Number(y)
      expect(nx >= -4.5 && nx < 1.5).toBe(true)
      expect(ny >= -9 && ny < 3).toBe(true)
      expect(x).toMatch(/^-?\d+\.\d{2}$/)
      expect(y).toMatch(/^-?\d+\.\d{2}$/)
    }
  })
  it('不同 id 大概率不同', () => {
    const outs = new Set(['87fbcd52', 'be29bf68', 'ce907464'].map((id) => JSON.stringify(floatOffsetFor(id))))
    expect(outs.size).toBeGreaterThan(1)
  })
})
