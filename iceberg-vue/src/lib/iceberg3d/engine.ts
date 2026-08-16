import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import gsap from 'gsap'
import type { IcebergData, IcebergItem } from '../data'
import { NEW_MARK_WINDOW_DAYS } from '../filterStore'
import { mulberry32, ValueNoise3D, fbm } from './prng'
import { createGemMaterial, createIceMaterial } from './materials'
import { pickInstance, getInstanceWorldPos, type RingData, type PickHit } from './picking'
import { reportError } from '../report'
import { CameraFlight, type FocusState } from './cameraFlight'

export type { FocusState } from './cameraFlight'

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export interface EngineOptions {
  container: HTMLElement
  data: IcebergData
  /** 聚焦状态变化（聚焦 / 退出聚焦），供 UI 与 URL 同步 */
  onFocusChange: (focus: FocusState | null) => void
  /** 首帧渲染完成（隐藏 loading） */
  onReady: () => void
  /** WebGL 不可用 / 上下文丢失 */
  onError: () => void
}

/** 冰色色调：分类色去饱和后与冰蓝混合，让宝石融入冰场氛围 */
const ICE_TINT = { r: 0.85, g: 0.9, b: 0.95 }

/** 聚焦追踪目标：用全局词条实例身份持续更新光环世界位置。 */
interface FocusTarget {
  mesh: THREE.InstancedMesh
  id: number
}

