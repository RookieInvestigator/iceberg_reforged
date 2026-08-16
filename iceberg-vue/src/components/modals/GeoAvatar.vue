<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ seed: string; hue: number }>()

function rand(salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < props.seed.length; i++) {
    h = Math.imul(h ^ props.seed.charCodeAt(i), 16777619)
  }
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

function choice<T>(arr: T[], salt: number): T {
  return arr[Math.floor(rand(salt) * arr.length)]
}

const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`

const svg = computed(() => {
  const baseHue = props.hue ?? Math.floor(rand(0) * 360)

  const offset1 = choice([30, -30, 45, -45], 1)
  const offset2 = choice([120, -120, 180, 150, -150], 2)
  const offset3 = choice([0, 90, -90, 180], 3)

  const isDark = rand(4) > 0.5
  const colors = [
    hsl(baseHue, 30 + rand(5) * 20, isDark ? 15 + rand(6) * 15 : 85 + rand(6) * 10),
    hsl((baseHue + offset1 + 360) % 360, 65 + rand(7) * 25, 55 + rand(8) * 15),
    hsl((baseHue + offset2 + 360) % 360, 65 + rand(9) * 25, 45 + rand(10) * 20),
    hsl((baseHue + offset3 + 360) % 360, 75 + rand(11) * 25, 60 + rand(12) * 20),
  ]

  // 点缀：60% 概率八角星, 40% 小圆
  function accent(cx: number, cy: number, r: number, fill: string, salt: number): string {
    if (rand(salt) > 0.4) {
      const pts: string[] = []
      const ir = r * 0.45
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 8 * i - Math.PI / 2
        const rr = i % 2 === 0 ? r : ir
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`)
      }
      return `<polygon points="${pts.join(' ')}" fill="${fill}" />`
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />`
  }

  const layouts = [
    // 包豪斯弧线
    () => `<rect width="64" height="64" fill="${colors[0]}" />
      <path d="M 0,0 L 64,0 A 64 64 0 0 1 0 64 Z" fill="${colors[1]}" transform="rotate(${choice([0,90,180,270], 29)} 32 32)"/>
      <path d="M 0,64 L 0,16 A 48 48 0 0 0 48 64 Z" fill="${colors[2]}" transform="rotate(${choice([0,90,180,270], 30)} 32 32)"/>
      ${accent(32 + (rand(31)-0.5)*30, 32 + (rand(32)-0.5)*30, 6 + rand(33)*6, colors[3], 55)}`,
    // 中心眼形
    () => `<rect width="64" height="64" fill="${colors[0]}" />
      <circle cx="32" cy="32" r="28" fill="${colors[1]}" />
      <path d="M 4,32 C 16,10 48,10 60,32 C 48,54 16,54 4,32 Z" fill="${colors[2]}" transform="rotate(${choice([0,90], 34)} 32 32)" />
      ${accent(32, 32, 8 + rand(35)*8, colors[3], 60)}`,
    // 极简面孔：居中的双眼 + 三角鼻
    () => `<rect width="64" height="64" fill="${colors[0]}" />
      <circle cx="26" cy="27" r="3" fill="${colors[3]}" />
      <circle cx="38" cy="27" r="3" fill="${colors[3]}" />
      <polygon points="28,36 36,36 32,42" fill="${colors[3]}" />`,
    // 不规则几何 (晶体/箭头)
    () => {
      const d = `M159.82,50.81,146,106.87l-25.11,23.6-15.45,40.72L46.88,138.64,35.41,101.19,18.76,86.55,13.1,50.81,0,43.15H21.25l35-22.21L66.46,28.6,100,0l53.57,43.15H175ZM56.25,30.87,37.5,43.15H52.74ZM100,10.47,62.5,43.15h56.25l-2.57-12.81L97.07,24.86Z`
      return `<rect width="64" height="64" fill="${colors[0]}" />
        <g transform="translate(2,3) scale(0.34)"><path d="${d}" fill="${colors[1]}" /></g>
        ${accent(44, 40, 6 + rand(70)*5, colors[3], 75)}`
    },
    // 共济会：三角 + 放射线 + 随机中心元素
    () => {
      const rays = Array.from({ length: 12 }, (_, i) => {
        const a = Math.PI / 6 * i
        const x1 = 32 + 12 * Math.cos(a), y1 = 32 + 12 * Math.sin(a)
        const x2 = 32 + 30 * Math.cos(a), y2 = 32 + 30 * Math.sin(a)
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${colors[1]}" stroke-width="${1 + rand(36+i)*2}" opacity="${0.3 + rand(37+i)*0.4}" />`
      }).join('')
      const triR = 15 + rand(51) * 15
      const pts = Array.from({ length: 3 }, (_, i) => {
        const a = Math.PI * 2 / 3 * i - Math.PI / 2
        return `${(32 + triR * Math.cos(a)).toFixed(1)},${(32 + triR * Math.sin(a)).toFixed(1)}`
      }).join(' ')
      return `<rect width="64" height="64" fill="${colors[0]}" />
        ${rays}
        <polygon points="${pts}" fill="${colors[2]}" opacity="0.85" />
        ${accent(32, 32, 5 + rand(50)*5, colors[3], 65)}`
    },
  ]

  const content = choice(layouts, 36)()
  const clipId = `clip-${props.seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}-${Math.floor(rand(37)*10000)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs><clipPath id="${clipId}"><circle cx="32" cy="32" r="32" /></clipPath></defs>
    <g clip-path="url(#${clipId})">${content}</g>
  </svg>`
})
</script>

<template>
  <span class="ga" v-html="svg" />
</template>

<style scoped>
.ga {
  width: 48px; height: 48px; border-radius: 50%; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.ga :deep(svg) { width: 100%; height: 100%; display: block; }
</style>
