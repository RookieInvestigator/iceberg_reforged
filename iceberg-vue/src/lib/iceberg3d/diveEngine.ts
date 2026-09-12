import * as THREE from 'three'
import { to, killTweensOf } from './tween'
import { mulberry32, ValueNoise3D, fbm } from './prng'
import { DIVE_FLOOR_Y, DIVE_WORLD_RADIUS, bergRadiusAt, nodePosition, tierAtY } from './diveLayout'

/**
 * Submarine dive cruise (/dive): same lifecycle contract as Iceberg3DEngine
 * (init / pause / resume / dispose / supportsWebGL2 / onFocusChange / focusById / onReady / onError),
 * independent scene (seawater + seabed + entry point lights + submarine).
 * Reuses: prng (deterministic layout), tween (camera flight / sonar ring), instanced color + fog.
 */
export interface DiveEntry {
  id: string
  title: string
  category: string
  categoryColor: string
  tags: string[]
  desc: string
  link?: string
  tierIndex: number
}

export interface DiveFocus {
  item: DiveEntry
}

export interface DiveHud {
  depthM: number
  tierIndex: number
  speedKn: number
  sonarTitle: string | null
  sonarDistM: number | null
}

interface EngineOptions {
  container: HTMLElement
  entries: DiveEntry[]
  reducedMotion: boolean
  onFocusChange: (focus: DiveFocus | null) => void
  onHud: (hud: DiveHud) => void
  onReady: () => void
  onError: () => void
}

const SHALLOW_BG = new THREE.Color(0x0a2f4d)
const DEEP_BG = new THREE.Color(0x010304)
const tmpColor = new THREE.Color()
const tmpBg = new THREE.Color()

function makeRingTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 128
  cv.height = 128
  const ctx = cv.getContext('2d')
  if (ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,1)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(64, 64, 52, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.arc(64, 64, 52, 0, Math.PI * 2)
    ctx.stroke()
  }
  return new THREE.CanvasTexture(cv)
}

export class DiveEngine {
  static supportsWebGL2(): boolean {
    try {
      const c = document.createElement('canvas')
      return !!c.getContext('webgl2')
    } catch {
      return false
    }
  }

  private container: HTMLElement
  private entries: DiveEntry[]
  private reducedMotion: boolean
  private onFocusChange: (focus: DiveFocus | null) => void
  private onHud: (hud: DiveHud) => void
  private onReady: () => void
  private onError: () => void

  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera | null = null
  private clock = new THREE.Clock()
  private rafId = 0
  private running = false
  private disposed = false
  private time = 0

  private sub = new THREE.Group()
  private subProp: THREE.Group | null = null
  private yaw = 0
  private pitch = 0
  private bank = 0
  private speed = 0
  /** Input written by view layer: thrust -1..1, yaw -1..1, vertical -1..1 */
  readonly input = { thrust: 0, yaw: 0, vertical: 0 }

  private nodeMesh: THREE.InstancedMesh | null = null
  private haloMesh: THREE.InstancedMesh | null = null
  private nodeIndexByInstance: number[] = []
  private hoveredEntry: DiveEntry | null = null
  private hoverRing: THREE.Sprite | null = null
  private focusRing: THREE.Sprite | null = null

  private snow: THREE.Points | null = null
  private snowVel!: Float32Array
  private rays: THREE.Mesh[] = []
  private sonarRing: THREE.Mesh | null = null
  private sonarT = 1
  private sonarTimer = 0
  private sonarEntry: DiveEntry | null = null
  private sonarDist = 0
  private lastHudKey = ''

