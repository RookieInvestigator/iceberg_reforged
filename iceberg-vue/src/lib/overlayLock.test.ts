import { beforeEach, describe, expect, it } from 'vitest'
import { lockOverlay } from './overlayLock'

// F20 验收：任意两层 overlay 组合中，最后一层关闭前背景始终不可滚动，关闭后原样恢复
describe('overlayLock（F20 滚动锁）', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  it('单层：加锁隐藏背景滚动，释放后原样恢复（含用户自定义 overflow）', () => {
    document.body.style.overflow = 'auto'
    const unlock = lockOverlay()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    unlock()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('两层叠加：第一层释放后背景仍锁定，最后一层释放才恢复', () => {
    const unlock1 = lockOverlay()
    const unlock2 = lockOverlay()
    expect(document.body.style.overflow).toBe('hidden')
    unlock1()
    expect(document.body.style.overflow).toBe('hidden')
    unlock2()
    expect(document.body.style.overflow).toBe('')
  })

  it('释放顺序无关（后开先关）：同样最后一层才恢复', () => {
    const unlock1 = lockOverlay()
    const unlock2 = lockOverlay()
    unlock2()
    expect(document.body.style.overflow).toBe('hidden')
    unlock1()
    expect(document.body.style.overflow).toBe('')
  })
})
