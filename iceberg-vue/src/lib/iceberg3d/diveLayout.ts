import { mulberry32 } from './prng'

/**
 * 深潜布局纯逻辑（审计外新页面 /dive 可单测部分）：
 * - Y 轴即深度：水面 y=0，每层 60 单位，8 层海床止于 y=-480
 * - 词条按层级落带，带内位置由 id 哈希确定（mulberry32，与旧错落同分布族）
 * - 与渲染层（diveEngine）通过纯数据契约交互，便于单测锁定
 */

export const DIVE_BAND_HEIGHT = 60
export const DIVE_TIER_COUNT = 8
export const DIVE_FLOOR_Y = -DIVE_BAND_HEIGHT * DIVE_TIER_COUNT
export const DIVE_WORLD_RADIUS = 520
/** 倒悬冰山主体：水面半径 150，线性收尖至 y=-420 */
export const BERG_TOP_RADIUS = 150
export const BERG_TIP_Y = -420
/** 给定 y 处冰山锥体半径（线性插值） */
export function bergRadiusAt(y: number): number {
  const k = Math.min(1, Math.max(0, -y / -BERG_TIP_Y))
  return BERG_TOP_RADIUS * (1 - k)
}

/** tier 序号（0-based）→ 带中心 y */
export function tierBandY(tierIndex: number): number {
  const i = Math.min(Math.max(tierIndex, 0), DIVE_TIER_COUNT - 1)
  return -(i * DIVE_BAND_HEIGHT + DIVE_BAND_HEIGHT / 2)
}

/** id 字符串 → 32 位种子（与旧错落哈希同算法，保证跨页面一致的手感） */
export function idSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  return h >>> 0
}

export interface DiveNodePos {
  x: number
  y: number
  z: number
  scale: number
}

/** 词条在带内的确定性位置：环绕倒悬冰山主体的壳层（半径 165 起，随层级收敛），
 * y 在带内抖动。撞不到冰山（壳内径 > 任何深度的锥体半径 + 余量）。 */
export function nodePosition(id: string, tierIndex: number): DiveNodePos {
  const rand = mulberry32(idSeed(id))
  const angle = rand() * Math.PI * 2
  const radius = 165 + rand() * (170 - tierIndex * 10)
  return {
    x: Math.cos(angle) * radius,
    y: tierBandY(tierIndex) + (rand() - 0.5) * (DIVE_BAND_HEIGHT * 0.7),
    z: Math.sin(angle) * radius,
    scale: 0.8 + rand() * 0.9,
  }
}

/** y → 深度米数（1 单位 = 2 米，表显用） */
export function depthMeters(y: number): number {
  return Math.max(0, Math.round(-y * 2))
}

/** y → 所在层级序号（0-based，钳制 0..7） */
export function tierAtY(y: number): number {
  return Math.min(DIVE_TIER_COUNT - 1, Math.max(0, Math.floor(-y / DIVE_BAND_HEIGHT)))
}