  private flight: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromLook: THREE.Vector3; toLook: THREE.Vector3 } | null = null
  private flightState = { t: 0 }
  private camLook = new THREE.Vector3()
  private focusEntry: DiveEntry | null = null

  private raycaster = new THREE.Raycaster()
  private pointerNdc = new THREE.Vector2()
  private downPos: { x: number; y: number } | null = null
  private hoverNdc: THREE.Vector2 | null = null

  private onResize = () => this.resize()
  private onPointerDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY }
    this.cancelFlight()
  }
  private onPointerUp = (e: PointerEvent) => {
    if (!this.downPos) return
    const dx = e.clientX - this.downPos.x
    const dy = e.clientY - this.downPos.y
    this.downPos = null
    if (dx * dx + dy * dy > 36) return
    this.pickAt(e.clientX, e.clientY)
  }
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer?.domElement.getBoundingClientRect()
    if (!rect) return
    this.hoverNdc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }
  private onKeyDown = () => this.cancelFlight()

  constructor(options: EngineOptions) {
    this.container = options.container
    this.entries = options.entries
    this.reducedMotion = options.reducedMotion
    this.onFocusChange = options.onFocusChange
    this.onHud = options.onHud
    this.onReady = options.onReady
    this.onError = options.onError
  }

  get focusedId(): string | null {
    return this.focusEntry?.id ?? null
  }

  init(): void {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    } catch {
      this.onError()
      return
    }
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.5, 2600)
    this.scene.fog = new THREE.FogExp2(0x04121f, 0.0028)
    this.scene.background = new THREE.Color().copy(SHALLOW_BG)

    this.scene.add(new THREE.HemisphereLight(0x9fd0e8, 0x020608, 1.05))
    const sun = new THREE.DirectionalLight(0xbfe0f5, 0.8)
    sun.position.set(60, 200, 40)
    this.scene.add(sun)

    this.buildFloor()
    this.buildBerg()
    this.buildRocks()
    this.buildSnow()
    this.buildRays()
    this.buildNodes()
    this.buildSub()
    this.buildSonar()

    this.sub.position.set(0, -18, 230)
    this.yaw = 0
    this.camLook.set(0, -18, 180)

    window.addEventListener('resize', this.onResize)
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('keydown', this.onKeyDown)

    this.running = true
    this.clock.start()
    this.loop()
    this.onReady()
  }

  pause(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  resume(): void {
    if (this.running || this.disposed || !this.renderer) return
    this.running = true
    this.clock.getDelta()
    this.loop()
  }

  dispose(): void {
    this.disposed = true
    this.pause()
    killTweensOf(this.flightState)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKeyDown)
    const el = this.renderer?.domElement
    el?.removeEventListener('pointerdown', this.onPointerDown)
    el?.removeEventListener('pointerup', this.onPointerUp)
    el?.removeEventListener('pointermove', this.onPointerMove)
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer?.dispose()
    this.renderer = null
    if (el?.parentElement === this.container) this.container.removeChild(el)
  }

  private buildFloor(): void {
    const geo = new THREE.PlaneGeometry(1500, 1500, 90, 90)
    geo.rotateX(-Math.PI / 2)
    const noise = new ValueNoise3D(1234)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = fbm(noise, x / 130, 0, z / 130, 4) * 30 + fbm(noise, x / 28, 5, z / 28, 2) * 5
      pos.setY(i, DIVE_FLOOR_Y - 4 + h)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: 0x0d1620, roughness: 1, metalness: 0 })
    const floor = new THREE.Mesh(geo, mat)
    this.scene.add(floor)
  }

  private buildBerg(): void {
    const geo = new THREE.ConeGeometry(150, 420, 64, 20, true)
    geo.rotateX(Math.PI)
    const noise = new ValueNoise3D(20260909)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const n = fbm(noise, v.x / 70, v.y / 70, v.z / 70, 4)
      const radial = Math.hypot(v.x, v.z)
      if (radial > 0.01) {
        const k = 1 + (n * 22) / radial
        pos.setX(i, v.x * k)
        pos.setZ(i, v.z * k)
      }
      pos.setY(i, v.y + fbm(noise, v.x / 45, v.z / 45, 3, 2) * 7)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8fc3e0,
      roughness: 0.32,
      metalness: 0.08,
      flatShading: true,
      transparent: true,
      opacity: 0.96,
      emissive: 0x0a2030,
      emissiveIntensity: 0.7,
    })
    const berg = new THREE.Mesh(geo, mat)
    berg.position.y = -210
    this.scene.add(berg)
  }

  private buildRocks(): void {
    const rand = mulberry32(77)
    const geo = new THREE.DodecahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.95, flatShading: true })
    const count = 200
    const rocks = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2
      const r = 200 + rand() * (DIVE_WORLD_RADIUS - 220)
      const sc = 2 + rand() * 12
      p.set(Math.cos(a) * r, DIVE_FLOOR_Y + sc * 0.2, Math.sin(a) * r)
      e.set(rand() * 3, rand() * 3, rand() * 3)
      q.setFromEuler(e)
      s.set(sc * (0.7 + rand() * 0.6), sc * (0.5 + rand() * 0.5), sc * (0.7 + rand() * 0.6))
      m.compose(p, q, s)
      rocks.setMatrixAt(i, m)
    }
    rocks.instanceMatrix.needsUpdate = true
    this.scene.add(rocks)
  }

  private buildSnow(): void {
    const count = 900
    const pos = new Float32Array(count * 3)
    const rand = mulberry32(2026)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 360
      pos[i * 3 + 1] = (rand() - 0.5) * 360
      pos[i * 3 + 2] = (rand() - 0.5) * 360
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const cv = document.createElement('canvas')
    cv.width = 32
    cv.height = 32
    const ctx = cv.getContext('2d')
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
      g.addColorStop(0, 'rgba(207,230,245,1)')
      g.addColorStop(0.5, 'rgba(207,230,245,0.5)')
      g.addColorStop(1, 'rgba(207,230,245,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 32, 32)
    }
    const sprite = new THREE.CanvasTexture(cv)
    const mat = new THREE.PointsMaterial({
      color: 0xcfe6f5,
      size: 1.3,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
      map: sprite,
      alphaTest: 0.01,
    })
    this.snowVel = new Float32Array(count)
    for (let i = 0; i < count; i++) this.snowVel[i] = 1.5 + rand() * 3.5
    this.snow = new THREE.Points(geo, mat)
    this.snow.frustumCulled = false
    this.scene.add(this.snow)
  }

  private buildRays(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fb8dd,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    const rand = mulberry32(99)
    for (let i = 0; i < 6; i++) {
      const w = 26 + rand() * 40
      const geo = new THREE.PlaneGeometry(w, 420)
      const ray = new THREE.Mesh(geo, mat.clone())
      ray.position.set((rand() - 0.5) * 500, -140, -120 - rand() * 320)
      ray.rotation.z = 0.22 + rand() * 0.1
      ray.rotation.y = rand() * Math.PI
      this.rays.push(ray)
      this.scene.add(ray)
    }
  }

  private buildNodes(): void {
    const n = this.entries.length
    const geo = new THREE.SphereGeometry(1, 18, 12)
    const mat = new THREE.MeshLambertMaterial({ emissive: 0x05080c })
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1))
    const haloMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const halo = new THREE.InstancedMesh(geo, haloMat, Math.max(n, 1))
    const m = new THREE.Matrix4()
    this.nodeIndexByInstance = []
    for (let i = 0; i < n; i++) {
      const en = this.entries[i]
      const pos = nodePosition(en.id, en.tierIndex)
      const s = 1.0 * pos.scale
      m.makeScale(s, s, s)
      m.setPosition(pos.x, pos.y, pos.z)
      mesh.setMatrixAt(i, m)
      tmpColor.set(en.categoryColor)
      mesh.setColorAt(i, tmpColor)
      const hs = s * 2.6
      m.makeScale(hs, hs, hs)
      m.setPosition(pos.x, pos.y, pos.z)
      halo.setMatrixAt(i, m)
      halo.setColorAt(i, tmpColor)
      this.nodeIndexByInstance.push(i)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    halo.instanceMatrix.needsUpdate = true
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true
    this.nodeMesh = mesh
    this.haloMesh = halo
    this.scene.add(mesh)
    this.scene.add(halo)

    const ringTex = makeRingTexture()
    const mkRing = (color: number, scale: number) => {
      const smat = new THREE.SpriteMaterial({
        map: ringTex,
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: true,
      })
      const sp = new THREE.Sprite(smat)
      sp.scale.set(scale, scale, 1)
      sp.visible = false
      sp.renderOrder = 5
      this.scene.add(sp)
      return sp
    }
    this.hoverRing = mkRing(0xffffff, 7)
    this.focusRing = mkRing(0xffb36f, 9)
  }

  private buildSub(): void {
    this.sub.rotation.order = 'YXZ'
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf2a41f, roughness: 0.42, metalness: 0.45 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x232c34, roughness: 0.65, metalness: 0.35 })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9fd4f5,
      roughness: 0.12,
      metalness: 0.9,
      emissive: 0x1d4a5e,
      emissiveIntensity: 0.8,
    })
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x0a0e12, emissive: 0xbfe9ff, emissiveIntensity: 1.8 })

    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 8.5, 6, 20), hullMat)
    hull.rotation.x = Math.PI / 2
    hull.scale.set(1, 0.92, 1)
    this.sub.add(hull)

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), glassMat)
    dome.position.set(0, 0.95, 3.4)
    dome.scale.set(1, 0.72, 1)
    this.sub.add(dome)

    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 2.6), hullMat)
    tower.position.set(0, 2.15, -0.6)
    this.sub.add(tower)
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 10), darkMat)
    scope.position.set(0, 3.4, -0.2)
    this.sub.add(scope)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), darkMat)
    mast.position.set(0, 3.1, -1.4)
    this.sub.add(mast)

    for (const z of [2.2, -2.8]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.1, 8, 28), darkMat)
      ring.position.set(0, 0, z)
      this.sub.add(ring)
    }

    for (const z of [-2.4, -1.1, 0.2, 1.5]) {
      for (const x of [-1.62, 1.62]) {
        const port = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), lampMat)
        port.position.set(x, 0.3, z)
        port.scale.x = 0.45
        this.sub.add(port)
      }
    }

    const portLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2a2a, emissiveIntensity: 2.2 }),
    )
    portLight.position.set(-1.9, 1.2, 1.8)
    this.sub.add(portLight)
    const stbdLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2aff5a, emissiveIntensity: 2.2 }),
    )
    stbdLight.position.set(1.9, 1.2, 1.8)
    this.sub.add(stbdLight)

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.9, 1.5), darkMat)
      fin.position.set(0, 0, -5.2)
      fin.rotation.z = Math.PI / 4 + (i * Math.PI) / 2
      fin.translateY(1.5)
      this.sub.add(fin)
    }
    this.subProp = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.5), darkMat)
      blade.rotation.z = (i * Math.PI * 2) / 3
      blade.translateY(1.1)
      this.subProp.add(blade)
    }
    this.subProp.position.set(0, 0, -6)
    this.sub.add(this.subProp as unknown as THREE.Object3D)

    const lamp = new THREE.SpotLight(0xcfeaff, 900, 340, 0.55, 0.65, 1.5)
    lamp.position.set(0, 0, 5.6)
    const lampTarget = new THREE.Object3D()
    lampTarget.position.set(0, -2, 60)
    this.sub.add(lampTarget)
    ;(lamp as unknown as { target: THREE.Object3D }).target = lampTarget
    this.sub.add(lamp)
    const coneGeo = new THREE.ConeGeometry(13, 70, 20, 1, true)
    coneGeo.translate(0, -35, 0)
    coneGeo.rotateX(-Math.PI / 2)
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0x9fd4f5,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    )
    cone.position.set(0, -0.5, 5.6)
    this.sub.add(cone)

    this.scene.add(this.sub)
  }

  private buildSonar(): void {
    const geo = new THREE.TorusGeometry(1, 0.35, 8, 48)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fe0c3,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    this.sonarRing = new THREE.Mesh(geo, mat)
    this.sonarRing.rotation.x = Math.PI / 2
    this.sonarRing.visible = false
    this.scene.add(this.sonarRing)
  }

  private pickAt(clientX: number, clientY: number): void {
    if (!this.camera || !this.nodeMesh || this.entries.length === 0) return
    const rect = this.renderer?.domElement.getBoundingClientRect()
    if (!rect) return
    this.pointerNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    const hits = this.raycaster.intersectObject(this.nodeMesh)
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const entry = this.entries[this.nodeIndexByInstance[hits[0].instanceId]]
      if (entry) this.focusNode(entry, true)
    }
  }

  private focusNode(entry: DiveEntry, fly: boolean): void {
    this.focusEntry = entry
    this.onFocusChange({ item: entry })
    this.updateFocusRing()
    if (fly && this.camera) {
      const pos = nodePosition(entry.id, entry.tierIndex)
      const target = new THREE.Vector3(pos.x, pos.y, pos.z)
      const dir = new THREE.Vector3().subVectors(this.sub.position, target).normalize()
      if (dir.lengthSq() < 0.01) dir.set(0, 0.3, 1).normalize()
      const camTo = target.clone().addScaledVector(dir, 26).add(new THREE.Vector3(0, 8, 0))
      this.flyCamera(camTo, target)
    }
  }

  private flyCamera(camTo: THREE.Vector3, lookTo: THREE.Vector3): void {
    if (!this.camera) return
    killTweensOf(this.flightState)
    const cam = this.camera
    const fromPos = cam.position.clone()
    const fromLook = this.camLook.clone()
    this.flight = { fromPos, toPos: camTo.clone(), fromLook, toLook: lookTo.clone() }
    this.flightState.t = 0
    to(this.flightState, {
      t: 1,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => {
        if (!this.flight || !this.camera) return
        const k = this.flightState.t
        cam.position.lerpVectors(this.flight.fromPos, this.flight.toPos, k)
        this.camLook.lerpVectors(this.flight.fromLook, this.flight.toLook, k)
      },
      onComplete: () => {
        this.flight = null
      },
    })
  }

  private cancelFlight(): void {
    if (!this.flight) return
    killTweensOf(this.flightState)
    this.flight = null
  }

  focusById(id: string | null): boolean {
    if (!id) {
      this.focusEntry = null
      this.onFocusChange(null)
      this.updateFocusRing()
      return true
    }
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return false
    this.focusNode(entry, true)
    return true
  }

  openSonar(): boolean {
    if (!this.sonarEntry) return false
    this.focusNode(this.sonarEntry, true)
    return true
  }

  clearInput(): void {
    this.input.thrust = 0
    this.input.yaw = 0
    this.input.vertical = 0
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private loop = (): void => {
    if (!this.running || !this.renderer || !this.camera) return
    this.rafId = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.time += dt
    this.updateSub(dt)
    this.updateCamera(dt)
    this.updateAmbient(dt)
    this.updateSonar(dt)
    this.updateHover()
    this.updateHud()
    this.renderer.render(this.scene, this.camera)
  }

  private subForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    )
  }

  private updateSub(dt: number): void {
    const MAX_SPEED = 26
    const target = this.input.thrust * MAX_SPEED
    const accel = target > this.speed ? 14 : 22
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt)
    this.yaw -= this.input.yaw * 1.5 * dt
    const targetPitch = this.input.vertical * 0.55
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3)
    const targetBank = -this.input.yaw * 0.35
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 4)

    const fwd = this.subForward(new THREE.Vector3())
    this.sub.position.addScaledVector(fwd, this.speed * dt)

    const p = this.sub.position
    const bergR = bergRadiusAt(p.y) + 10
    const rad = Math.hypot(p.x, p.z)
    if (rad < bergR && rad > 0.01) {
      const s = bergR / rad
      p.x *= s
      p.z *= s
    }
    if (rad > DIVE_WORLD_RADIUS) {
      p.x *= DIVE_WORLD_RADIUS / rad
      p.z *= DIVE_WORLD_RADIUS / rad
    }
    p.y = Math.min(-5, Math.max(DIVE_FLOOR_Y + 14, p.y))

    this.sub.rotation.set(-this.pitch, this.yaw, this.bank)
    if (!this.reducedMotion) {
      this.sub.position.y += Math.sin(this.time * 1.4) * 0.012
    }
    if (this.subProp && !this.reducedMotion) this.subProp.rotation.z += dt * (2 + Math.abs(this.speed) * 1.4)
  }

  private updateCamera(dt: number): void {
    if (!this.camera || this.flight) return
    const fwd = this.subForward(new THREE.Vector3())
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize()
    const desired = this.sub.position
      .clone()
      .addScaledVector(fwd, -20)
      .addScaledVector(new THREE.Vector3(0, 1, 0), 8.5)
      .addScaledVector(right, 4.5)
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2)
    this.camera.position.lerp(desired, k)
    const lookTo = this.sub.position.clone().addScaledVector(fwd, 26)
    this.camLook.lerp(lookTo, this.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.5))
    this.camera.lookAt(this.camLook)

    tmpBg.copy(SHALLOW_BG).lerp(DEEP_BG, Math.min(1, -this.camera.position.y / 420))
    ;(this.scene.background as THREE.Color).copy(tmpBg)
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = 0.0028 + Math.min(1, -this.camera.position.y / 420) * 0.0022
    }
  }

  private updateAmbient(dt: number): void {
    void dt
    if (this.snow && !this.reducedMotion && this.camera) {
      const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute
      const cx = this.camera.position.x
      const cy = this.camera.position.y
      const cz = this.camera.position.z
      const arr = pos.array as Float32Array
      for (let i = 0; i < this.snowVel.length; i++) {
        let y = arr[i * 3 + 1] - this.snowVel[i] * dt
        let x = arr[i * 3]
        let z = arr[i * 3 + 2]
        if (y < cy - 180) y += 360
        if (x < cx - 180) x += 360
        else if (x > cx + 180) x -= 360
        if (z < cz - 180) z += 360
        else if (z > cz + 180) z -= 360
        arr[i * 3] = x
        arr[i * 3 + 1] = y
        arr[i * 3 + 2] = z
      }
      pos.needsUpdate = true
    }
    if (!this.reducedMotion) {
      const depthFade = Math.max(0, 1 + (this.camera?.position.y ?? 0) / 200)
      this.rays.forEach((ray, i) => {
        const m = ray.material as THREE.MeshBasicMaterial
        m.opacity = 0.05 * depthFade + 0.012 * Math.sin(this.time * 0.5 + i * 1.7)
      })
    }
  }

  private updateSonar(dt: number): void {
    this.sonarTimer += dt
    if (this.sonarTimer >= 4.5 && this.sonarRing) {
      this.sonarTimer = 0
      this.sonarT = 0
      this.sonarRing.visible = true
    }
    if (this.sonarRing && this.sonarT < 1) {
      this.sonarT = Math.min(1, this.sonarT + dt / 1.8)
      const s = 8 + this.sonarT * 150
      this.sonarRing.scale.set(s, s, s)
      this.sonarRing.position.copy(this.sub.position)
      ;(this.sonarRing.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - this.sonarT)
      if (this.sonarT >= 1) this.sonarRing.visible = false
    }
    this.hudTimerCheck(dt)
  }

  private hudAcc = 0
  private hudTimerCheck(dt: number): void {
    this.hudAcc += dt
    if (this.hudAcc < 0.5) return
    this.hudAcc = 0
    let best: DiveEntry | null = null
    let bestD = 150
    const sp = this.sub.position
    for (const en of this.entries) {
      const pos = nodePosition(en.id, en.tierIndex)
      const d = Math.hypot(pos.x - sp.x, pos.y - sp.y, pos.z - sp.z)
      if (d < bestD) {
        bestD = d
        best = en
      }
    }
    this.sonarEntry = best
    this.sonarDist = bestD
  }

  private updateHover(): void {
    if (!this.camera || !this.nodeMesh || !this.hoverRing || this.reducedMotion) return
    if (!this.hoverNdc) {
      if (this.hoveredEntry) {
        this.hoveredEntry = null
        this.hoverRing.visible = false
      }
      return
    }
    this.raycaster.setFromCamera(this.hoverNdc, this.camera)
    const hits = this.raycaster.intersectObject(this.nodeMesh)
    const entry = hits.length > 0 && hits[0].instanceId !== undefined ? this.entries[this.nodeIndexByInstance[hits[0].instanceId]] ?? null : null
    if (entry !== this.hoveredEntry) {
      this.hoveredEntry = entry
      if (entry) {
        const pos = nodePosition(entry.id, entry.tierIndex)
        this.hoverRing.position.set(pos.x, pos.y, pos.z)
        this.hoverRing.visible = true
      } else if (this.hoverRing) {
        this.hoverRing.visible = false
      }
    }
    if (this.hoverRing?.visible) {
      const s = 7 + Math.sin(this.time * 6) * 0.8
      this.hoverRing.scale.set(s, s, 1)
    }
    if (this.focusRing && this.focusEntry) {
      const pos = nodePosition(this.focusEntry.id, this.focusEntry.tierIndex)
      this.focusRing.position.set(pos.x, pos.y, pos.z)
      this.focusRing.visible = true
      const fs = 9 + Math.sin(this.time * 2.5) * 0.9
      this.focusRing.scale.set(fs, fs, 1)
    } else if (this.focusRing) {
      this.focusRing.visible = false
    }
  }

  private updateFocusRing(): void {
    if (!this.focusRing) return
    if (this.focusEntry) {
      const pos = nodePosition(this.focusEntry.id, this.focusEntry.tierIndex)
      this.focusRing.position.set(pos.x, pos.y, pos.z)
      this.focusRing.visible = true
    } else {
      this.focusRing.visible = false
    }
  }

  private updateHud(): void {
    const subY = this.sub.position.y
    const hud: DiveHud = {
      depthM: Math.max(0, Math.round(-subY * 2)),
      tierIndex: tierAtY(subY),
      speedKn: Math.round(Math.abs(this.speed) * 1.2),
      sonarTitle: this.sonarEntry?.title ?? null,
      sonarDistM: this.sonarEntry ? Math.round(this.sonarDist * 2) : null,
    }
    const key = `${hud.depthM}|${hud.tierIndex}|${hud.speedKn}|${hud.sonarTitle}|${hud.sonarDistM}`
    if (key !== this.lastHudKey) {
      this.lastHudKey = key
      this.onHud(hud)
    }
  }
}
