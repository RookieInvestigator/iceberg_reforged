/**
 * 种子化随机工具：mulberry32 PRNG + 3D 值噪声 + fbm 分形叠加。
 * 让冰山造型、碎冰分布、宝石布局在每次加载时保持一致的确定性结果。
 */

/** mulberry32：轻量、可复现的伪随机数生成器，返回 [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 整数坐标 → [0, 1) 哈希（确定性，不依赖状态） */
function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 种子化 3D 值噪声：三线性插值 + smoothstep，输出 [-1, 1] */
export class ValueNoise3D {
  constructor(private seed: number) {}

  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const xf = x - xi
    const yf = y - yi
    const zf = z - zi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const w = zf * zf * (3 - 2 * zf)
    const seed = this.seed
    const n000 = hash3i(xi, yi, zi, seed)
    const n100 = hash3i(xi + 1, yi, zi, seed)
    const n010 = hash3i(xi, yi + 1, zi, seed)
    const n110 = hash3i(xi + 1, yi + 1, zi, seed)
    const n001 = hash3i(xi, yi, zi + 1, seed)
    const n101 = hash3i(xi + 1, yi, zi + 1, seed)
    const n011 = hash3i(xi, yi + 1, zi + 1, seed)
    const n111 = hash3i(xi + 1, yi + 1, zi + 1, seed)
    const x00 = n000 + (n100 - n000) * u
    const x10 = n010 + (n110 - n010) * u
    const x01 = n001 + (n101 - n001) * u
    const x11 = n011 + (n111 - n011) * u
    const y0 = x00 + (x10 - x00) * v
    const y1 = x01 + (x11 - x01) * v
    return (y0 + (y1 - y0) * w) * 2 - 1
  }
}

/** 分形布朗运动：低频起伏 + 高频细节叠加，输出 [-1, 1]（归一化） */
export function fbm(
  noise: ValueNoise3D,
  x: number,
  y: number,
  z: number,
  octaves: number,
  lacunarity = 2.0,
  gain = 0.5,
): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise.sample(x * freq, y * freq, z * freq) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
