import { mulberry32 } from '../iceberg3d/prng'
import { prefersReducedMotion } from '../motion'
import {
  type ConstellationsLayoutResult,
  type GraphNode,
  type WordGraph,
  wrapDelta,
} from './wordGraph'

export interface FocusEdgeVisual {
  neighborIdx: number
  weight: number
  explicit: boolean
  reasonText: string
}

export interface RenderFocusState {
  matched: ReadonlySet<number>
  activeCategory: string | null
  focusIndex: number | null
  focusNeighbors: ReadonlySet<number>
  selectedIndex: number | null
  focusEdges: ReadonlyArray<FocusEdgeVisual>
  /** 浮动详情面板列表悬停同步点亮的邻接节点索引 */
  syncedHoverIndex: number | null
}

export interface FocusStarOptions {
  offsetRatioX?: number
  offsetRatioY?: number
  targetScale?: number
  animate?: boolean
}

export interface WordGraphCanvasCallbacks {
  onHoverChange?: (node: GraphNode | null, screenX: number, screenY: number) => void
  onSelect?: (node: GraphNode) => void
  onBackgroundClick?: () => void
}

export interface WordGraphCanvasController {
  setGraph: (graph: WordGraph, rankedIndices: number[], sky: ConstellationsLayoutResult) => void
  setFocusState: (next: RenderFocusState) => void
  focusStar: (idx: number | null, options?: FocusStarOptions) => void
  resize: (refitIfUnmoved?: boolean) => void
  requestDraw: () => void
  fitToView: (animate?: boolean, indices?: Iterable<number>) => void
  zoomBy: (factor: number, cx?: number, cy?: number) => void
  destroy: () => void
}

interface AmbientStar {
  tx: number
  ty: number
  r: number
  alpha: number
  tint: 0 | 1 | 2
  flare: boolean
  layer: 0 | 1 | 2
}

const MIN_SCALE = 0.22
const MAX_SCALE = 5.5
const PARALLAX_TILE_W = 1600
const PARALLAX_TILE_H = 1000
const PARALLAX_LAYERS = [
  { panFactor: 0.018, zoomFactor: 0.032 }, // 远景深空尘埃（极缓慢）
  { panFactor: 0.048, zoomFactor: 0.08 },  // 中景星野（温和深空视差）
  { panFactor: 0.095, zoomFactor: 0.145 }, // 近景星芒（层次感）
] as const

const starColorCache = new Map<string, string>()

/** 将分类色柔化为天文星图光谱色（低饱和冷银 / 淡蓝 / 暖象牙） */
function celestialTint(hex: string, blend = 0.62): string {
  const key = `${hex}:${blend}`
  const hit = starColorCache.get(key)
  if (hit) return hit
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#e4f0ff'
  const num = parseInt(m[1]!, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const mr = Math.round(r * (1 - blend) + 228 * blend)
  const mg = Math.round(g * (1 - blend) + 240 * blend)
  const mb = Math.round(b * (1 - blend) + 255 * blend)
  const out = `rgb(${mr},${mg},${mb})`
  starColorCache.set(key, out)
  return out
}

function createAmbientStars(count = 220): AmbientStar[] {
  const rand = mulberry32(20261129)
  const stars: AmbientStar[] = []
  for (let i = 0; i < count; i++) {
    const roll = rand()
    const layer: 0 | 1 | 2 = roll < 0.56 ? 0 : roll < 0.9 ? 1 : 2
    const brightRoll = rand()
    const r =
      layer === 0
        ? 0.3 + rand() * 0.35
        : layer === 1
          ? 0.5 + rand() * 0.45
          : brightRoll > 0.78
            ? 0.95 + rand() * 0.45
            : 0.7 + rand() * 0.35
    const alpha =
      layer === 0
        ? 0.06 + rand() * 0.08
        : layer === 1
          ? 0.1 + rand() * 0.12
          : 0.16 + rand() * 0.16
    stars.push({
      tx: rand() * PARALLAX_TILE_W,
      ty: rand() * PARALLAX_TILE_H,
      r,
      alpha,
      tint: brightRoll > 0.92 ? 2 : brightRoll > 0.55 ? 1 : 0,
      flare: layer === 2 && brightRoll > 0.88,
      layer,
    })
  }
  return stars
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
}

function drawStarFlare(ctx: CanvasRenderingContext2D, cx: number, cy: number, arm: number, diag = false) {
  ctx.beginPath()
  ctx.moveTo(cx - arm, cy)
  ctx.lineTo(cx + arm, cy)
  ctx.moveTo(cx, cy - arm)
  ctx.lineTo(cx, cy + arm)
  if (diag) {
    const d = arm * 0.5
    ctx.moveTo(cx - d, cy - d)
    ctx.lineTo(cx + d, cy + d)
    ctx.moveTo(cx - d, cy + d)
    ctx.lineTo(cx + d, cy - d)
  }
  ctx.stroke()
}

/** 优雅弯曲星座弧线，返回二次贝塞尔中点坐标 */
function traceCurvedArc(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bend: number,
): { mx: number; my: number } {
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = (x1 + x2) / 2 - dy * bend
  const cy = (y1 + y2) / 2 + dx * bend
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(cx, cy, x2, y2)
  // B(0.5) = 0.25*P0 + 0.5*C + 0.25*P1
  return {
    mx: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
    my: 0.25 * y1 + 0.5 * cy + 0.25 * y2,
  }
}

function quadPoint(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  }
}


