/**
 * 西文宽度测量。
 *
 * 直排里的西文旋转 90° 沿列流下，占用的行数 = 串宽 / 行高。
 * 按字符数估算（`len * 0.35`）误差很大 —— 短串会多留近一行空白，
 * 这就是「英文前后有大空位」的根因。改用 canvas measureText 精确测量，
 * 结果按 (字号, 文本) 缓存。
 *
 * Node 环境（单测）没有 canvas，退回按字符类别估算。
 */

let ctx: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

/** 与 CSS 里 `.c.eng` 的 font-family 保持一致 */
const ENG_FAMILY = "'Times New Roman', Georgia, serif"

/** 无 canvas 时的估算：按字符类别给不同宽度（em 单位） */
function estimateEm(text: string): number {
  let w = 0
  for (const ch of text) {
    if (ch === ' ') w += 0.25
    else if (ch >= '0' && ch <= '9') w += 0.5
    else if (ch >= 'A' && ch <= 'Z') w += 0.68
    else if (ch >= 'a' && ch <= 'z') w += 0.48
    else w += 0.5
  }
  return w
}

/** 测量一段西文在给定字号下的像素宽度 */
export function measureEngWidth(text: string, fontSize: number): number {
  const key = `${fontSize}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let w: number
  if (ctx === undefined) {
    ctx =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null
  }
  if (ctx) {
    ctx.font = `${fontSize}px ${ENG_FAMILY}`
    w = ctx.measureText(text).width
  } else {
    w = estimateEm(text) * fontSize
  }
  cache.set(key, w)
  return w
}

/** 清空缓存（字号变化时由调用方决定是否清） */
export function clearMeasureCache(): void {
  cache.clear()
}
