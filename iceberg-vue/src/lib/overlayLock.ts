/**
 * 模块级滚动锁管理器（audit F20）。
 *
 * BaseModal / MobileSheet 等 overlay 组件用 `lockOverlay()` 加锁：
 * - 保存加锁前的原始 overflow 值，关闭后**原样恢复**（含用户自定义样式）
 * - token 管理：任意层数叠加时，只有最后一层释放才恢复背景滚动
 * - 每个组件实例持有一个 token，卸载时自动释放
 */
let tokens = new Set<symbol>()
let locked = false
let originalOverflow = { body: '', html: '' }

export function lockOverlay(): () => void {
  const token = Symbol('overlay-lock')
  tokens.add(token)

  if (!locked) {
    locked = true
    const body = document.body
    const html = document.documentElement
    originalOverflow = { body: body.style.overflow, html: html.style.overflow }
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
  }

  return () => {
    tokens.delete(token)
    if (tokens.size === 0 && locked) {
      locked = false
      document.body.style.overflow = originalOverflow.body
      document.documentElement.style.overflow = originalOverflow.html
    }
  }
}
