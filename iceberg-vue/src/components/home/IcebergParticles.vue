<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { url } from '../../lib/baseUrl'

const props = defineProps<{ label: string }>()
const emit = defineEmits<{ activate: [] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let raf = 0
let resizeHandler: (() => void) | null = null
let rotateTimer = 0

// ── 物理参数 ──
const SPRING_DIV = 30       // 速度 = -位移 / 30：单调指数收敛
const FORCE_RATIO = 350     // 斥力：1/d × FORCE_RATIO（大幅增强）
const D_SPEED_MAX = 4       // 速度上限

// ── 构图 ──
const FIT = 1.06            // 冰山放大倍数（出屏）
const CENTER_X = 0.70       // 中心偏右
const CENTER_Y = 0.68       // 中心偏下

// ── 轮换：两张采样图，每 30s 切换（参考 needed/淡出机制） ──
const ROTATE_MS = 30_000
const sourceUrls = ['/assets/iceberg-berg.svg', '/assets/rabbit.svg']
const sources: HTMLImageElement[] = []
let readyCount = 0
let imgIndex = 0
sourceUrls.forEach((p, i) => {
  const img = new Image()
  img.src = url(p)
  img.onload = () => { readyCount++; if (readyCount === 1) build() }
  sources[i] = img
})

interface P {
  x: number; y: number
  tx: number; ty: number
  r: number; a: number; alphaNow: number
  needed: boolean
}

let ps: P[] = []
let w = 0, h = 0
const mouse = { x: -9999, y: -9999, inside: false }

function onPointerMove(e: PointerEvent) {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  mouse.x = e.clientX - rect.left
  mouse.y = e.clientY - rect.top
  mouse.inside = true
}
function onPointerLeave() { mouse.inside = false }

// 网格采样：固定块大小，每合格块恰好 1 粒子 → 规整网格排列
function sampleGrid(img: HTMLImageElement): { x: number; y: number }[] {
  if (!img.naturalWidth) return []
  const iw = img.naturalWidth, ih = img.naturalHeight
  const S = 384
  const ow = S, oh = Math.round(S * ih / iw)
  const off = document.createElement('canvas')
  off.width = ow; off.height = oh
  const octx = off.getContext('2d')
  if (!octx) return []
  octx.drawImage(img, 0, 0, ow, oh)
  const d = octx.getImageData(0, 0, ow, oh).data
  const block = 2
  const jitter = 0.3 * block
  const out: { x: number; y: number }[] = []
  for (let by = 0; by < oh; by += block) {
    for (let bx = 0; bx < ow; bx += block) {
      // 性能：直接读块中心单像素 alpha（省 4× 读操作，轮换时不再卡顿）
      if (d[(by * ow + bx) * 4 + 3] < 40) continue
      if (Math.random() < 0.24) continue // 稀释 24%
      out.push({
        x: bx + block / 2 + (Math.random() - 0.5) * jitter,
        y: by + block / 2 + (Math.random() - 0.5) * jitter,
      })
    }
  }
  return out
}

function build() {
  const canvas = canvasEl.value
  if (!canvas) return
  const parent = canvas.parentElement
  if (!parent) return
  const rect = parent.getBoundingClientRect()
  w = rect.width; h = rect.height
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr)
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const img = sources[imgIndex]
  if (!img || !img.naturalWidth) return
  const cells = sampleGrid(img)
  if (!cells.length) return
  // 内容包围盒归一化 → 两张图内容精确充满同一尺寸（轮换时大小匹配）
  const xs = cells.map(c => c.x), ys = cells.map(c => c.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys), ymax = Math.max(...ys)
  const spanX = (xmax - xmin) || 1, spanY = (ymax - ymin) || 1
  // 保持源图比例：较长边 × FIT（放大出屏），中心偏右下
  const imgAR = img.naturalWidth / img.naturalHeight
  const bw = Math.max(w, h) * FIT
  const bh = bw / imgAR
  const cx = w * CENTER_X, cy = h * CENTER_Y
  const newPs: P[] = cells.map(({ x, y }) => {
    const angle = Math.random() * Math.PI * 2
    const dist = 0.4 + Math.random() * 0.9
    const nx = (x - xmin) / spanX
    const ny = (y - ymin) / spanY
    return {
      x: (0.5 + Math.cos(angle) * dist) * w,
      y: (0.5 + Math.sin(angle) * dist) * h,
      tx: cx + (nx - 0.5) * bw,
      ty: cy + (ny - 0.5) * bh,
      r: 2.8,
      a: 0.75 + Math.random() * 0.25,
      alphaNow: 0,
      needed: true,
    }
  })
  // 参考轮换机制：旧粒子全部标记淡出，新粒子复用/追加
  for (const p of ps) p.needed = false
  shuffle(newPs)
  shuffle(ps)
  for (let i = 0; i < newPs.length; i++) {
    if (i >= ps.length) {
      ps.push(newPs[i])
    } else {
      const old = ps[i]
      old.needed = true
      old.tx = newPs[i].tx
      old.ty = newPs[i].ty
      old.a = newPs[i].a
      old.r = newPs[i].r
    }
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}

function frame() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]
    if (!p.needed) {
      // 淡出并移除（参考 disappear）
      p.alphaNow -= 0.01
      if (p.alphaNow <= 0) { ps.splice(i, 1); continue }
      ctx.fillStyle = 'rgba(228, 240, 255, ' + Math.max(0, p.alphaNow) + ')'
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r)
      continue
    }
    if (p.alphaNow < p.a) p.alphaNow = Math.min(p.a, p.alphaNow + 0.005)
    let vx = -(p.x - p.tx) / SPRING_DIV
    let vy = -(p.y - p.ty) / SPRING_DIV
    if (mouse.inside) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0.01) {
        const f = FORCE_RATIO / dist
        vx += (dx / dist) * f
        vy += (dy / dist) * f
        vx = Math.max(-D_SPEED_MAX, Math.min(D_SPEED_MAX, vx))
        vy = Math.max(-D_SPEED_MAX, Math.min(D_SPEED_MAX, vy))
      }
    }
    p.x += vx
    p.y += vy
    ctx.fillStyle = 'rgba(228, 240, 255, ' + p.alphaNow + ')'
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r)
  }
  raf = requestAnimationFrame(frame)
}

onMounted(() => {
  build()
  resizeHandler = build
  window.addEventListener('resize', build)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  // 30s 轮换采样图（A ↔ B 循环）
  rotateTimer = window.setInterval(() => {
    imgIndex = 1 - imgIndex
    build()
  }, ROTATE_MS)
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (rotateTimer) window.clearInterval(rotateTimer)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <button class="ip" type="button" :aria-label="props.label" @click="emit('activate')">
    <canvas ref="canvasEl"></canvas>
  </button>
</template>

<style scoped>
.ip {
  position: relative; width: 100%; height: 100%;
  border: none; background: none; padding: 0;
  display: block; cursor: pointer;
}
.ip:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
.ip canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