function desaturate(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255
  const g = ((hex >> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255
  const dr = Math.round((r * 0.2 + ICE_TINT.r * 0.8) * 255)
  const dg = Math.round((g * 0.2 + ICE_TINT.g * 0.8) * 255)
  const db = Math.round((b * 0.2 + ICE_TINT.b * 0.8) * 255)
  return (dr << 16) | (dg << 8) | db
}

/**
 * 3D 冰山引擎：场景构建 / 拾取 / 聚焦 / 渲染循环 / 资源清理。
 * 架构分层（对应 lib/iceberg3d/ 各模块）：
 * - materials   词条碎片 Shader 与低多边形冰材质
 * - picking     两级拾取（InstancedMesh 包围球 + 逐实例）
 * - cameraFlight  GSAP 弧线运镜 + 视锥偏移
 * - prng        种子化噪声（冰山造型/布局确定性）
 */
export class Iceberg3DEngine {
  /** 布局种子：固定值保证每次加载布局一致 */
  private static readonly SEED = 20260801

  static supportsWebGL2(): boolean {
    try {
      const canvas = document.createElement('canvas')
      return !!canvas.getContext('webgl2')
    } catch {
      return false
    }
  }

  get focusedId(): string | null {
    return this.currentFocusItemId
  }

  private container: HTMLElement
  private data: IcebergData
  private onFocusChange: (focus: FocusState | null) => void
  private onReady: () => void
  private onError: () => void

  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private controls!: OrbitControls
  private composer!: EffectComposer
  private timer = new THREE.Timer()
  private flight!: CameraFlight
  private animationId = 0
  private renderPaused = false
  private disposed = false

  private icebergGroup!: THREE.Group
  private rings: RingData[] = []

  private gemGeos: THREE.BufferGeometry[] = []
  private focusRing!: THREE.Group
  private focusScene!: THREE.Scene
  private iceDust!: THREE.Points
  private focusTargetMesh: FocusTarget | null = null
  private currentFocusInstance: PickHit | null = null
  private currentHoverInstance: PickHit | null = null
  private currentFocusItemId: string | null = null

  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private needsPick = false
  private coarsePointer = false
  private pointerInside = false
  private nextHoverPickElapsed = 0

  // perf：拾取位移阈值 —— pointermove 微动（<4px）不触发全量射线扫描
  private lastPickX = 0
  private lastPickY = 0
  private hasPickPos = false

  // 交互状态：区分拖拽与点击
  private pointerDownPos = new THREE.Vector2()
  private _dragVec = new THREE.Vector2()
  private isPointerDown = false
  private isDragging = false
  private lastInteractionElapsed = 0

  // 聚焦光环的 GSAP 动画目标
  private ringPosObj = { x: 0, y: 0, z: 0 }
  private ringScaleObj = { s: 0 }
  private ringPosAnimating = false

  // 资源追踪（dispose 时统一清理）
  private trackedGeos: THREE.BufferGeometry[] = []
  private trackedMats: THREE.Material[] = []
  private trackedMeshes: THREE.InstancedMesh[] = []

  constructor(options: EngineOptions) {
    this.container = options.container
    this.data = options.data
    this.onFocusChange = options.onFocusChange
    this.onReady = options.onReady
    this.onError = options.onError
  }

  init(): void {
    const { width, height } = this.container.getBoundingClientRect()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.container.appendChild(this.renderer.domElement)
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)

    this.scene = new THREE.Scene()
    this.scene.background = null
    this.scene.fog = new THREE.FogExp2(0x04101c, 0.015)

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
    this.camera.position.set(12, 7, 18)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxDistance = 80
    this.controls.minDistance = 2
    this.controls.enablePan = true
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }

    this.flight = new CameraFlight(this.camera, this.controls, this.container)

    // 入场镜头：从更远的深空缓慢推近到主体，增强电影感；reduced-motion 下直接到位
    if (!prefersReducedMotion()) {
      const introFrom = new THREE.Vector3(18, 11, 26)
      gsap.fromTo(this.camera.position,
        { x: introFrom.x, y: introFrom.y, z: introFrom.z },
        { x: 12, y: 7, z: 18, duration: 2.2, ease: 'power2.out' })
    }
    this.coarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

    // 保留色彩输出处理；加入极克制的 Bloom，让橙色聚焦环与高亮宝石有一层柔和光晕。
    const renderScene = new RenderPass(this.scene, this.camera)
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.22, 0.5, 0.55)
    const outputPass = new OutputPass()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(renderScene)
    this.composer.addPass(bloomPass)
    this.composer.addPass(outputPass)

    this.scene.add(new THREE.AmbientLight(0x0a2a4a, 1.0))
    const mainLight = new THREE.DirectionalLight(0xffb36f, 1.4)
    mainLight.position.set(10, 20, 10)
    this.scene.add(mainLight)
    const rimLight = new THREE.DirectionalLight(0x7db5dc, 3.5)
    rimLight.position.set(-15, 5, -20)
    this.scene.add(rimLight)

    this.buildIceberg()
    this.buildGems()
    this.buildFocusRing()
    this.buildStars()
    this.buildIceDust()

    this.container.addEventListener('pointerdown', this.onPointerDown)
    this.container.addEventListener('pointermove', this.onPointerMove)
    this.container.addEventListener('pointerup', this.onPointerUp)
    this.container.addEventListener('pointerleave', this.onPointerLeave)
    this.container.addEventListener('pointercancel', this.onPointerCancel)
    window.addEventListener('resize', this.onResize)

    requestAnimationFrame(() => this.onReady())
    this.animate()
  }

  // ── 场景构建 ──

  /** 低多边形冰山：种子化 fbm 噪声做表面起伏（低频 + 高频两层），上下锥形 taper */
  private sculptIceberg(geometry: THREE.BufferGeometry, noise: ValueNoise3D) {
    const pos = geometry.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = fbm(noise, v.x * 1.1, v.y * 1.3, v.z * 1.1, 3) * 0.22
      v.multiplyScalar(1 + n)

      const heightRatio = Math.abs(v.y) / 2.5
      const taper = Math.max(0, 1.2 - heightRatio * 1.1)
      if (v.y > 0) {
        v.x *= taper * 0.75
        v.z *= taper * 0.75
        v.y *= 1.8
      } else {
        v.x *= taper * 1.15
        v.z *= taper * 1.15
        v.y *= 4.5
      }
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geometry.computeVertexNormals()
  }

  private buildIceberg() {
    const rng = mulberry32(Iceberg3DEngine.SEED)
    const noise = new ValueNoise3D(Iceberg3DEngine.SEED ^ 0x1ce)
    this.icebergGroup = new THREE.Group()

    const iceMaterial = createIceMaterial()
    this.trackedMats.push(iceMaterial)

    const coreGeo = new THREE.IcosahedronGeometry(2.0, 2)
    this.trackedGeos.push(coreGeo)
    this.sculptIceberg(coreGeo, noise)

    // 冰体顶点色：上方冰蓝 → 中层深海蓝 → 下方纯黑，形成「冰面受光、水下坠入深渊」的纵深感
    const icePos = coreGeo.attributes.position
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < icePos.count; i++) {
      const y = icePos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const iceSpan = (maxY - minY) || 1
    const iceColors = new Float32Array(icePos.count * 3)
    const cTop = new THREE.Color(0xbfd9f2)
    const cMid = new THREE.Color(0x0a5a99)
    const cBottom = new THREE.Color(0x020408)
    const tmpColor = new THREE.Color()
    for (let i = 0; i < icePos.count; i++) {
      const t = (icePos.getY(i) - minY) / iceSpan
      if (t < 0.45) tmpColor.copy(cBottom).lerp(cMid, t / 0.45)
      else tmpColor.copy(cMid).lerp(cTop, (t - 0.45) / 0.55)
      iceColors[i * 3] = tmpColor.r
      iceColors[i * 3 + 1] = tmpColor.g
      iceColors[i * 3 + 2] = tmpColor.b
    }
    coreGeo.setAttribute('color', new THREE.BufferAttribute(iceColors, 3))

    const coreMesh = new THREE.Mesh(coreGeo, iceMaterial)
    this.icebergGroup.add(coreMesh)

    // 碎冰环：随机散布在冰山周围，各自缓慢自转
    for (let i = 0; i < 24; i++) {
      const size = 0.05 + rng() * 0.12
      const chunkGeo = new THREE.OctahedronGeometry(size, 0)
      this.trackedGeos.push(chunkGeo)
      const chunk = new THREE.Mesh(chunkGeo, iceMaterial)
      chunk.scale.set(1 + rng() * 0.5, 2 + rng() * 2.5, 1 + rng() * 0.5)
      const angle = rng() * Math.PI * 2
      const dist = 3.5 + rng() * 4.5
      const height = (rng() - 0.5) * 6.0
      chunk.position.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist)
      chunk.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
      chunk.userData = {
        rotSpeedX: (rng() - 0.5) * 0.002,
        rotSpeedY: (rng() - 0.5) * 0.002,
      }
      this.icebergGroup.add(chunk)
    }
    this.scene.add(this.icebergGroup)
  }

  /** 宝石轨道：每层一个 Group 绕 Y 轴旋转；每条词条 = 3 个共享几何 InstancedMesh 之一 + 1 个隐形命中球 */
  private buildGems() {
    const ringsGroup = new THREE.Group()
    ringsGroup.rotation.x = Math.PI * 0.1
    ringsGroup.rotation.z = -Math.PI * 0.05

    this.gemGeos.push(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0),
    )
    this.gemGeos.forEach((g) => this.trackedGeos.push(g))

    const categoryColors: Record<string, number> = {}
    const saturatedCategoryColors: Record<string, number> = {}
    if (this.data.categoryColors) {
      for (const [cat, hex] of Object.entries(this.data.categoryColors)) {
        const rawColor = parseInt(hex.replace('#', ''), 16)
        categoryColors[cat] = desaturate(rawColor)
        saturatedCategoryColors[cat] = rawColor
      }
    }

    const tierOrder = this.data.tierOrder || Object.keys(this.data.tiers)

    // 命中球：半径 0.5，比宝石略大，隐形专用拾取（不参与渲染）
    const hitGeo = new THREE.SphereGeometry(0.5, 8, 8)
    this.trackedGeos.push(hitGeo)
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    this.trackedMats.push(hitMat)

    const gemMat = createGemMaterial()
    this.trackedMats.push(gemMat)

    const defaultColor = new THREE.Color()
    const dummy = new THREE.Object3D()
    const rng = mulberry32(Iceberg3DEngine.SEED ^ 0x9e5)
    const newCutoff = Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 24 * 60 * 60

    tierOrder.forEach((tierName, ti) => {
      const items = this.data.tiers[tierName] || []
      const count = items.length
      if (count === 0) return

      const radius = 5.0 + ti * 2.8
      const baseScale = ti < 3 ? 0.09 : ti < 5 ? 0.07 : 0.06

      const orbitGroup = new THREE.Group()
      orbitGroup.userData = {
        rotateSpeed: (rng() > 0.5 ? 1 : -1) * (0.0007 + rng() * 0.0007) / (ti + 1),
      }

      const visibleMeshes = this.gemGeos.map((geo) => {
        const mesh = new THREE.InstancedMesh(geo, gemMat, count)
        orbitGroup.add(mesh)
        return mesh
      })
      const hiddenHitMesh = new THREE.InstancedMesh(hitGeo, hitMat, count)
      visibleMeshes.forEach((m) => this.trackedMeshes.push(m))
      this.trackedMeshes.push(hiddenHitMesh)

      const scales: number[] = []
      const colors: number[] = []
      const brightColors: number[] = []
      const newFlags: boolean[] = []
      const visibleItemIds: number[][] = [[], [], []]
      const geoCounts = [0, 0, 0]

      items.forEach((item, i) => {
        const angle = (i / count) * Math.PI * 2 + rng() * 0.15
        const yOffset = (rng() - 0.5) * 2.0
        const x = Math.cos(angle) * (radius + (rng() - 0.5) * 2.0)
        const z = Math.sin(angle) * (radius + (rng() - 0.5) * 2.0)

        const isNew = (item.modifiedAt || 0) >= newCutoff
        const catColor = categoryColors[item.category] || 0xffffff
        const brightColor = saturatedCategoryColors[item.category] || 0xffffff
        newFlags.push(isNew)
        // 最近修改词条使用高饱和分类色作为常态底色，便于识别与发光
        colors.push(isNew ? brightColor : catColor)
        brightColors.push(brightColor)
        scales.push(baseScale)

        dummy.position.set(x, yOffset, z)
        dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)
        dummy.scale.set(
          baseScale * (0.6 + rng() * 0.9),
          baseScale * (0.3 + rng() * 0.8),
          baseScale * (0.6 + rng() * 0.9),
        )
        dummy.updateMatrix()

        const geoIdx = i % 3
        const localIdx = geoCounts[geoIdx]
        visibleMeshes[geoIdx].setMatrixAt(localIdx, dummy.matrix)
        // 编码：普通 0–1，最近修改 +1，Hover/Focus 由 setInstanceHoverColor 再 +2
        defaultColor.setHex(isNew ? brightColor : catColor)
        if (isNew) defaultColor.addScalar(1)
        visibleMeshes[geoIdx].setColorAt(localIdx, defaultColor)
        visibleItemIds[geoIdx][localIdx] = i
        geoCounts[geoIdx]++

        // 命中球与宝石同位置、单位缩放（拾取时用等大的球体方便命中）
        dummy.scale.setScalar(1.0)
        dummy.updateMatrix()
        hiddenHitMesh.setMatrixAt(i, dummy.matrix)
      })

      // 未使用槽位：缩放到 0 并归位，包围球不膨胀
      for (let gi = 0; gi < 3; gi++) {
        for (let ui = geoCounts[gi]; ui < count; ui++) {
          dummy.position.set(0, 0, 0)
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          visibleMeshes[gi].setMatrixAt(ui, dummy.matrix)
        }
        visibleMeshes[gi].count = geoCounts[gi]
        visibleMeshes[gi].instanceMatrix.needsUpdate = true
        if (visibleMeshes[gi].instanceColor) {
          ;(visibleMeshes[gi].instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true
        }
        visibleMeshes[gi].computeBoundingSphere()
      }

      orbitGroup.add(hiddenHitMesh)
      // 关键：命中球一次性计算实例包围球 → three 原生 raycast 先做整圈剔除（两级拾取第一层）
      hiddenHitMesh.computeBoundingSphere()

      this.rings.push({
        hitMesh: hiddenHitMesh,
        items,
        group: orbitGroup,
        baseScales: scales,
        colors,
        brightColors,
        newFlags,
        visibleMeshes,
        visibleItemIds,
      })
      ringsGroup.add(orbitGroup)
    })
    this.scene.add(ringsGroup)
  }

  /** 聚焦取景框：相机式四角括号（左上/左下/右上/右下），白色加粗薄片 */
  private buildFocusRing() {
    const group = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
    this.trackedMats.push(mat)

    const half = 0.62
    const corner = 0.26
    const thick = 0.05

    const addCorner = (sx: number, sy: number) => {
      // 外边缘对齐：横向条贴住上/下边，竖向条贴住左/右边，角部形成实心重叠
      const hGeo = new THREE.BoxGeometry(corner, thick, 0.02)
      const h = new THREE.Mesh(hGeo, mat)
      h.position.set(sx * (half - corner / 2), sy * (half - thick / 2), 0)
      h.renderOrder = 999
      group.add(h)
      this.trackedGeos.push(hGeo)

      const vGeo = new THREE.BoxGeometry(thick, corner, 0.02)
      const v = new THREE.Mesh(vGeo, mat)
      v.position.set(sx * (half - thick / 2), sy * (half - corner / 2), 0)
      v.renderOrder = 999
      group.add(v)
      this.trackedGeos.push(vGeo)
    }

    addCorner(-1, 1)  // 左上
    addCorner(1, 1)   // 右上
    addCorner(-1, -1) // 左下
    addCorner(1, -1)  // 右下

    this.focusRing = group
    this.focusRing.renderOrder = 999
    this.focusRing.visible = false
    this.focusScene = new THREE.Scene()
    this.focusScene.add(this.focusRing)
  }

  /** 渐变星空：在远处球壳撒冰蓝/白/少量暖橙星点，配合 CSS 渐变背景 */
  private buildStars() {
    const count = 700
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const rng = mulberry32(Iceberg3DEngine.SEED ^ 0x5a7)
    const color = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      const r = 70 + rng() * 60
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      // 大部分冰蓝/白，少量暖橙作为「落日余晖里的星」
      const warm = rng() < 0.08
      if (warm) color.setHex(0xffb36f)
      else color.setHex(rng() < 0.5 ? 0xbfd9f2 : 0xffffff)
      const brightness = 0.5 + rng() * 0.5
      colors[i * 3] = color.r * brightness
      colors[i * 3 + 1] = color.g * brightness
      colors[i * 3 + 2] = color.b * brightness
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false,
    })
    const stars = new THREE.Points(geo, mat)
    stars.frustumCulled = false
    this.trackedGeos.push(geo)
    this.trackedMats.push(mat)
    this.scene.add(stars)
  }

  /** 冰山周围的冰尘：近距离细小粒子，缓慢旋转增加深海悬浮感 */
  private buildIceDust() {
    const count = 320
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const rng = mulberry32(Iceberg3DEngine.SEED ^ 0x3c1)
    const color = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      const r = 4 + rng() * 14
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.7
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

      const warm = rng() < 0.06
      if (warm) color.setHex(0xffb36f)
      else color.setHex(rng() < 0.6 ? 0xbfd9f2 : 0xffffff)
      const brightness = 0.35 + rng() * 0.45
      colors[i * 3] = color.r * brightness
      colors[i * 3 + 1] = color.g * brightness
      colors[i * 3 + 2] = color.b * brightness
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
      fog: false,
    })
    this.iceDust = new THREE.Points(geo, mat)
    this.iceDust.frustumCulled = false
    this.trackedGeos.push(geo)
    this.trackedMats.push(mat)
    this.scene.add(this.iceDust)
  }

  // ── 拾取与高亮 ──

  private updateHover() {
    if (!this.container) return
    const rect = this.container.getBoundingClientRect()
    const hit = pickInstance(
      this.rings,
      this.raycaster,
      this.camera,
      this.mouse,
      rect,
      this.coarsePointer,
    )
    if (hit) {
      if (
        !this.currentHoverInstance ||
        this.currentHoverInstance.mesh !== hit.mesh ||
        this.currentHoverInstance.id !== hit.id
      ) {
        this.unhighlight()
        this.currentHoverInstance = hit
        this.setInstanceHoverColor(hit, true)
      }
      this.container.style.cursor = 'crosshair'
    } else {
      this.unhighlight()
      this.currentHoverInstance = null
      this.container.style.cursor = this.flight.isFocusMode ? 'pointer' : 'grab'
    }
  }

  private setInstanceHoverColor(hit: PickHit, active: boolean) {
    const isFocused =
      this.currentFocusInstance?.mesh === hit.mesh && this.currentFocusInstance.id === hit.id
    const highlighted = active || isFocused
    const mapData = this.rings.find((ring) => ring.hitMesh === hit.mesh)
    if (!mapData) return
    const geometryIndex = hit.id % 3
    const localIndex = Math.floor(hit.id / 3)
    const mesh = mapData.visibleMeshes[geometryIndex]
    const color = new THREE.Color(highlighted ? hit.brightColor : hit.color)
    if (highlighted) {
      color.offsetHSL(0, 0.16, 0.05).addScalar(2)
    } else if (mapData.newFlags[hit.id]) {
      color.addScalar(1)
    }
    mesh.setColorAt(localIndex, color)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  private unhighlight() {
    if (this.currentHoverInstance) this.setInstanceHoverColor(this.currentHoverInstance, false)
  }

  // ── 聚焦 / 退出 ──

  private focusFromPick(hit: PickHit) {
    const mapData = this.rings.find((r) => r.hitMesh === hit.mesh)!
    if (this.currentHoverInstance) {
      this.unhighlight()
      this.currentHoverInstance = null
    }
    if (this.currentFocusInstance) {
      const previousFocus = this.currentFocusInstance
      this.currentFocusInstance = null
      this.setInstanceHoverColor(previousFocus, false)
    }
    this.currentFocusInstance = hit
    this.setInstanceHoverColor(hit, true)

    mapData.group.updateMatrixWorld(true)
    const worldPos = getInstanceWorldPos(hit.mesh, hit.id, mapData.group)

    this.focusTargetMesh = { mesh: hit.mesh, id: hit.id }
    this.showFocusRing(worldPos, mapData.baseScales[hit.id])

    const focus: FocusState = {
      item: mapData.items[hit.id],
      worldPos,
      baseScale: mapData.baseScales[hit.id],
      tierColor: hit.color || 0xffffff,
    }
    this.currentFocusItemId = focus.item.id
    this.controls.autoRotate = false
    this.flight.focus(focus)
    this.onFocusChange(focus)
  }

  /** 聚焦光环动画：位置平滑过渡 + 从 0 弹入 */
  private showFocusRing(worldPos: THREE.Vector3, baseScale: number) {
    const wasVisible = this.focusRing.visible
    const oldPos = this.focusRing.position.clone()
    this.focusRing.userData.baseScale = baseScale
    this.focusRing.visible = true
    this.focusRing.quaternion.copy(this.camera.quaternion)

    const targetScale = baseScale * 4

    gsap.killTweensOf(this.ringPosObj)
    this.ringPosObj.x = oldPos.x
    this.ringPosObj.y = oldPos.y
    this.ringPosObj.z = oldPos.z
    this.ringPosAnimating = true
    gsap.to(this.ringPosObj, {
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z,
      duration: wasVisible ? 0.45 : 0.01,
      ease: 'power2.out',
      onUpdate: () => this.focusRing.position.set(this.ringPosObj.x, this.ringPosObj.y, this.ringPosObj.z),
      onComplete: () => { this.ringPosAnimating = false },
    })

    gsap.killTweensOf(this.ringScaleObj)
    this.ringScaleObj.s = wasVisible ? this.focusRing.scale.x : 0
    gsap.to(this.ringScaleObj, {
      s: targetScale,
      duration: wasVisible ? 0.35 : 0.55,
      ease: wasVisible ? 'power2.out' : 'back.out(1.4)',
      onUpdate: () => this.focusRing.scale.setScalar(this.ringScaleObj.s),
    })
  }

  private exitFocus() {
    if (!this.flight.isFocusMode) return
    this.flight.exit()
    this.focusTargetMesh = null
    this.currentFocusItemId = null
    if (this.currentFocusInstance) {
      const previousFocus = this.currentFocusInstance
      this.currentFocusInstance = null
      this.setInstanceHoverColor(previousFocus, false)
    }

    gsap.killTweensOf(this.ringPosObj)
    this.ringPosAnimating = false
    gsap.killTweensOf(this.ringScaleObj)
    this.ringScaleObj.s = this.focusRing.scale.x
    gsap.to(this.ringScaleObj, {
      s: 0,
      duration: 0.3,
      ease: 'power2.in',
      onUpdate: () => this.focusRing.scale.setScalar(this.ringScaleObj.s),
      onComplete: () => {
        this.focusRing.visible = false
      },
    })

    this.onFocusChange(null)
  }

  /** URL 深链入口：按词条 id 聚焦（llm-wiki 深链思路） */
  focusById(id: string | null): boolean {
    if (!id) {
      this.exitFocus()
      return true
    }
    if (id === this.currentFocusItemId) return true
    for (const ring of this.rings) {
      const idx = ring.items.findIndex((item) => item.id === id)
      if (idx >= 0) {
        this.focusFromPick({
          mesh: ring.hitMesh,
          id: idx,
          color: ring.colors[idx],
          brightColor: ring.brightColors[idx],
        })
        return true
      }
    }
    return false
  }

  // ── 交互事件 ──

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.container.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.disposed) return
    this.pointerInside = true
    this.updatePointerNdc(e)
    this.pointerDownPos.set(e.clientX, e.clientY)
    this.isPointerDown = true
    this.isDragging = false
    this.controls.autoRotate = false
    this.lastInteractionElapsed = this.timer.getElapsed()
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.disposed || !this.container) return
    this.pointerInside = true
    if (
      this.isPointerDown &&
      this.pointerDownPos.distanceTo(this._dragVec.set(e.clientX, e.clientY)) > 5
    ) {
      this.isDragging = true
    }
    if (this.isDragging) {
      this.unhighlight()
      this.currentHoverInstance = null
      this.container.style.cursor = this.flight.isFocusMode ? 'pointer' : 'grab'
      return
    }

    this.updatePointerNdc(e)
    // perf：位移阈值 4px —— 微动不触发全量拾取扫描；静止时由 20Hz 低频追踪旋转星轨
    if (this.hasPickPos && Math.abs(e.clientX - this.lastPickX) < 4 && Math.abs(e.clientY - this.lastPickY) < 4) return
    this.lastPickX = e.clientX
    this.lastPickY = e.clientY
    this.hasPickPos = true
    this.needsPick = false
    this.nextHoverPickElapsed = this.timer.getElapsed() + 1 / 20
    this.updateHover()
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.disposed) return
    this.updatePointerNdc(e)
    this.isPointerDown = false
    if (this.isDragging) {
      this.isDragging = false
      return
    }
    const rect = this.container.getBoundingClientRect()
    const hit = pickInstance(
      this.rings,
      this.raycaster,
      this.camera,
      this.mouse,
      rect,
      this.coarsePointer,
    )
    if (hit) {
      this.focusFromPick(hit)
    } else if (this.flight.isFocusMode && !this.flight.isFlying()) {
      this.exitFocus()
    }
  }

  private onPointerLeave = () => {
    this.pointerInside = false
    this.isPointerDown = false
    this.isDragging = false
    this.needsPick = false
    this.unhighlight()
    this.currentHoverInstance = null
    if (this.container) this.container.style.cursor = this.flight.isFocusMode ? 'pointer' : 'grab'
  }

  // 系统接管手势（iOS 通知栏下拉、来电等）兜底：复位拖拽状态。
  private onPointerCancel = () => {
    this.isPointerDown = false
    this.isDragging = false
    this.pointerDownPos.set(0, 0)
    this.onPointerLeave()
  }

  // ── 渲染循环 ──

  private animate = () => {
    this.animationId = 0
    if (this.renderPaused || this.disposed) return
    this.timer.update()
    const elapsed = this.timer.getElapsed()

    // 星轨持续旋转时，光标不动也需要低频重算最近实例，保证 Hover 与点击目标一致。
    if (
      this.needsPick ||
      (this.pointerInside && !this.isDragging && elapsed >= this.nextHoverPickElapsed)
    ) {
      this.needsPick = false
      this.nextHoverPickElapsed = elapsed + 1 / 20
      this.updateHover()
    }

    // 空闲 6s 后缓慢自动旋转；交互/聚焦立即停；reduced-motion 用户不自动旋转
    if (!this.flight.isFocusMode) {
      if (!this.controls.autoRotate && elapsed - this.lastInteractionElapsed > 6 && !prefersReducedMotion()) {
        this.controls.autoRotate = true
        this.controls.autoRotateSpeed = 0.4
      }
    } else if (this.controls.autoRotate) {
      this.controls.autoRotate = false
    }

    if (this.controls.enabled && !this.flight.isFlying()) {
      this.controls.update()
      this.flight.applyFocusRoll()
    }

    this.icebergGroup.rotation.y = elapsed * 0.002
    this.icebergGroup.position.y = Math.sin(elapsed * 0.3) * 0.1

    for (let i = 1; i < this.icebergGroup.children.length; i++) {
      const chunk = this.icebergGroup.children[i]
      chunk.rotation.x += chunk.userData.rotSpeedX
      chunk.rotation.y += chunk.userData.rotSpeedY
    }

    // 聚焦时轨道转速放慢，让画面稳定
    const ringSpeedFactor = this.flight.isFocusMode ? 0.15 : 1
    for (const ring of this.rings) {
      ring.group.rotation.y += ring.group.userData.rotateSpeed * ringSpeedFactor
    }
    if (this.iceDust) this.iceDust.rotation.y += 0.0003 * ringSpeedFactor

    // 聚焦光环持续追踪宝石世界坐标（GSAP 未接管时）
    const target = this.focusTargetMesh
    if (this.focusRing.visible && target) {
      if (!this.ringPosAnimating && !gsap.isTweening(this.ringPosObj)) {
        const mapData = this.rings.find((r) => r.hitMesh === target.mesh)
        if (mapData) {
          mapData.group.updateMatrixWorld(true)
          this.focusRing.position.copy(getInstanceWorldPos(target.mesh, target.id, mapData.group))
        }
      }
      this.focusRing.quaternion.copy(this.camera.quaternion)
      if (!gsap.isTweening(this.ringScaleObj)) {
        this.focusRing.scale.setScalar(((this.focusRing.userData.baseScale as number) || 0.07) * 4)
      }
    }

    try {
      this.composer.render()
    } catch (error) {
      // 渲染失败时停止循环，避免同一异常按帧率无限刷屏并持续占用主线程。
      this.renderPaused = true
      reportError('iceberg3d', error, { phase: 'render-loop' })
      this.onError()
      return
    }

    // 聚焦取景框单独在 Bloom 之后绘制，避免白色框也被辉光模糊
    if (this.focusRing.visible) {
      this.renderer.autoClear = false
      this.renderer.render(this.focusScene, this.camera)
      this.renderer.autoClear = true
    }

    this.animationId = requestAnimationFrame(this.animate)
  }

  // ── 生命周期 ──

  private onResize = () => {
    if (this.disposed || !this.renderer) return
    const { width, height } = this.container.getBoundingClientRect()
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height) // Composer 尺寸必须同步
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.flight.restoreFocusComposition()
  }

  private onContextLost = (e: Event) => {
    e.preventDefault() // 允许浏览器尝试恢复，但先停循环并提示错误
    this.renderPaused = true
    cancelAnimationFrame(this.animationId)
    this.onError()
  }

  /** keep-alive：路由离开时暂停 rAF（不释放资源，回来继续用） */
  pause(): void {
    if (this.disposed) return
    this.renderPaused = true
    cancelAnimationFrame(this.animationId)
  }

  /** keep-alive：重新激活时恢复渲染循环 */
  resume(): void {
    if (this.disposed || !this.renderer) return
    if (this.renderPaused) {
      this.renderPaused = false
      this.animate()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationId)
    this.flight?.kill()
    gsap.killTweensOf(this.ringPosObj)
    gsap.killTweensOf(this.ringScaleObj)
    this.ringPosAnimating = false
    window.removeEventListener('resize', this.onResize)

    if (this.container) {
      this.container.removeEventListener('pointerdown', this.onPointerDown)
      this.container.removeEventListener('pointermove', this.onPointerMove)
      this.container.removeEventListener('pointerup', this.onPointerUp)
      this.container.removeEventListener('pointerleave', this.onPointerLeave)
      this.container.removeEventListener('pointercancel', this.onPointerCancel)
    }
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement)
      }
    }

    this.trackedMeshes.forEach((m) => m.dispose())
    this.trackedGeos.forEach((g) => g.dispose())
    this.trackedMats.forEach((m) => m.dispose())
    this.renderer?.dispose()
    this.composer?.dispose()
    this.scene?.clear()
    this.controls?.dispose()
  }
}
