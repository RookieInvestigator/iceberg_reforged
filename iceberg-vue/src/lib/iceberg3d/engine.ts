import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import gsap from 'gsap'
import type { IcebergData, IcebergItem } from '../data'
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
  private focusRing!: THREE.Mesh
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.container.appendChild(this.renderer.domElement)
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x020408)
    this.scene.fog = new THREE.FogExp2(0x020408, 0.015)

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
    this.camera.position.set(10, 6, 16)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.maxDistance = 80
    this.controls.minDistance = 2
    this.controls.enablePan = true
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }

    this.flight = new CameraFlight(this.camera, this.controls, this.container)
    this.coarsePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

    // 保留色彩输出处理，但不再使用 Bloom，避免粒子、边缘和高亮代理扩散为柔光团。
    const renderScene = new RenderPass(this.scene, this.camera)
    const outputPass = new OutputPass()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(renderScene)
    this.composer.addPass(outputPass)

    this.scene.add(new THREE.AmbientLight(0x0a1525, 1.0))
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5)
    mainLight.position.set(10, 20, 10)
    this.scene.add(mainLight)
    const rimLight = new THREE.DirectionalLight(0x0088ff, 4.0)
    rimLight.position.set(-15, 5, -20)
    this.scene.add(rimLight)

    this.buildIceberg()
    this.buildGems()
    this.buildFocusRing()

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
      const visibleItemIds: number[][] = [[], [], []]
      const geoCounts = [0, 0, 0]

      items.forEach((item, i) => {
        const angle = (i / count) * Math.PI * 2 + rng() * 0.15
        const yOffset = (rng() - 0.5) * 2.0
        const x = Math.cos(angle) * (radius + (rng() - 0.5) * 2.0)
        const z = Math.sin(angle) * (radius + (rng() - 0.5) * 2.0)

        const catColor = categoryColors[item.category] || 0xffffff
        colors.push(catColor)
        brightColors.push(saturatedCategoryColors[item.category] || 0xffffff)
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
        visibleMeshes[geoIdx].setColorAt(localIdx, defaultColor.setHex(catColor))
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
        visibleMeshes,
        visibleItemIds,
      })
      ringsGroup.add(orbitGroup)
    })
    this.scene.add(ringsGroup)
  }

  /** 聚焦光环：跟随目标宝石的圆环 */
  private buildFocusRing() {
    const ringGeo = new THREE.RingGeometry(0.85, 0.92, 48)
    this.trackedGeos.push(ringGeo)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthTest: false,
    })
    this.trackedMats.push(ringMat)
    this.focusRing = new THREE.Mesh(ringGeo, ringMat)
    this.focusRing.renderOrder = 999
    this.focusRing.visible = false
    this.scene.add(this.focusRing)
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
    if (highlighted) color.offsetHSL(0, 0.16, 0.05).addScalar(2)
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
    gsap.to(this.ringPosObj, {
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z,
      duration: wasVisible ? 0.45 : 0.01,
      ease: 'power2.out',
      onUpdate: () => this.focusRing.position.set(this.ringPosObj.x, this.ringPosObj.y, this.ringPosObj.z),
    })

    gsap.killTweensOf(this.ringScaleObj)
    if (!wasVisible) {
      this.ringScaleObj.s = 0
      gsap.to(this.ringScaleObj, {
        s: targetScale,
        duration: 0.55,
        ease: 'back.out(1.4)',
        onUpdate: () => this.focusRing.scale.setScalar(this.ringScaleObj.s),
      })
    } else {
      this.ringScaleObj.s = targetScale
      this.focusRing.scale.setScalar(targetScale)
    }
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

    // 聚焦光环持续追踪宝石世界坐标（GSAP 未接管时）
    const target = this.focusTargetMesh
    if (this.focusRing.visible && target) {
      if (!gsap.isTweening(this.ringPosObj)) {
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
