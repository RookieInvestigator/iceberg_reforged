/**
 * 模块级滚动锁管理器（audit F20）。
 *
 * BaseModal / MobileSheet 等 overlay 组件用 `lockOverlay()` 加锁：
 * - 保存加锁前的原始 overflow 值，关闭后**原样恢复**（含用户自定义样式）
 * - token 管理：任意层数叠加时，只有最后一层释放才恢复背景滚动
 * - 每个组件实例持有一个 token，卸载时自动释放
 *
 * perf：overflow:hidden 会移除滚动条 → 视口宽度变化 → 整页 reflow（冰山页
 * 1400 词条全量重排，弹窗打开瞬间的卡顿主因之一）。加锁时给 body 补偿
 * 等宽 padding-right，视口宽度不变，reflow 范围缩到最小。
 */
let tokens = new Set<symbol>()
let locked = false
let originalOverflow = { body: '', html: '' }
let originalPaddingRight = ''

export function lockOverlay(): () => void {
  const token = Symbol('overlay-lock')
  tokens.add(token)

  if (!locked) {
    locked = true
    const body = document.body
    const html = document.documentElement
    originalOverflow = { body: body.style.overflow, html: html.style.overflow }
    originalPaddingRight = body.style.paddingRight
    // 经典滚动条宽度补偿：innerWidth 与文档 clientWidth 之差即滚动条占位
    const scrollbarWidth = window.innerWidth - html.clientWidth
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
  }

  return () => {
    tokens.delete(token)
    if (tokens.size === 0 && locked) {
      locked = false
      document.body.style.overflow = originalOverflow.body
      document.documentElement.style.overflow = originalOverflow.html
      document.body.style.paddingRight = originalPaddingRight
    }
  }
}