export function createWordGraphCanvas(
  canvas: HTMLCanvasElement,
  wrap: HTMLElement,
  callbacks: WordGraphCanvasCallbacks = {},
): WordGraphCanvasController {
  let graph: WordGraph | null = null
  let rankedIndices: number[] = []
  let skyScene: ConstellationsLayoutResult | null = null
  let userAdjustedCamera = false
  let destroyed = false

  let selectedAnchorWorld: { idx: number; x: number; y: number } | null = null

  const ambientStars = createAmbientStars(320)

  let focus: RenderFocusState = {
    matched: new Set(),
    activeCategory: null,
    focusIndex: null,
    focusNeighbors: new Set(),
    selectedIndex: null,
    focusEdges: [],
    syncedHoverIndex: null,
  }

  const view = { scale: 1, ox: 0, oy: 0 }
  let dpr = 1
  let raf = 0
  let animRaf = 0
  let focusPulseRaf = 0

  // ── 聚焦收拢与亮度交叉淡入淡出过渡状态 ──
  let focusPullProgress = 0
  let focusFadeProgress = 0
  let pullTargetIdx: number | null = null
  let pullTargetAnchor: { x: number; y: number } | null = null
  let pullTargets = new Map<number, { ambientX: number; ambientY: number; pulledX: number; pulledY: number }>()
  let lastViewportSize = { w: 0, h: 0 }
  let activeFocusOptions: FocusStarOptions = {}
  let pendingFocusScale: number | null = null

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function stopAnim() {
    if (animRaf) {
      cancelAnimationFrame(animRaf)
      animRaf = 0
    }
  }

  function stopFocusPulse() {
    if (focusPulseRaf) {
      cancelAnimationFrame(focusPulseRaf)
      focusPulseRaf = 0
    }
  }

  function ensureFocusPulse() {
    if (destroyed) return
    if (focus.selectedIndex !== null && !prefersReducedMotion()) {
      if (!focusPulseRaf) {
        let lastPulseAt = 0
        const loop = (now: number) => {
          if (destroyed || focus.selectedIndex === null || prefersReducedMotion()) {
            focusPulseRaf = 0
            return
          }
          if (!animRaf && now - lastPulseAt >= 33) {
            lastPulseAt = now
            draw()
          }
          focusPulseRaf = requestAnimationFrame(loop)
        }
        focusPulseRaf = requestAnimationFrame(loop)
      }
    } else {
      stopFocusPulse()
    }
  }

  function requestDraw() {
    if (raf || destroyed) return
    raf = requestAnimationFrame(draw)
  }

  /**
   * 相机钳制 —— 无限卷轴模式下**不限制平移范围**（往哪个方向拖都有内容）。
   *
   * 唯一还需要管的是缩放下限：视口变大或周期变小时，原来的缩放会露出空带，
   * 这里把它拉回「一屏一个周期」的下限，并以视口中心为锚保持视野不跳。
   */
  function clampCamera() {
    if (!skyScene) return
    const minS = minScaleAllowed()
    if (view.scale >= minS) return
    const w = Math.max(2, canvas.width / dpr)
    const h = Math.max(2, canvas.height / dpr)
    const k = minS / view.scale
    view.ox = w * 0.5 - (w * 0.5 - view.ox) * k
    view.oy = h * 0.5 - (h * 0.5 - view.oy) * k
    view.scale = minS
  }

  function computeFitCamera(indices?: Iterable<number>): { scale: number; ox: number; oy: number } | null {
    if (!graph || !skyScene) return null
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    if (w < 2 || h < 2) return null

    if (indices) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let found = false
      for (const idx of indices) {
        const slot = skyScene.positions[idx]
        if (!slot) continue
        found = true
        if (slot.x < minX) minX = slot.x
        if (slot.x > maxX) maxX = slot.x
        if (slot.y < minY) minY = slot.y
        if (slot.y > maxY) maxY = slot.y
      }
      if (found) {
        const bw = Math.max(220, maxX - minX + 180)
        const bh = Math.max(160, maxY - minY + 180)
        const scale = Math.max(minScaleAllowed(), Math.min(1.85, Math.min(w / bw, h / bh) * 0.88))
        return {
          scale,
          ox: w / 2 - ((minX + maxX) / 2) * scale,
          oy: h / 2 - ((minY + maxY) / 2) * scale,
        }
      }
    }

    const { minX, maxX, minY, maxY } = skyScene.bounds
    const bw = Math.max(480, maxX - minX + 360)
    const bh = Math.max(320, maxY - minY + 280)
    const scale = Math.max(minScaleAllowed(), Math.min(1.45, Math.min(w / bw, h / bh) * 0.92))
    return {
      scale,
      ox: w / 2 - ((minX + maxX) / 2) * scale,
      oy: h / 2 - ((minY + maxY) / 2) * scale,
    }
  }

  function computeOverviewCamera(): { scale: number; ox: number; oy: number } | null {
    const fitCam = computeFitCamera()
    if (!fitCam || !skyScene) return fitCam
    if (skyScene.constellations.length <= 12) return fitCam
    const w = Math.max(320, canvas.width / dpr)
    const h = Math.max(320, canvas.height / dpr)
    const scale = Math.max(fitCam.scale, Math.max(0.46, Math.min(0.68, w / 2350)))
    return {
      scale,
      ox: w * 0.5,
      oy: h * 0.5,
    }
  }

  function animateTransition(
    targetCam: { scale: number; ox: number; oy: number } | null,
    targetPull: number,
    targetFade: number,
    animate: boolean,
    duration = 520,
  ) {
    stopAnim()
    if (!animate || prefersReducedMotion()) {
      if (targetCam) {
        view.scale = targetCam.scale
        view.ox = targetCam.ox
        view.oy = targetCam.oy
      }
      focusPullProgress = targetPull
      focusFadeProgress = targetFade
      if (targetPull === 0 && targetFade === 0 && focus.selectedIndex === null) {
        pullTargets.clear()
        pullTargetIdx = null
        pullTargetAnchor = null
      }
      requestDraw()
      return
    }

    const from = {
      scale: view.scale,
      ox: view.ox,
      oy: view.oy,
      pull: focusPullProgress,
      fade: focusFadeProgress,
    }
    const t0 = performance.now()
    const tick = () => {
      if (destroyed) return
      const k = Math.min(1, (performance.now() - t0) / duration)
      const camEase = easeInOutCubic(k)
      const pullEase = easeOutCubic(k)
      if (targetCam) {
        view.scale = from.scale + (targetCam.scale - from.scale) * camEase
        view.ox = from.ox + (targetCam.ox - from.ox) * camEase
        view.oy = from.oy + (targetCam.oy - from.oy) * camEase
      }
      focusPullProgress = from.pull + (targetPull - from.pull) * pullEase
      focusFadeProgress = from.fade + (targetFade - from.fade) * pullEase
      draw()
      if (k < 1) {
        animRaf = requestAnimationFrame(tick)
      } else {
        animRaf = 0
        focusPullProgress = targetPull
        focusFadeProgress = targetFade
        if (targetPull === 0 && targetFade === 0 && focus.selectedIndex === null) {
          pullTargets.clear()
          pullTargetIdx = null
          pullTargetAnchor = null
        }
        draw()
      }
    }
    animRaf = requestAnimationFrame(tick)
  }

  /**
   * 为聚焦的中心词条及其关联词条计算收拢到屏幕可见区域的舒适坐标，
   * 保持原本相对方向，兼顾无碰撞排布并避让桌面右侧透视卡 / 移动底部浮层。
   */
  function rebuildPullTargets(
    centerIdx: number,
    anchor: { x: number; y: number },
    targetScale: number,
    ratioX: number,
    ratioY: number,
  ) {
    pullTargets.clear()
    pullTargetIdx = centerIdx
    pullTargetAnchor = { x: anchor.x, y: anchor.y }
    if (!graph || !skyScene) return
    const fSlot = skyScene.positions[centerIdx]
    if (!fSlot) return

    const w = Math.max(320, canvas.width / dpr)
    const h = Math.max(320, canvas.height / dpr)
    const cxScreen = w * ratioX
    const cyScreen = h * ratioY
    const isDesktop = w >= 1024
    const panelW = isDesktop ? Math.min(392, w * 0.34) + 36 : 24
    const bottomH = isDesktop ? 44 : h * 0.49 + 24

    const availLeft = Math.max(96, cxScreen - (isDesktop ? 132 : 84))
    const availRight = Math.max(96, w - panelW - cxScreen - (isDesktop ? 124 : 84))
    const availTop = Math.max(84, cyScreen - 78)
    const availBottom = Math.max(84, h - bottomH - cyScreen - 54)

    const rxMax = Math.max(86, Math.min(availLeft, availRight) * 0.92) / targetScale
    const ryMax = Math.max(82, Math.min(availTop, availBottom) * 0.92) / targetScale

    const edgeItems =
      focus.focusEdges.length > 0
        ? focus.focusEdges
        : [...focus.focusNeighbors].map((nbIdx) => ({
            neighborIdx: nbIdx,
            weight: 2,
            explicit: false,
            reasonText: '',
          }))

    const entries: Array<{
      idx: number
      ambientX: number
      ambientY: number
      angle: number
      weight: number
      explicit: boolean
      px: number
      py: number
    }> = []

    for (let ni = 0; ni < edgeItems.length; ni++) {
      const edge = edgeItems[ni]!
      const nbSlot = skyScene.positions[edge.neighborIdx]
      if (!nbSlot) continue
      const dx = nbSlot.x - fSlot.x
      const dy = nbSlot.y - fSlot.y
      const angle = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : (ni / Math.max(1, edgeItems.length)) * Math.PI * 2
      entries.push({
        idx: edge.neighborIdx,
        ambientX: nbSlot.x,
        ambientY: nbSlot.y,
        angle,
        weight: edge.weight,
        explicit: edge.explicit,
        px: 0,
        py: 0,
      })
    }

    if (entries.length === 0) return

    // 按原始方位角排序并做温和的角度松弛，防止最多 12 颗邻接星堆叠在同一射线上
    const byAngle = entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.angle - b.e.angle)
    const count = byAngle.length
    const minAngleGap = Math.min(0.68, (Math.PI * 2 * 0.88) / Math.max(count, 2))
    for (let iter = 0; iter < 10; iter++) {
      for (let k = 0; k < count; k++) {
        const cur = byAngle[k]!.e
        const next = byAngle[(k + 1) % count]!.e
        let diff = next.angle - cur.angle
        if (k === count - 1) diff += Math.PI * 2
        if (diff < minAngleGap) {
          const push = (minAngleGap - diff) * 0.42
          cur.angle -= push
          next.angle += push
        }
      }
    }

    const maxW = Math.max(...entries.map((e) => e.weight), 1)
    const minW = Math.min(...entries.map((e) => e.weight), 0)
    const spanW = Math.max(0.25, maxW - minW)

    for (let k = 0; k < count; k++) {
      const item = byAngle[k]!.e
      const norm = item.explicit ? 0.94 : (item.weight - minW) / spanW
      const ringBias = count > 8 ? (k % 2 === 0 ? 0.09 : -0.09) : k % 2 === 0 ? 0.06 : -0.05
      const radialFactor = 0.88 - norm * 0.34 + ringBias
      const rScale = Math.max(0.46, Math.min(0.95, radialFactor))
      item.px = anchor.x + Math.cos(item.angle) * rxMax * rScale
      item.py = anchor.y + Math.sin(item.angle) * ryMax * rScale
    }

    // 在世界坐标内做轻量排斥，确保任意两颗关联星与中心星都保持呼吸感
    const minPairDist = Math.max(46 / targetScale, Math.min(rxMax, ryMax) * (count > 8 ? 0.24 : 0.31))
    const minCenterDist = Math.max(62 / targetScale, Math.min(rxMax, ryMax) * 0.38)
    for (let iter = 0; iter < 24; iter++) {
      for (let a = 0; a < entries.length; a++) {
        const ea = entries[a]!
        for (let b = a + 1; b < entries.length; b++) {
          const eb = entries[b]!
          const dx = eb.px - ea.px
          const dy = eb.py - ea.py
          const d = Math.hypot(dx, dy) || 0.001
          if (d < minPairDist) {
            const push = ((minPairDist - d) / d) * 0.45
            ea.px -= dx * push
            ea.py -= dy * push
            eb.px += dx * push
            eb.py += dy * push
          }
        }
        const cdx = ea.px - anchor.x
        const cdy = ea.py - anchor.y
        const cd = Math.hypot(cdx, cdy) || 0.001
        if (cd < minCenterDist) {
          const push = (minCenterDist - cd) / cd
          ea.px += cdx * push
          ea.py += cdy * push
        }
        const ex = (ea.px - anchor.x) / rxMax
        const ey = (ea.py - anchor.y) / ryMax
        const ell = Math.hypot(ex, ey)
        if (ell > 1) {
          ea.px = anchor.x + (ea.px - anchor.x) / ell
          ea.py = anchor.y + (ea.py - anchor.y) / ell
        }
      }
    }

    for (const e of entries) {
      pullTargets.set(e.idx, {
        ambientX: e.ambientX,
        ambientY: e.ambientY,
        pulledX: e.px,
        pulledY: e.py,
      })
    }
  }

  function resize(refitIfUnmoved = false) {
    const rect = wrap.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    lastViewportSize = { w: rect.width, h: rect.height }
    if (refitIfUnmoved && !userAdjustedCamera && skyScene && selectedAnchorWorld === null) {
      const cam = computeOverviewCamera()
      if (cam) {
        view.scale = cam.scale
        view.ox = cam.ox
        view.oy = cam.oy
      }
    }
    if (focus.selectedIndex !== null && selectedAnchorWorld) {
      const ratioX = activeFocusOptions.offsetRatioX ?? (rect.width < 1024 ? 0.5 : 0.39)
      const ratioY = activeFocusOptions.offsetRatioY ?? (rect.width < 1024 ? 0.28 : 0.5)
      rebuildPullTargets(focus.selectedIndex, selectedAnchorWorld, view.scale, ratioX, ratioY)
    }
    // 视口尺寸变了，缩放下限跟着变（否则会露出空带）
    clampCamera()
    requestDraw()
  }

  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale }
  }

  function focusStar(idx: number | null, options: FocusStarOptions = {}) {
    if (!graph || !skyScene) return
    activeFocusOptions = options
    if (idx === null) {
      selectedAnchorWorld = null
      ensureFocusPulse()
      if (pullTargets.size > 0 || focusPullProgress > 0.01 || focusFadeProgress > 0.01) {
        animateTransition(null, 0, 0, options.animate ?? true, 460)
      } else {
        focusPullProgress = 0
        focusFadeProgress = 0
        pullTargets.clear()
        pullTargetIdx = null
        pullTargetAnchor = null
        requestDraw()
      }
      return
    }

    const slot = skyScene.positions[idx]
    if (!slot) return
    const copy = { x: slot.x, y: slot.y }
    selectedAnchorWorld = { idx, x: copy.x, y: copy.y }
    userAdjustedCamera = true

    const w = Math.max(320, canvas.width / dpr)
    const h = Math.max(320, canvas.height / dpr)
    const ratioX = options.offsetRatioX ?? (w < 1024 ? 0.5 : 0.39)
    const ratioY = options.offsetRatioY ?? (w < 1024 ? 0.28 : 0.5)
    const nextScale = options.targetScale ?? Math.max(1.18, Math.min(1.55, view.scale < 1.1 ? 1.24 : view.scale))
    pendingFocusScale = nextScale

    rebuildPullTargets(idx, copy, nextScale, ratioX, ratioY)
    focusPullProgress = 0

    animateTransition(
      {
        scale: nextScale,
        ox: w * ratioX - copy.x * nextScale,
        oy: h * ratioY - copy.y * nextScale,
      },
      1,
      1,
      options.animate ?? true,
      540,
    )
    ensureFocusPulse()
  }

  function fitToView(animate = true, indices?: Iterable<number>) {
    userAdjustedCamera = false
    selectedAnchorWorld = null
    focusPullProgress = 0
    focusFadeProgress = 0
    pullTargets.clear()
    pullTargetIdx = null
    pullTargetAnchor = null
    const cam = computeFitCamera(indices)
    if (cam) animateTransition(cam, 0, 0, animate, 500)
  }

  function zoomBy(factor: number, cx?: number, cy?: number) {
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const px = cx ?? w / 2
    const py = cy ?? h / 2
    const next = Math.max(minScaleAllowed(), Math.min(MAX_SCALE, view.scale * factor))

    if (cx === undefined && cy === undefined && focus.selectedIndex === null && !prefersReducedMotion()) {
      userAdjustedCamera = true
      const k = next / view.scale
      const targetCam = {
        scale: next,
        ox: px - (px - view.ox) * k,
        oy: py - (py - view.oy) * k,
      }
      clampCamera()
      animateTransition(targetCam, focusPullProgress, focusFadeProgress, true, 240)
      return
    }

    stopAnim()
    userAdjustedCamera = true
    const k = next / view.scale
    view.ox = px - (px - view.ox) * k
    view.oy = py - (py - view.oy) * k
    view.scale = next
    if (focus.selectedIndex !== null && selectedAnchorWorld) {
      const ratioX = activeFocusOptions.offsetRatioX ?? (w < 1024 ? 0.5 : 0.39)
      const ratioY = activeFocusOptions.offsetRatioY ?? (w < 1024 ? 0.28 : 0.5)
      rebuildPullTargets(focus.selectedIndex, selectedAnchorWorld, view.scale, ratioX, ratioY)
    } else {
      clampCamera()
    }
    requestDraw()
  }

  function getPulledNeighborWorldPos(idx: number): { x: number; y: number } | null {
    const pt = pullTargets.get(idx)
    if (!pt || focusPullProgress <= 0.001) return null
    return {
      x: pt.ambientX + (pt.pulledX - pt.ambientX) * focusPullProgress,
      y: pt.ambientY + (pt.pulledY - pt.ambientY) * focusPullProgress,
    }
  }

  function hitTest(
    sx: number,
    sy: number,
    pointerType = 'mouse',
  ): { kind: 'node'; idx: number; copyX: number; copyY: number } | null {
    if (!graph || !skyScene) return null
    const world = screenToWorld(sx, sy)
    const padPx = pointerType === 'touch' ? 16 : 9
    const pad = padPx / view.scale
    // 卷轴周期：命中判定必须用「回绕后的距离」，
    // 否则只有 0 号副本的世界坐标能和指针位置对上 —— 表现为「只有中间那片能点」。
    const { pw, ph } = scrollPeriod()
    const nearX = (x: number) => wrapDelta(x - world.x, pw)
    const nearY = (y: number) => wrapDelta(y - world.y, ph)

    // 聚焦模式下优先命中居中的主星及其已拉近屏幕的关联星实时位置
    if (pullTargetIdx !== null && pullTargetAnchor && focus.selectedIndex === pullTargetIdx) {
      const cdx = nearX(pullTargetAnchor.x)
      const cdy = nearY(pullTargetAnchor.y)
      const cHitR = 14 / view.scale + pad
      if (Math.hypot(cdx, cdy) <= cHitR) {
        return {
          kind: 'node',
          idx: pullTargetIdx,
          copyX: pullTargetAnchor.x,
          copyY: pullTargetAnchor.y,
        }
      }

      let bestNb: { idx: number; dist: number; slotX: number; slotY: number } | null = null
      for (const [nbIdx] of pullTargets) {
        const pos = getPulledNeighborWorldPos(nbIdx)
        if (!pos) continue
        const ndx = nearX(pos.x)
        const ndy = nearY(pos.y)
        const nHitR = 11 / view.scale + pad
        const d = Math.hypot(ndx, ndy)
        if (d <= nHitR && (!bestNb || d < bestNb.dist)) {
          const slot = skyScene.positions[nbIdx]!
          bestNb = {
            idx: nbIdx,
            dist: d,
            slotX: slot.x,
            slotY: slot.y,
          }
        }
      }
      if (bestNb) {
        return {
          kind: 'node',
          idx: bestNb.idx,
          copyX: bestNb.slotX,
          copyY: bestNb.slotY,
        }
      }
    }

    let bestIdx: number | null = null
    let bestScore = Infinity
    for (let i = 0; i < skyScene.positions.length; i++) {
      const slot = skyScene.positions[i]!
      const dx = nearX(slot.x)
      const dy = nearY(slot.y)
      const hitR =
        (slot.starClass === 'primary' ? 11 : slot.starClass === 'sub' ? 8.2 : 6.2) / view.scale + pad
      if (Math.abs(dx) <= hitR && Math.abs(dy) <= hitR) {
        const tierBias = slot.starClass === 'primary' ? 0.68 : slot.starClass === 'sub' ? 0.85 : 1
        const d = Math.hypot(dx, dy) * tierBias
        if (d < bestScore) {
          bestScore = d
          bestIdx = i
        }
      }
    }
    if (bestIdx === null) return null
    const slot = skyScene.positions[bestIdx]!
    return {
      kind: 'node',
      idx: bestIdx,
      copyX: slot.x,
      copyY: slot.y,
    }
  }

  /** 深空背景星芒（多层微视差随拖拽/缩放缓慢推移，营造深空纵深） */
  function drawCosmicBackdrop(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dim: boolean,
    dimFactor: number,
    isFocus: boolean,
  ) {
    ctx.save()

    const nebShiftX = Math.sin(view.ox * 0.00045) * 44
    const nebShiftY = Math.sin(view.oy * 0.00045) * 30
    const nebGrad = ctx.createRadialGradient(
      w * 0.44 + nebShiftX,
      h * 0.46 + nebShiftY,
      0,
      w * 0.5 + nebShiftX * 0.5,
      h * 0.5 + nebShiftY * 0.5,
      Math.max(w, h) * 0.72,
    )
    nebGrad.addColorStop(
      0,
      !dim ? 'rgba(34, 72, 136, 0.1)' : isFocus ? 'rgba(30, 62, 118, 0.072)' : 'rgba(26, 52, 98, 0.05)',
    )
    nebGrad.addColorStop(0.55, isFocus ? 'rgba(14, 28, 60, 0.045)' : 'rgba(12, 24, 52, 0.035)')
    nebGrad.addColorStop(1, 'rgba(2, 4, 10, 0)')
    ctx.fillStyle = nebGrad
    ctx.fillRect(0, 0, w, h)

    const logScale = Math.log2(Math.max(0.28, view.scale))
    const halfW = w * 0.5
    const halfH = h * 0.5

    for (const s of ambientStars) {
      const cfg = PARALLAX_LAYERS[s.layer]
      const zoomSpread = 1 + logScale * cfg.zoomFactor
      const scaledTW = PARALLAX_TILE_W * zoomSpread
      const scaledTH = PARALLAX_TILE_H * zoomSpread
      // 相对视口中心的平铺坐标随 view.ox / view.oy 缓慢平移并无缝周期回绕
      let ux = (s.tx + view.ox * cfg.panFactor) % PARALLAX_TILE_W
      let uy = (s.ty + view.oy * cfg.panFactor) % PARALLAX_TILE_H
      if (ux < 0) ux += PARALLAX_TILE_W
      if (uy < 0) uy += PARALLAX_TILE_H

      const baseX = halfW + (ux - PARALLAX_TILE_W * 0.5) * zoomSpread
      const baseY = halfH + (uy - PARALLAX_TILE_H * 0.5) * zoomSpread
      const startX = ((((baseX + 16) % scaledTW) + scaledTW) % scaledTW) - 16
      const startY = ((((baseY + 16) % scaledTH) + scaledTH) % scaledTH) - 16

      for (let sy = startY; sy <= h + 16; sy += scaledTH) {
        for (let sx = startX; sx <= w + 16; sx += scaledTW) {
          ctx.globalAlpha = s.alpha * dimFactor
          ctx.fillStyle = s.tint === 2 ? '#ffe5c4' : s.tint === 1 ? '#c8e4ff' : '#f2f7ff'
          if (s.flare) {
            drawDiamond(ctx, sx, sy, s.r * 1.15)
            ctx.fill()
            ctx.globalAlpha = s.alpha * 0.55 * dimFactor
            ctx.strokeStyle = ctx.fillStyle
            ctx.lineWidth = 0.65
            drawStarFlare(ctx, sx, sy, s.r * 3.8, false)
          } else {
            ctx.beginPath()
            ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }
    ctx.restore()
  }

  /**
   * 无限卷轴：以「星群真实包围盒 + 一圈薄留白」为周期做**环形回绕**。
   *
   * 这里刻意**不平铺多份副本**，两种做法都踩过：
   *  1. 副本 → 同一条词条在别的片里也亮、也带标注，读起来是重影，命中测试
   *     还会因为「只有 0 号片的世界坐标对得上」而变成「只有中间那片能点」；
   *  2. 镜像副本 → 星图是位置语义（挨得近 = 关系近），镜像之后左右邻居全是假的。
   * 改成「每个元素只画离视口中心最近的那个副本」（见 drawScene 的 toSx/toSy）：
   * 屏幕上任何时刻只有一份，但往哪个方向拖都永远有内容 —— 视觉上就是无限卷轴，
   * 命中测试也天然对得上，不再需要「哪一片是正片」这个概念。
   */
  let scrollCache: { key: ConstellationsLayoutResult; pw: number; ph: number } | null = null
  /**
   * 卷轴周期：留白取 1.5%。
   * 留白不是「片间距」，只是把最右与最左的星分开一点 —— 完全等于内容尺寸时，
   * 右缘那颗星会和左缘那颗星重叠成同一个点（周期相等 = 同一个位置）。
   */
  function scrollPeriod(): { pw: number; ph: number } {
    if (scrollCache && scrollCache.key === skyScene) return scrollCache
    const { minX, minY, maxX, maxY } = contentBounds()
    const entry = {
      key: skyScene!,
      pw: Math.max(400, (maxX - minX) * 1.015),
      ph: Math.max(300, (maxY - minY) * 1.015),
    }
    scrollCache = entry
    return entry
  }

  /**
   * 最小缩放：视野宽度不得超过一个周期。
   *
   * 世界只画「离视口中心最近的一个副本」，一旦视野比周期还大，
   * 屏幕边上就会出现一条没有任何星的空带（另一侧的内容已经回绕到中间去了）。
   * 直接把下限抬到「刚好一屏一个周期」即可。
   */
  function minScaleAllowed(): number {
    if (!skyScene) return MIN_SCALE
    const w = Math.max(2, canvas.width / dpr)
    const h = Math.max(2, canvas.height / dpr)
    const { pw, ph } = scrollPeriod()
    // ×1.03：让视野**略小于**一个周期，回绕点落在屏幕外，
    // 边缘的星是「划出去再从另一侧划进来」，不会在屏幕边上跳一下
    return Math.max(MIN_SCALE, Math.max(w / pw, h / ph) * 1.03)
  }

  /** 星群真实包围盒（缓存一次，布局不变就一直用） */
  let boundsCache: { key: ConstellationsLayoutResult; box: { minX: number; minY: number; maxX: number; maxY: number } } | null = null
  function contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    if (boundsCache && boundsCache.key === skyScene) return boundsCache.box
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const ps = skyScene!.positions
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    // 兜底：空图时用场景 bounds
    if (!Number.isFinite(minX)) {
      const b = skyScene!.bounds
      minX = b.minX; minY = b.minY; maxX = b.maxX; maxY = b.maxY
    }
    const box = { minX, minY, maxX, maxY }
    boundsCache = { key: skyScene!, box }
    return box
  }

  function draw() {
    raf = 0
    if (!graph || !skyScene) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    if (w !== lastViewportSize.w || h !== lastViewportSize.h) {
      lastViewportSize = { w, h }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 背景（深空星芒视差）只画一次：它跟着相机走，不参与世界的环形回绕
    drawComicBackdropOnce(ctx, w, h)

    const { scale, ox, oy } = view
    // 单遍绘制：世界坐标在 toSx/toSy 里做环形回绕，屏幕上永远只有一份内容
    drawScene(ctx, w, h, scale, ox, oy)
  }

  /** 背景（与相机无关的部分）抽出来，避免与星图层混在一起 */
  function drawComicBackdropOnce(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const isSelectedFocus = focus.selectedIndex !== null
    const hasFilter = isSelectedFocus || focus.matched.size > 0 || Boolean(focus.activeCategory)
    const fadeMix = focusFadeProgress
    const dimBlend = isSelectedFocus ? Math.max(0.15, fadeMix) : fadeMix
    const dimBgFactor =
      focus.matched.size > 0 || focus.activeCategory
        ? 0.48
        : 1 - (1 - 0.72) * dimBlend
    drawCosmicBackdrop(ctx, w, h, hasFilter || dimBlend > 0.01, dimBgFactor, isSelectedFocus || dimBlend > 0.01)
  }

  /**
   * 绘制整张星图（单遍）。
   *
   * 世界坐标 → 屏幕坐标一律走 toSx/toSy：先取「离视口中心最近的周期副本」再投影。
   * 于是每条词条/每条连线在屏幕上只可能出现一次，标注、悬停高亮、命中测试
   * 三者天然一致 —— 不存在「别的片里的同名点也跟着亮」。
   */
  function drawScene(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    scale: number,
    ox: number,
    oy: number,
  ) {
    const scene = skyScene!
    const g = graph!
    const { pw, ph } = scrollPeriod()
    const camX = (w * 0.5 - ox) / scale
    const camY = (h * 0.5 - oy) / scale
    const toSx = (x: number) => (camX + wrapDelta(x - camX, pw)) * scale + ox
    const toSy = (y: number) => (camY + wrapDelta(y - camY, ph)) * scale + oy

    /**
     * 连线两端必须**成对**回绕：先定 A 的副本，再让 B 相对 A 取最短。
     *
     * 若两端各自取「离视口中心最近的副本」，在回绕分界处会出现一端选了屏幕左侧、
     * 另一端选了屏幕右侧的情况 —— 一条本来两百单位的星座边被拉成横穿全屏的长线。
     * 这就是「背景连接线有 bug」的成因；成对回绕后短边永远是短边。
     */
    const toArc = (ax: number, ay: number, bx: number, by: number) => {
      const wxa = camX + wrapDelta(ax - camX, pw)
      const wya = camY + wrapDelta(ay - camY, ph)
      return {
        ax: wxa * scale + ox,
        ay: wya * scale + oy,
        bx: (wxa + wrapDelta(bx - ax, pw)) * scale + ox,
        by: (wya + wrapDelta(by - ay, ph)) * scale + oy,
      }
    }

    const isSelectedFocus = focus.selectedIndex !== null
    const hasHoverFocus = !isSelectedFocus && focus.focusIndex !== null

    const fadeMix = focusFadeProgress
    const dimBlend = isSelectedFocus ? Math.max(0.15, fadeMix) : fadeMix

    // 可见范围：以视口中心为基准、按周期回绕后的世界半跨度
    const worldMargin = Math.max(180, 220 / scale)
    const visHalfW = w * 0.5 / scale + worldMargin
    const visHalfH = h * 0.5 / scale + worldMargin
    const inView = (x: number, y: number) =>
      Math.abs(wrapDelta(x - camX, pw)) <= visHalfW && Math.abs(wrapDelta(y - camY, ph)) <= visHalfH

    const activeFocusIdx = isSelectedFocus ? focus.selectedIndex : focus.focusIndex
    let activeAnchorPos: { x: number; y: number } | null = null
    if (activeFocusIdx !== null && scene.positions[activeFocusIdx]) {
      const slot = scene.positions[activeFocusIdx]!
      activeAnchorPos = { x: slot.x, y: slot.y }
    }

    const isCategoryHit = (idx: number) => {
      if (!focus.activeCategory) return false
      const node = g.nodes[idx]!
      return node.category === focus.activeCategory || node.categories.includes(focus.activeCategory)
    }

    const isHighlighted = (idx: number): boolean => {
      if (isSelectedFocus) {
        return idx === activeFocusIdx || focus.focusNeighbors.has(idx)
      }
      if (focus.matched.size > 0) return focus.matched.has(idx)
      if (focus.activeCategory) return isCategoryHit(idx)
      return true
    }

    const zoomReveal = Math.max(0, Math.min(1, (scale - 0.85) / 0.75))
    const arcStrokeW = Math.max(0.72, Math.min(1.18, 0.88 * Math.sqrt(scale)))
    /** 屏幕裁剪：整条边都在视口外才跳过（端点各自回绕后可能只剩一端可见） */
    const offscreen = (ax: number, ay: number, bx: number, by: number) =>
      Math.max(ax, bx) < -60 || Math.min(ax, bx) > w + 60 || Math.max(ay, by) < -60 || Math.min(ay, by) > h + 60

    // 1. 星官骨架细丝：只画星座内部的连线（跨星座的「背景关联线」已移除）
    ctx.save()
    const isFilterMode = focus.matched.size > 0 || Boolean(focus.activeCategory)
    if (!isFilterMode) {
      // 星座连线（略亮）
      const baseArcAlpha = 0.36 + (0.1 - 0.36) * dimBlend
      ctx.lineWidth = arcStrokeW - (arcStrokeW - 0.75) * dimBlend
      ctx.strokeStyle = `rgba(184, 222, 255, ${baseArcAlpha.toFixed(3)})`
      ctx.beginPath()
      for (let i = 0; i < scene.arcs.length; i++) {
        const arc = scene.arcs[i]!
        if (!arc.primary) continue
        const pa = scene.positions[arc.a]!
        const pb = scene.positions[arc.b]!
        const pt = toArc(pa.x, pa.y, pb.x, pb.y)
        if (offscreen(pt.ax, pt.ay, pt.bx, pt.by)) continue
        traceCurvedArc(ctx, pt.ax, pt.ay, pt.bx, pt.by, (i % 2 === 0 ? 1 : -1) * 0.13)
      }
      ctx.stroke()

      if (zoomReveal > 0.08 && dimBlend < 0.85) {
        ctx.lineWidth = 0.65
        ctx.strokeStyle = `rgba(155, 198, 248, ${(zoomReveal * 0.18 * (1 - dimBlend)).toFixed(3)})`
        ctx.beginPath()
        for (let i = 0; i < scene.arcs.length; i++) {
          const arc = scene.arcs[i]!
          if (arc.primary) continue
          const pa = scene.positions[arc.a]!
          const pb = scene.positions[arc.b]!
          const pt = toArc(pa.x, pa.y, pb.x, pb.y)
          if (offscreen(pt.ax, pt.ay, pt.bx, pt.by)) continue
          traceCurvedArc(ctx, pt.ax, pt.ay, pt.bx, pt.by, (i % 2 === 0 ? 1 : -1) * 0.12)
        }
        ctx.stroke()
      }
    } else {
      ctx.lineWidth = 0.72
      ctx.strokeStyle = 'rgba(165, 208, 255, 0.048)'
      ctx.beginPath()
      for (let i = 0; i < scene.arcs.length; i++) {
        const arc = scene.arcs[i]!
        if (!arc.primary) continue
        if (isHighlighted(arc.a) && isHighlighted(arc.b)) continue
        const pa = scene.positions[arc.a]!
        const pb = scene.positions[arc.b]!
        const pt = toArc(pa.x, pa.y, pb.x, pb.y)
        if (offscreen(pt.ax, pt.ay, pt.bx, pt.by)) continue
        traceCurvedArc(ctx, pt.ax, pt.ay, pt.bx, pt.by, (i % 2 === 0 ? 1 : -1) * 0.14)
      }
      ctx.stroke()

      ctx.lineWidth = 1.15
      ctx.strokeStyle = focus.activeCategory ? 'rgba(255, 206, 146, 0.42)' : 'rgba(178, 220, 255, 0.38)'
      ctx.beginPath()
      for (let i = 0; i < scene.arcs.length; i++) {
        const arc = scene.arcs[i]!
        if (!isHighlighted(arc.a) || !isHighlighted(arc.b)) continue
        const pa = scene.positions[arc.a]!
        const pb = scene.positions[arc.b]!
        const pt = toArc(pa.x, pa.y, pb.x, pb.y)
        if (offscreen(pt.ax, pt.ay, pt.bx, pt.by)) continue
        traceCurvedArc(ctx, pt.ax, pt.ay, pt.bx, pt.by, (i % 2 === 0 ? 1 : -1) * 0.14)
      }
      ctx.stroke()
    }

    // 2. 聚焦选中词条时的极简弯曲关联细丝（含退场过渡柔和渐隐）
    const neighborAnchoredPos = new Map<number, { x: number; y: number }>()
    const activeEdgeCallouts: Array<{ mx: number; my: number; label: string }> = []
    const isDeactivatingPull = !isSelectedFocus && (focusPullProgress > 0.01 || focusFadeProgress > 0.01) && pullTargetAnchor !== null

    const beamFocusIdx = isSelectedFocus ? focus.selectedIndex : isDeactivatingPull ? pullTargetIdx : null
    const beamAnchorPos = isSelectedFocus ? activeAnchorPos : isDeactivatingPull ? pullTargetAnchor : null

    if (beamFocusIdx !== null && beamAnchorPos) {
      const fx = toSx(beamAnchorPos.x)
      const fy = toSy(beamAnchorPos.y)
      const edgeItems =
        focus.focusEdges.length > 0
          ? focus.focusEdges
          : isSelectedFocus
            ? [...focus.focusNeighbors].map((nbIdx) => ({
                neighborIdx: nbIdx,
                weight: 2,
                explicit: false,
                reasonText: '',
              }))
            : [...pullTargets.keys()].map((nbIdx) => ({
                neighborIdx: nbIdx,
                weight: 2,
                explicit: false,
                reasonText: '',
              }))

      const now = performance.now()
      const motionOk = !prefersReducedMotion()
      const fadeK = Math.max(0, Math.min(1, isSelectedFocus ? Math.max(0.15, fadeMix) : fadeMix))

      for (let ni = 0; ni < edgeItems.length; ni++) {
        const item = edgeItems[ni]!
        const nbSlot = scene.positions[item.neighborIdx]
        if (!nbSlot) continue

        const pulledPos =
          pullTargetIdx === beamFocusIdx && focusPullProgress > 0.001
            ? getPulledNeighborWorldPos(item.neighborIdx)
            : null
        const nwx = pulledPos ? pulledPos.x : nbSlot.x
        const nwy = pulledPos ? pulledPos.y : nbSlot.y
        neighborAnchoredPos.set(item.neighborIdx, { x: nwx, y: nwy })

        const nx = toSx(nwx)
        const ny = toSy(nwy)
        const bend = (ni % 2 === 0 ? 1 : -1) * (0.14 + (ni % 3) * 0.03)
        const isSynced = focus.syncedHoverIndex === item.neighborIdx || (isSelectedFocus && focus.focusIndex === item.neighborIdx)

        ctx.globalAlpha = fadeK
        if (isSynced || item.explicit) {
          ctx.lineWidth = isSynced ? 4.4 : 2.4
          ctx.strokeStyle = isSynced ? 'rgba(255, 192, 114, 0.28)' : 'rgba(255, 174, 92, 0.13)'
          ctx.beginPath()
          traceCurvedArc(ctx, fx, fy, nx, ny, bend)
          ctx.stroke()
        }

        ctx.lineWidth = isSynced ? 1.55 : item.explicit ? 1.1 : 0.85
        ctx.strokeStyle = isSynced
          ? 'rgba(255, 224, 174, 0.96)'
          : item.explicit
            ? 'rgba(255, 196, 130, 0.68)'
            : 'rgba(196, 226, 255, 0.44)'
        ctx.beginPath()
        const mid = traceCurvedArc(ctx, fx, fy, nx, ny, bend)
        ctx.stroke()

        if (isSelectedFocus && motionOk) {
          const dx = nx - fx
          const dy = ny - fy
          const cpx = (fx + nx) / 2 - dy * bend
          const cpy = (fy + ny) / 2 + dx * bend
          const phase = (now * 0.00028 + ni * 0.21) % 1
          const pt = quadPoint(fx, fy, cpx, cpy, nx, ny, phase)
          const pulseAlpha = Math.sin(phase * Math.PI)
          ctx.fillStyle = isSynced || item.explicit ? '#ffd49b' : '#cde6ff'
          ctx.globalAlpha = pulseAlpha * (isSynced ? 0.9 : 0.48) * fadeK
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, isSynced ? 1.85 : 1.2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1

        if (isSelectedFocus && item.reasonText && isSynced) {
          activeEdgeCallouts.push({
            mx: mid.mx,
            my: mid.my,
            label: item.reasonText,
          })
        }
      }
    }
    ctx.restore()

    // 3. 单一天幕星点渲染（聚焦/退场过程中被拉近的邻接星于专属图层渲染）
    const labelCandidates = new Map<number, { x: number; y: number }>()
    const pulledActiveSet = pullTargetIdx === beamFocusIdx && (focusPullProgress > 0.005 || isSelectedFocus) ? pullTargets : null

    for (let i = 0; i < g.nodes.length; i++) {
      if (pulledActiveSet && pulledActiveSet.has(i)) continue

      const slot = scene.positions[i]!
      const wx = slot.x
      const wy = slot.y
      if (!inView(wx, wy)) continue

      const sx = toSx(wx)
      const sy = toSy(wy)
      if (sx < -36 || sx > w + 36 || sy < -36 || sy > h + 36) continue

      const node = g.nodes[i]!
      const isAnchoredCenter =
        (activeFocusIdx === i && (isSelectedFocus || hasHoverFocus)) ||
        (beamFocusIdx === i && dimBlend > 0.01)
      const isAnchoredNeighbor = neighborAnchoredPos.has(i)
      const isMatch = focus.matched.size > 0 && focus.matched.has(i)
      const isSynced = focus.syncedHoverIndex === i && (isAnchoredNeighbor || !activeAnchorPos)
      const highlighted = isSelectedFocus ? isAnchoredCenter : isHighlighted(i) || isAnchoredCenter

      labelCandidates.set(i, { x: wx, y: wy })

      // 筛选态下未命中项大幅弱化；聚焦态按 dimBlend 平滑过渡明暗
      if (isFilterMode && !highlighted) {
        ctx.globalAlpha = slot.starClass === 'primary' ? 0.14 : 0.055
        ctx.fillStyle = '#92b6dc'
        ctx.beginPath()
        ctx.arc(sx, sy, slot.starClass === 'primary' ? 1.35 : 0.85, 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      if (dimBlend > 0.01 && !isAnchoredCenter) {
        const targetBgAlpha = slot.starClass === 'primary' ? 0.28 : slot.starClass === 'sub' ? 0.18 : 0.11
        const normalAlpha =
          slot.starClass === 'primary'
            ? 0.96
            : slot.starClass === 'sub'
              ? 0.84
              : 0.28 + zoomReveal * 0.42
        const bgAlpha = normalAlpha + (targetBgAlpha - normalAlpha) * dimBlend
        const targetBgR = slot.starClass === 'primary' ? 1.8 : slot.starClass === 'sub' ? 1.28 : 0.92
        const baseNormR =
          slot.starClass === 'wanderer'
            ? (0.95 + zoomReveal * 0.7) * Math.min(1.28, Math.max(0.75, scale))
            : (slot.starClass === 'primary' ? 3.85 : 2.1) * Math.min(1.4, Math.max(0.84, Math.sqrt(scale)))
        const bgRadius = baseNormR + (targetBgR - baseNormR) * dimBlend

        ctx.globalAlpha = bgAlpha
        ctx.fillStyle = celestialTint(node.color, slot.starClass === 'primary' ? 0.45 : 0.7)
        ctx.beginPath()
        ctx.arc(sx, sy, bgRadius, 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      // 三等游离星：原来只有 0.28 透明度、太暗，几乎看不出是「点」。
      // 提到 0.42 起步 + 略微加大半径，并补一圈很淡的外晕，让它有存在感但不抢主星。
      if (slot.starClass === 'wanderer' && !isFilterMode && !isAnchoredCenter) {
        const wandR = (1.12 + zoomReveal * 0.8) * Math.min(1.28, Math.max(0.75, scale))
        // 外晕
        ctx.globalAlpha = 0.1 + zoomReveal * 0.12
        ctx.fillStyle = celestialTint(node.color, 0.6)
        ctx.beginPath()
        ctx.arc(sx, sy, wandR * 2.6, 0, Math.PI * 2)
        ctx.fill()
        // 核心
        ctx.globalAlpha = 0.44 + zoomReveal * 0.44
        ctx.fillStyle = celestialTint(node.color, 0.76)
        ctx.beginPath()
        ctx.arc(sx, sy, wandR, 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      const isPrimaryStar = slot.starClass === 'primary'
      const baseR = isPrimaryStar ? 3.85 : 2.1
      const scaledR = baseR * Math.min(1.4, Math.max(0.84, Math.sqrt(scale)))
      const r =
        isAnchoredCenter
          ? scaledR * (isSelectedFocus ? 1.48 : 1.52)
          : isSynced || isMatch
            ? scaledR * 1.36
            : isAnchoredNeighbor
              ? scaledR * 1.18
              : scaledR

      const starTone =
        isAnchoredCenter || isSynced || isMatch
          ? '#ffd9ae'
          : celestialTint(node.color, isPrimaryStar ? 0.34 : 0.5)

      if (isPrimaryStar || isAnchoredCenter || isAnchoredNeighbor || isMatch || isSynced || isFilterMode) {
        ctx.globalAlpha =
          isAnchoredCenter || isSynced ? 0.28 : isMatch ? 0.22 : isAnchoredNeighbor ? 0.14 : isPrimaryStar ? 0.13 : 0.08
        ctx.fillStyle = isAnchoredCenter || isSynced || isMatch ? '#ffa854' : starTone
        ctx.beginPath()
        ctx.arc(sx, sy, r * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha =
        isAnchoredCenter || isAnchoredNeighbor || isSynced || isMatch || isFilterMode
          ? 1
          : isPrimaryStar
            ? 0.96
            : 0.84
      ctx.fillStyle = starTone
      drawDiamond(ctx, sx, sy, r)
      ctx.fill()

      if (isPrimaryStar || isAnchoredCenter || isSynced || isMatch) {
        const arm = r * (isAnchoredCenter || isSynced || isMatch ? 3.05 : 2.55)
        ctx.globalAlpha = isAnchoredCenter || isSynced || isMatch ? 0.88 : 0.48
        ctx.lineWidth = isAnchoredCenter || isSynced || isMatch ? 0.88 : 0.65
        ctx.strokeStyle = isAnchoredCenter || isSynced || isMatch ? '#ffe6ca' : '#e6f2ff'
        drawStarFlare(ctx, sx, sy, arm, isAnchoredCenter || isSynced)
      }

      if (isAnchoredCenter || isSynced || isMatch) {
        ctx.globalAlpha = isAnchoredCenter ? 0.65 * Math.max(hasHoverFocus ? 1 : 0, fadeMix) : 0.82
        if (ctx.globalAlpha > 0.02) {
          ctx.lineWidth = isAnchoredCenter ? 1.05 : 1
          ctx.strokeStyle = isAnchoredCenter || isSynced ? '#ffb572' : '#ff8a2a'
          ctx.beginPath()
          ctx.arc(sx, sy, r + 4.2, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // 3b. 绘制已被拉近屏幕的关联星体（含退出聚焦平滑归位动画）
    if (pulledActiveSet && beamAnchorPos) {
      for (const [nbIdx] of pulledActiveSet) {
        const nbPos = neighborAnchoredPos.get(nbIdx) ?? getPulledNeighborWorldPos(nbIdx)
        if (!nbPos) continue
        const node = g.nodes[nbIdx]!
        const slot = scene.positions[nbIdx]!
        const sx = toSx(nbPos.x)
        const sy = toSy(nbPos.y)
        const isSynced = focus.syncedHoverIndex === nbIdx || (isSelectedFocus && focus.focusIndex === nbIdx)
        const isMatch = focus.matched.size > 0 && focus.matched.has(nbIdx)

        const baseR = slot.magnitude === 1 ? 3.3 : slot.magnitude === 2 ? 2.65 : 2.1
        const scaledR = baseR * Math.min(1.28, Math.max(0.9, Math.sqrt(scale)))
        const r = isSynced || isMatch ? scaledR * 1.4 : scaledR
        const starTone = isSynced || isMatch ? '#ffd9ae' : celestialTint(node.color, 0.36)
        const ringFade = isSelectedFocus ? Math.max(0.25, fadeMix) : fadeMix

        ctx.globalAlpha = (isSynced ? 0.28 : 0.1) * ringFade
        ctx.fillStyle = isSynced || isMatch ? '#ffa854' : starTone
        ctx.beginPath()
        ctx.arc(sx, sy, r * 2.3, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = Math.max(0.35, ringFade)
        ctx.fillStyle = starTone
        drawDiamond(ctx, sx, sy, r)
        ctx.fill()

        const arm = r * (isSynced ? 3.1 : 2.1)
        ctx.globalAlpha = (isSynced ? 0.88 : 0.36) * ringFade
        ctx.lineWidth = isSynced ? 0.9 : 0.65
        ctx.strokeStyle = isSynced ? '#ffe6ca' : '#dceeff'
        drawStarFlare(ctx, sx, sy, arm, isSynced)

        if (isSynced || isMatch) {
          ctx.globalAlpha = 0.78 * ringFade
          ctx.lineWidth = 1.0
          ctx.strokeStyle = '#ffb572'
          ctx.beginPath()
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1

    // 4. 星名注记：聚焦态极简仅显当前点与关联点；总览仅主星，放大依次解锁副星与三等游离星
    ctx.font = '500 11.5px "Noto Sans SC", system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3.4
    ctx.strokeStyle = 'rgba(3, 5, 11, 0.95)'

    const boxes: Array<[number, number, number, number]> = []

    const drawSmartLabel = (
      idx: number,
      wx: number,
      wy: number,
      color: string,
      opts: { force?: boolean; anchorSx?: number; isCenter?: boolean; bold?: boolean; alpha?: number } = {},
    ) => {
      const node = g.nodes[idx]!
      const sxStar = toSx(wx)
      const syStar = toSy(wy)
      if (sxStar < 8 || sxStar > w - 8 || syStar < 12 || syStar > h - 12) return

      ctx.save()
      if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha
      if (opts.bold) {
        ctx.font = '600 13px "Noto Sans SC", system-ui, -apple-system, sans-serif'
      }
      const tw = ctx.measureText(node.title).width
      const rightLimit = isSelectedFocus && w >= 1024 ? w - Math.min(392, w * 0.34) - 24 : w - 12

      let placeLeft =
        !opts.isCenter &&
        opts.anchorSx !== undefined &&
        (sxStar < opts.anchorSx - 18 || sxStar + tw + 24 > rightLimit)
      if (placeLeft && sxStar - 11 - tw < 12 && sxStar + 11 + tw <= rightLimit) {
        placeLeft = false
      } else if (!placeLeft && !opts.isCenter && sxStar + 11 + tw > rightLimit && sxStar - 11 - tw >= 12) {
        placeLeft = true
      }

      const baseSy = opts.isCenter ? syStar - 16 : syStar
      let sxText = opts.isCenter ? sxStar : placeLeft ? sxStar - 11 : sxStar + 11
      if (!opts.isCenter) {
        if (placeLeft) sxText = Math.max(tw + 12, sxText)
        else sxText = Math.min(rightLimit - tw, sxText)
      }
      ctx.textAlign = opts.isCenter ? 'center' : placeLeft ? 'right' : 'left'

      const boxX = opts.isCenter ? sxText - tw / 2 - 6 : placeLeft ? sxText - tw - 6 : sxText - 6
      const boxIntersects = (b0: [number, number, number, number]) =>
        boxes.some((b) => b0[0] < b[0] + b[2] && b0[0] + b0[2] > b[0] && b0[1] < b[1] + b[3] && b0[1] + b0[3] > b[1])

      let sy = baseSy
      let box: [number, number, number, number] = [boxX - 2, sy - 13, tw + 16, 26]
      if (opts.force && !opts.isCenter) {
        for (const dyOff of [0, -14, 14, -26, 26, -38, 38]) {
          const candSy = Math.max(18, Math.min(h - 18, baseSy + dyOff))
          const candBox: [number, number, number, number] = [boxX - 2, candSy - 13, tw + 16, 26]
          if (!boxIntersects(candBox)) {
            sy = candSy
            box = candBox
            break
          }
        }
      } else if (!opts.force && boxIntersects(box)) {
        ctx.restore()
        return
      }
      boxes.push(box)
      ctx.strokeText(node.title, sxText, sy)
      ctx.fillStyle = color
      ctx.fillText(node.title, sxText, sy)
      ctx.restore()
    }

    if (beamFocusIdx !== null && beamAnchorPos && (isSelectedFocus || dimBlend > 0.12)) {
      const lblAlpha = Math.max(0.08, Math.min(1, isSelectedFocus ? Math.max(0.25, fadeMix) : fadeMix))
      const anchorSx = toSx(beamAnchorPos.x)
      drawSmartLabel(beamFocusIdx, beamAnchorPos.x, beamAnchorPos.y, 'rgba(255, 242, 224, 0.99)', {
        force: true,
        isCenter: true,
        bold: true,
        alpha: lblAlpha,
      })

      for (const [nbIdx, nbPos] of neighborAnchoredPos) {
        const isSynced = focus.syncedHoverIndex === nbIdx || focus.focusIndex === nbIdx
        drawSmartLabel(
          nbIdx,
          nbPos.x,
          nbPos.y,
          isSynced ? 'rgba(255, 220, 174, 0.99)' : 'rgba(232, 242, 255, 0.88)',
          { force: true, anchorSx, bold: isSynced, alpha: lblAlpha },
        )
      }
    } else {
      const LABEL_MAX =
        focus.matched.size > 0
          ? 24
          : focus.activeCategory
            ? 24
            : scale >= 1.32
              ? 76
              : scale >= 0.96
                ? 48
                : 28

      const drawNonFocusLabel = (
        idx: number,
        wx: number,
        wy: number,
        color: string,
        force = false,
        bold = false,
        alpha?: number,
      ) => {
        if (!force && boxes.length >= LABEL_MAX) return
        drawSmartLabel(idx, wx, wy, color, { force, bold, alpha })
      }

      if (hasHoverFocus && activeFocusIdx !== null && activeAnchorPos) {
        drawNonFocusLabel(activeFocusIdx, activeAnchorPos.x, activeAnchorPos.y, 'rgba(255, 240, 218, 0.98)', true, true)
      }

      for (const idx of focus.matched) {
        if (boxes.length >= LABEL_MAX) break
        const c = labelCandidates.get(idx)
        if (c) drawNonFocusLabel(idx, c.x, c.y, 'rgba(255, 255, 255, 0.94)')
      }

      if (focus.activeCategory) {
        for (const idx of rankedIndices) {
          if (boxes.length >= LABEL_MAX) break
          if (!isCategoryHit(idx)) continue
          const c = labelCandidates.get(idx)
          if (c) drawNonFocusLabel(idx, c.x, c.y, 'rgba(240, 246, 255, 0.88)')
        }
      } else {
        // 初始仅一等主星显示名称
        for (const idx of rankedIndices) {
          if (boxes.length >= LABEL_MAX) break
          const slot = scene.positions[idx]
          if (!slot || slot.starClass !== 'primary') continue
          const pos = labelCandidates.get(idx)
          if (pos) drawNonFocusLabel(idx, pos.x, pos.y, 'rgba(224, 237, 255, 0.78)')
        }
        // 中等放大渐显二等副星名称（起步即保持可读透明度，避免低透灰影）
        if (scale > 0.96) {
          const subFade = Math.min(1, 0.28 + ((scale - 0.96) / 0.36) * 0.72)
          for (const idx of rankedIndices) {
            if (boxes.length >= LABEL_MAX) break
            const slot = scene.positions[idx]
            if (!slot || slot.starClass !== 'sub') continue
            const pos = labelCandidates.get(idx)
            if (pos) drawNonFocusLabel(idx, pos.x, pos.y, 'rgba(202, 222, 246, 0.72)', false, false, subFade)
          }
        }
        // 放大时适当展示三等游离星标题（清淡星芒小字，绝不遮挡主副星）
        if (scale > 1.32) {
          const wanderFade = Math.min(0.85, 0.24 + ((scale - 1.32) / 0.42) * 0.61)
          for (const idx of rankedIndices) {
            if (boxes.length >= LABEL_MAX) break
            const slot = scene.positions[idx]
            if (!slot || slot.starClass !== 'wanderer') continue
            const pos = labelCandidates.get(idx)
            if (pos) drawNonFocusLabel(idx, pos.x, pos.y, 'rgba(182, 208, 238, 0.66)', false, false, wanderFade)
          }
        }
      }
    }

    // 5. 关联丝线语义注记徽章
    if (activeEdgeCallouts.length) {
      ctx.save()
      ctx.font = '500 10px "Noto Sans SC", system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3.6
      ctx.strokeStyle = 'rgba(3, 5, 11, 0.94)'
      for (const callout of activeEdgeCallouts) {
        ctx.strokeText(callout.label, callout.mx, callout.my - 10)
        ctx.fillStyle = 'rgba(255, 224, 184, 0.94)'
        ctx.fillText(callout.label, callout.mx, callout.my - 10)
      }
      ctx.restore()
    }
  }

  // ── 指针与深空星图拖拽 / 缩放 / 点空白退出聚焦交互 ──
  const activePointers = new Map<number, { x: number; y: number }>()
  let dragMoved = false
  let lastSingle = { x: 0, y: 0 }
  let lastPinchDist = 0

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopAnim()
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)

    if (activePointers.size === 1) {
      dragMoved = false
      lastSingle = { x: e.clientX, y: e.clientY }
    } else if (activePointers.size === 2) {
      dragMoved = true
      const pts = [...activePointers.values()]
      lastPinchDist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y)
    }
  }

  function onPointerMove(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (activePointers.size === 2) {
        const pts = [...activePointers.values()]
        const dist = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y)
        const midX = (pts[0]!.x + pts[1]!.x) / 2 - rect.left
        const midY = (pts[0]!.y + pts[1]!.y) / 2 - rect.top
        if (lastPinchDist > 1 && dist > 1) zoomBy(dist / lastPinchDist, midX, midY)
        lastPinchDist = dist
        return
      }

      if (activePointers.size === 1) {
        const dx = e.clientX - lastSingle.x
        const dy = e.clientY - lastSingle.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          dragMoved = true
          userAdjustedCamera = true
        }
        view.ox += dx
        view.oy += dy
        clampCamera()
        lastSingle = { x: e.clientX, y: e.clientY }
        requestDraw()
        return
      }
    }

    if (e.pointerType === 'mouse') {
      const hit = hitTest(sx, sy, 'mouse')
      const node = hit && graph ? graph.nodes[hit.idx]! : null
      canvas.style.cursor = hit ? 'pointer' : 'grab'
      callbacks.onHoverChange?.(node, sx, sy)
    }
  }

  function onPointerUp(e: PointerEvent) {
    const wasSingleTap =
      activePointers.size === 1 && !dragMoved && (e.pointerType !== 'mouse' || e.button === 0)
    activePointers.delete(e.pointerId)
    if (activePointers.size === 1) {
      const rem = [...activePointers.values()][0]!
      lastSingle = { x: rem.x, y: rem.y }
    } else if (activePointers.size < 2) {
      lastPinchDist = 0
    }

    if (!wasSingleTap) return
    const rect = canvas.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, e.pointerType)
    if (hit && graph) {
      callbacks.onSelect?.(graph.nodes[hit.idx]!)
    } else if (focus.selectedIndex !== null) {
      callbacks.onBackgroundClick?.()
    }
  }

  function onPointerCancel(e: PointerEvent) {
    activePointers.delete(e.pointerId)
    lastPinchDist = 0
  }

  function onPointerLeave() {
    if (activePointers.size === 0) {
      canvas.style.cursor = 'grab'
      callbacks.onHoverChange?.(null, 0, 0)
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top)
  }

  function onDblClick(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top, 'mouse')
    if (!hit && focus.selectedIndex === null) fitToView(true)
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('dblclick', onDblClick)

  return {
    setGraph(nextGraph: WordGraph, ranked: number[], sky: ConstellationsLayoutResult) {
      graph = nextGraph
      rankedIndices = ranked
      skyScene = sky
      userAdjustedCamera = false
      selectedAnchorWorld = null
      focusPullProgress = 0
      focusFadeProgress = 0
      pullTargets.clear()
      pullTargetIdx = null
      pullTargetAnchor = null
      const cam = computeOverviewCamera()
      if (cam) animateTransition(cam, 0, 0, false)
    },
    setFocusState(next: RenderFocusState) {
      const prevSelected = focus.selectedIndex
      const prevEdges = focus.focusEdges
      focus = next
      if (next.selectedIndex === null) {
        pendingFocusScale = null
      } else if (
        selectedAnchorWorld &&
        selectedAnchorWorld.idx === next.selectedIndex &&
        (next.selectedIndex !== prevSelected || next.focusEdges !== prevEdges)
      ) {
        const w = Math.max(320, canvas.width / dpr)
        const ratioX = activeFocusOptions.offsetRatioX ?? (w < 1024 ? 0.5 : 0.39)
        const ratioY = activeFocusOptions.offsetRatioY ?? (w < 1024 ? 0.28 : 0.5)
        rebuildPullTargets(next.selectedIndex, selectedAnchorWorld, pendingFocusScale ?? view.scale, ratioX, ratioY)
      }
      if (next.selectedIndex !== prevSelected) ensureFocusPulse()
      requestDraw()
    },
    focusStar,
    resize,
    requestDraw,
    fitToView,
    zoomBy,
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      stopAnim()
      stopFocusPulse()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDblClick)
    },
  }
}
