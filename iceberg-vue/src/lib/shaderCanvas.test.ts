import { describe, expect, it } from 'vitest'
import { computeBackingSize, uniformValuesEqual } from './shaderCanvas'

describe('computeBackingSize', () => {
  it('按 dpr 上限 2 与 resolutionScale 裁剪生成渲染缓冲尺寸', () => {
    const res = computeBackingSize(1200, 800, 3, 0.5, 1440)
    expect(res.width).toBe(1200)
    expect(res.height).toBe(800)
    expect(res.actualRatio).toBeCloseTo(1, 5)
  })

  it('超过 maxBacking 时等比缩放且保持长宽比', () => {
    const res = computeBackingSize(2000, 1000, 2, 1, 1440)
    expect(res.width).toBe(1440)
    expect(res.height).toBe(720)
    expect(res.actualRatio).toBeCloseTo(0.72, 5)
  })

  it('极小视口或低分辨率比例兜底为至少 1x1 像素', () => {
    const res = computeBackingSize(0, 0, 1, 0.01, 1440)
    expect(res.width).toBe(1)
    expect(res.height).toBe(1)
    expect(res.actualRatio).toBe(1)
  })
})

describe('uniformValuesEqual', () => {
  it('标量与 NaN 使用 Object.is 精确比较', () => {
    expect(uniformValuesEqual(0.5, 0.5)).toBe(true)
    expect(uniformValuesEqual(0.5, 0.6)).toBe(false)
    expect(uniformValuesEqual(true, true)).toBe(true)
    expect(uniformValuesEqual(true, false)).toBe(false)
    expect(uniformValuesEqual(NaN, NaN)).toBe(true)
  })

  it('浅层数组逐项比较，避免 u_colors 未变时重复上传', () => {
    expect(uniformValuesEqual(['#001220', '#ff791a'], ['#001220', '#ff791a'])).toBe(true)
    expect(uniformValuesEqual(['#001220', '#ff791a'], ['#001220', '#00a8e8'])).toBe(false)
    expect(uniformValuesEqual(['#001220'], ['#001220', '#ff791a'])).toBe(false)
    expect(uniformValuesEqual(['#001220'], '#001220')).toBe(false)
  })
})
