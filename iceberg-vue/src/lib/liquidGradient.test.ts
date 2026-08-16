import { describe, expect, it } from 'vitest'
import { buildUniforms, fragmentHeader, fragmentShader } from './liquidGradient'

const base = {
  colorA: '#001220', colorB: '#013a63', colorC: '#0582ca', colorD: '#00a8e8', colorE: '#ff791a',
  seed: 648, speed: 0.2, loop: 0, scale: 0.55, turbAmp: 0.4, turbFreq: 0.1, turbIter: 7,
  waveFreq: 3.8, distBias: 0, jellify: false, ditherMode: 0, dither: 0.05,
  exposure: 1.1, contrast: 1, saturation: 0.9, darkShift: 0,
}

describe('buildUniforms', () => {
  it('u_colors 为五色字符串数组（引擎按官方 setColorArray 上传）', () => {
    const u = buildUniforms(base)
    expect(u.u_colors).toEqual(['#001220', '#013a63', '#0582ca', '#00a8e8', '#ff791a'])
  })

  it('darkShift 透传（滚动沉海扩展 uniform）', () => {
    expect(buildUniforms({ ...base, darkShift: 1.3 }).u_darkShift).toBe(1.3)
    expect(buildUniforms(base).u_darkShift).toBe(0)
  })

  it('jellify 布尔原样传递（引擎负责转 0/1）', () => {
    expect(buildUniforms({ ...base, jellify: true }).u_jellify).toBe(true)
    expect(buildUniforms({ ...base, jellify: false }).u_jellify).toBe(false)
  })

  it('数值 uniform 全部透传', () => {
    const u = buildUniforms(base)
    expect(u.u_seed).toBe(648)
    expect(u.u_speed).toBe(0.2)
    expect(u.u_contrast).toBe(1)
    expect(u.u_saturation).toBe(0.9)
  })
})

describe('shader / header 完整性', () => {
  it('fragment shader 引用的每个 uniform 都在头部声明（防遗漏导致链接失败）', () => {
    const used = [...fragmentShader.matchAll(/\bu_([a-zA-Z0-9_]+)/g)].map((m) => m[1])
    const declared = [...fragmentHeader.matchAll(/uniform[^;]*\bu_([a-zA-Z0-9_]+)/g)].map((m) => m[1])
    const missing = [...new Set(used)].filter((u) => !declared.includes(u))
    expect(missing).toEqual([])
  })

  it('头部包含 vec4 u_colors[8] 与 u_colors_length（官方 wrapFragment 结构）', () => {
    expect(fragmentHeader).toContain('uniform vec4 u_colors[8]')
    expect(fragmentHeader).toContain('uniform int u_colors_length')
  })
})
