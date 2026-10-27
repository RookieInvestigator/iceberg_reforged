import { describe, expect, it } from 'vitest'
import { resolveFocusComposition } from './cameraFlight'

describe('resolveFocusComposition', () => {
  it('移动端底部面板遮挡时，目标上移到可见区中心（偏移 = 遮挡高度 / 2）', () => {
    // 390×844 竖屏，详情面板 70vh ≈ 590.8px
    const covered = 844 * 0.7
    const { x, y } = resolveFocusComposition(390, 844, covered)
    expect(x).toBe(0)
    expect(y).toBeCloseTo(covered / 2, 5)
    // 目标此时落在 (844 - covered) / 2 ≈ 126.6px，即面板上方那条可见区的正中
    expect(844 / 2 - y).toBeCloseTo((844 - covered) / 2, 5)
  })

  it('桌面侧边面板不做竖直偏移，横向推离中心并封顶 76px', () => {
    expect(resolveFocusComposition(1440, 900, 0)).toEqual({ x: 76, y: 0 })
    expect(resolveFocusComposition(1000, 800, 0)).toEqual({ x: 70, y: 0 })
  })

  it('窄屏但无底部遮挡时不偏移', () => {
    expect(resolveFocusComposition(390, 844, 0)).toEqual({ x: 0, y: 0 })
    expect(resolveFocusComposition(640, 844, 0)).toEqual({ x: 0, y: 0 })
  })

  it('遮挡高度被画布高度钳制，不会产生负偏移', () => {
    const { x, y } = resolveFocusComposition(390, 600, 900)
    expect(x).toBe(0)
    expect(y).toBe(300)
  })

  it('小遮挡也按一半上移（面板未完全展开时同样生效）', () => {
    expect(resolveFocusComposition(390, 800, 120)).toEqual({ x: 0, y: 60 })
  })
})
