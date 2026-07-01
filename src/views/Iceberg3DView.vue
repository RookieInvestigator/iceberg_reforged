<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import gsap from 'gsap'
import { normalizeData, type IcebergItem } from '../lib/data'
import raw from '../data/iceberg.json'

const data = normalizeData(raw)

interface HoverData {
  item: IcebergItem
  worldPos: THREE.Vector3
  baseScale: number
  tierColor: number
}

const containerRef = ref<HTMLDivElement>()

// ── 状态管理 ──
const isLoading = ref(true)
const webglUnavailable = ref(false)
const isFocusMode = ref(false)
const selectedEntry = ref<HoverData | null>(null)

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let composer: EffectComposer // 后处理合成器
let icebergGroup: THREE.Group
let ringsGroup: THREE.Group
let animationId: number

// ── 相机漫游记忆状态 ──
const preFocusCamPos = new THREE.Vector3()
const preFocusTarget = new THREE.Vector3()

// ── 交互状态 (区分拖拽与点击) ──
const pointerDownPos = new THREE.Vector2()
let isDragging = false

// ── 资源追踪 (onUnmounted 统一 dispose) ──
const trackedGeos: THREE.BufferGeometry[] = []
const trackedMats: THREE.Material[] = []

// ── 实例化映射表与发光代理 ──
const hitboxMeshes: THREE.InstancedMesh[] = []
const instanceDataMap = new Map<THREE.InstancedMesh, { items: IcebergItem[], group: THREE.Group, baseScales: number[], colors: number[], brightColors: number[], visibleMeshes: THREE.InstancedMesh[] }>()

const gemGeos: THREE.BufferGeometry[] = []
let hoverProxy: THREE.Mesh
let focusProxy: THREE.Mesh

let raycaster: THREE.Raycaster
let mouse = new THREE.Vector2()
let particles: THREE.Points
let focusRing: THREE.Mesh
let focusTargetMesh: { mesh: THREE.InstancedMesh; id: number; brightColor: number } | null = null
let currentHoverInstance: { mesh: THREE.InstancedMesh; id: number; color: number; brightColor: number } | null = null

// ── GSAP 动画引擎 ──
let tweenObj = { p: 0 }
const ringPosObj = { x: 0, y: 0, z: 0 }  // 光环位置动画目标
const ringScaleObj = { s: 0 }              // 光环缩放动画目标

// ── 冰山生成 ──
function sculptLowPolyIceberg(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const noise = Math.sin(v.x * 2.5) * Math.cos(v.z * 2.5) * 0.2 + Math.sin(v.y * 2) * 0.15
    v.multiplyScalar(1 + noise)

    const heightRatio = Math.abs(v.y) / 2.5 
    const taper = Math.max(0, 1.2 - heightRatio * 1.1)

    if (v.y > 0) {
      v.x *= taper * 0.75; v.z *= taper * 0.75; v.y *= 1.8 
    } else {
      v.x *= taper * 1.15; v.z *= taper * 1.15; v.y *= 4.5 
    }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
}

function buildScene() {
  icebergGroup = new THREE.Group()
  
  const iceMaterial = new THREE.MeshStandardMaterial({
    color: 0xdcf2ff, roughness: 0.55, metalness: 0.05, flatShading: true,
    emissive: 0x021526, emissiveIntensity: 0.7, transparent: true, opacity: 0.92
  })

  trackedMats.push(iceMaterial)
  const coreGeo = new THREE.IcosahedronGeometry(2.0, 2)
  trackedGeos.push(coreGeo)
  sculptLowPolyIceberg(coreGeo)
  const coreMesh = new THREE.Mesh(coreGeo, iceMaterial)
  icebergGroup.add(coreMesh)

  for (let i = 0; i < 24; i++) {
    const size = 0.05 + Math.random() * 0.12
    const chunkGeo = new THREE.OctahedronGeometry(size, 0)
    trackedGeos.push(chunkGeo)
    const chunk = new THREE.Mesh(chunkGeo, iceMaterial)
    chunk.scale.set(1 + Math.random() * 0.5, 2 + Math.random() * 2.5, 1 + Math.random() * 0.5)
    const angle = Math.random() * Math.PI * 2
    const dist = 3.5 + Math.random() * 4.5 
    const height = (Math.random() - 0.5) * 6.0 
    
    chunk.position.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist)
    chunk.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    chunk.userData = { rotSpeedX: (Math.random() - 0.5) * 0.002, rotSpeedY: (Math.random() - 0.5) * 0.002 }
    icebergGroup.add(chunk)
  }
  scene.add(icebergGroup)
}

function createProxy() {
  const proxyMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1.2,
    roughness: 0.1,
    metalness: 0.8
  })
  trackedMats.push(proxyMat)
  const proxy = new THREE.Mesh(new THREE.BufferGeometry(), proxyMat)
  proxy.visible = false
  return proxy
}

function initRingsAndEntries() {
  ringsGroup = new THREE.Group()
  ringsGroup.rotation.x = Math.PI * 0.1
  ringsGroup.rotation.z = -Math.PI * 0.05
  raycaster = new THREE.Raycaster()

  if (gemGeos.length === 0) {
    gemGeos.push(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(1, 0)
    )
    gemGeos.forEach(g => trackedGeos.push(g))
  }
  
  if (!hoverProxy) hoverProxy = createProxy()
  if (!focusProxy) focusProxy = createProxy()

  const ICE_TINT = { r: 0.85, g: 0.90, b: 0.95 } 
  function desaturate(hex: number): number {
    const r = ((hex >> 16) & 0xff) / 255
    const g = ((hex >> 8) & 0xff) / 255
    const b = (hex & 0xff) / 255
    const dr = Math.round((r * 0.2 + ICE_TINT.r * 0.8) * 255)
    const dg = Math.round((g * 0.2 + ICE_TINT.g * 0.8) * 255)
    const db = Math.round((b * 0.2 + ICE_TINT.b * 0.8) * 255)
    return (dr << 16) | (dg << 8) | db
  }

  const categoryColors: Record<string, number> = {}
  const saturatedCategoryColors: Record<string, number> = {}
  if (data.categoryColors) {
    for (const [cat, hex] of Object.entries(data.categoryColors)) {
      const rawColor = parseInt(hex.replace('#', ''), 16)
      categoryColors[cat] = desaturate(rawColor)
      saturatedCategoryColors[cat] = rawColor
    }
  }

  const tierOrder = data.tierOrder || Object.keys(data.tiers)

  const hitGeo = new THREE.SphereGeometry(0.35, 8, 8)
  trackedGeos.push(hitGeo)
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  trackedMats.push(hitMat)

  const ringGeo = new THREE.RingGeometry(0.85, 0.92, 48)
  trackedGeos.push(ringGeo)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false })
  trackedMats.push(ringMat)
  focusRing = new THREE.Mesh(ringGeo, ringMat)
  focusRing.renderOrder = 999
  focusRing.visible = false
  scene.add(focusRing)

  const markerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.5, metalness: 0.1, flatShading: true,
    emissive: 0x051b2b, emissiveIntensity: 0.8
  })
  trackedMats.push(markerMat)

  const defaultColor = new THREE.Color()
  const dummy = new THREE.Object3D()

  tierOrder.forEach((tierName, ti) => {
    const items = data.tiers[tierName] || []
    const count = items.length
    if (count === 0) return

    const radius = 5.0 + ti * 2.8
    const baseScale = ti < 3 ? 0.09 : ti < 5 ? 0.07 : 0.06

    const orbitGroup = new THREE.Group()
    orbitGroup.userData = { rotateSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.0007 + Math.random() * 0.0007) / (ti + 1) }

    const visibleMeshes = gemGeos.map(geo => {
      const mesh = new THREE.InstancedMesh(geo, markerMat, count)
      orbitGroup.add(mesh)
      return mesh
    })
    const hiddenHitMesh = new THREE.InstancedMesh(hitGeo, hitMat, count)

    const scales: number[] = []; const colors: number[] = []; const brightColors: number[] = []; const geoCounts = [0, 0, 0]

    items.forEach((item, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.15
      const yOffset = (Math.random() - 0.5) * 2.0
      const x = Math.cos(angle) * (radius + (Math.random() - 0.5) * 2.0)
      const z = Math.sin(angle) * (radius + (Math.random() - 0.5) * 2.0)

      const catColor = categoryColors[item.category] || 0xffffff
      colors.push(catColor)
      brightColors.push(saturatedCategoryColors[item.category] || 0xffffff)
      scales.push(baseScale)

      dummy.position.set(x, yOffset, z)
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)

      const sx = baseScale * (0.6 + Math.random() * 0.9)
      const sy = baseScale * (0.3 + Math.random() * 0.8)
      const sz = baseScale * (0.6 + Math.random() * 0.9)
      dummy.scale.set(sx, sy, sz)
      dummy.updateMatrix()

      const geoIdx = i % 3
      const localIdx = geoCounts[geoIdx]
      visibleMeshes[geoIdx].setMatrixAt(localIdx, dummy.matrix)
      visibleMeshes[geoIdx].setColorAt(localIdx, defaultColor.setHex(catColor))
      geoCounts[geoIdx]++

      dummy.scale.setScalar(1.0)
      dummy.updateMatrix()
      hiddenHitMesh.setMatrixAt(i, dummy.matrix)
    })

    for (let gi = 0; gi < 3; gi++) {
      for (let ui = geoCounts[gi]; ui < count; ui++) {
        dummy.scale.setScalar(0)
        dummy.updateMatrix()
        visibleMeshes[gi].setMatrixAt(ui, dummy.matrix)
      }
      visibleMeshes[gi].instanceMatrix.needsUpdate = true
      if (visibleMeshes[gi].instanceColor) (visibleMeshes[gi].instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true
    }

    orbitGroup.add(hiddenHitMesh)
    hitboxMeshes.push(hiddenHitMesh)
    instanceDataMap.set(hiddenHitMesh, { items, group: orbitGroup, baseScales: scales, colors, brightColors, visibleMeshes })
    ringsGroup.add(orbitGroup)
  })
  scene.add(ringsGroup)
}

function getInstanceWorldPos(hitMesh: THREE.InstancedMesh, instanceId: number, parentGroup: THREE.Group) {
  const matrix = new THREE.Matrix4()
  hitMesh.getMatrixAt(instanceId, matrix)
  const pos = new THREE.Vector3()
  pos.setFromMatrixPosition(matrix)
  pos.applyMatrix4(parentGroup.matrixWorld) 
  return pos
}

// ── 高亮代理方法 (使用强发光 Mesh 覆盖以激发 Bloom) ──
function applyProxy(proxy: THREE.Mesh, hit: { mesh: THREE.InstancedMesh; id: number; brightColor: number }) {
  const mapData = instanceDataMap.get(hit.mesh)!
  const geoIdx = hit.id % 3
  const localIdx = Math.floor(hit.id / 3)
  
  proxy.geometry = gemGeos[geoIdx]
  ;(proxy.material as THREE.MeshStandardMaterial).emissive.setHex(hit.brightColor)
  
  const matrix = new THREE.Matrix4()
  mapData.visibleMeshes[geoIdx].getMatrixAt(localIdx, matrix)
  
  proxy.matrix.copy(matrix)
  proxy.matrix.decompose(proxy.position, proxy.quaternion, proxy.scale)
  proxy.scale.multiplyScalar(1.25) // 放大25%并挂载到组以盖住原本的实例，实现无缝跟随
  
  mapData.group.add(proxy)
  proxy.visible = true
}

function highlightInstance(hit: { mesh: THREE.InstancedMesh; id: number; brightColor: number }) {
  applyProxy(hoverProxy, hit)
}

function unhighlightInstance() {
  hoverProxy.visible = false
  if (hoverProxy.parent) hoverProxy.parent.remove(hoverProxy)
}


// ── 运镜控制 ──
function focusOnData(data: HoverData) {
  if (!isFocusMode.value) {
    preFocusCamPos.copy(camera.position)
    preFocusTarget.copy(controls.target)
  }
  
  isFocusMode.value = true
  selectedEntry.value = data
  controls.enabled = false 

  focusTargetMesh = currentHoverInstance ? { mesh: currentHoverInstance.mesh, id: currentHoverInstance.id, brightColor: currentHoverInstance.brightColor } : null
  if (focusTargetMesh) applyProxy(focusProxy, focusTargetMesh)

  const wasVisible = focusRing.visible
  const oldPos = focusRing.position.clone()
  focusRing.userData.baseScale = data.baseScale
  focusRing.visible = true
  focusRing.quaternion.copy(camera.quaternion)

  const targetScale = data.baseScale * 4

  // 词条间跳动：光环位置平滑过渡
  gsap.killTweensOf(ringPosObj)
  ringPosObj.x = oldPos.x; ringPosObj.y = oldPos.y; ringPosObj.z = oldPos.z
  gsap.to(ringPosObj, {
    x: data.worldPos.x, y: data.worldPos.y, z: data.worldPos.z,
    duration: wasVisible ? 0.45 : 0.01, ease: 'power2.out',
    onUpdate: () => focusRing.position.set(ringPosObj.x, ringPosObj.y, ringPosObj.z),
  })

  // 入场缩放：从 0 弹入
  gsap.killTweensOf(ringScaleObj)
  if (!wasVisible) {
    ringScaleObj.s = 0
    gsap.to(ringScaleObj, {
      s: targetScale, duration: 0.55, ease: 'back.out(1.4)',
      onUpdate: () => focusRing.scale.setScalar(ringScaleObj.s),
    })
  } else {
    ringScaleObj.s = targetScale
    focusRing.scale.setScalar(targetScale)
  }

  const targetPos = data.worldPos.clone()
  const startCamPos = camera.position.clone()
  const startTarget = controls.target.clone()
  const startOffset = camera.view?.offsetX || 0

  const dirFromCenter = targetPos.clone().normalize()
  if (dirFromCenter.lengthSq() === 0) dirFromCenter.set(0,0,1)
  const distance = 3.5 
  const endCamPos = targetPos.clone().add(dirFromCenter.multiplyScalar(distance))
  endCamPos.y += 1.0 

  const container = containerRef.value!
  const width = container.clientWidth
  const height = container.clientHeight
  const endOffset = width * 0.25 

  const dir = new THREE.Vector3().subVectors(endCamPos, startCamPos)
  const side = new THREE.Vector3().crossVectors(dir.clone().normalize(), new THREE.Vector3(0, 1, 0)).normalize()
  const arcRadius = dir.length() * 0.2

  gsap.killTweensOf(tweenObj)
  tweenObj.p = 0
  gsap.to(tweenObj, {
    p: 1, duration: 1.2, ease: 'power3.inOut',
    onUpdate: () => {
      const p = tweenObj.p
      const camPos = new THREE.Vector3().lerpVectors(startCamPos, endCamPos, p)
      const arc = Math.sin(p * Math.PI)
      camPos.add(side.clone().multiplyScalar(arc * arcRadius))
      camPos.y += arc * arcRadius * 0.5
      camera.position.copy(camPos)
      controls.target.lerpVectors(startTarget, targetPos, p)
      camera.lookAt(controls.target)
      const currentOffset = startOffset + (endOffset - startOffset) * p
      camera.setViewOffset(width, height, currentOffset, 0, width, height)
    },
    onComplete: () => {
      controls.enabled = true
      controls.update()
    },
  })
}

function exitFocusMode() {
  if (!isFocusMode.value) return
  isFocusMode.value = false
  selectedEntry.value = null
  focusTargetMesh = null
  
  focusProxy.visible = false
  if (focusProxy.parent) focusProxy.parent.remove(focusProxy)

  // 光环缩放退场
  gsap.killTweensOf(ringScaleObj)
  ringScaleObj.s = focusRing.scale.x
  gsap.to(ringScaleObj, {
    s: 0, duration: 0.3, ease: 'power2.in',
    onUpdate: () => focusRing.scale.setScalar(ringScaleObj.s),
    onComplete: () => { focusRing.visible = false },
  })

  controls.enabled = false

  const startCamPos = camera.position.clone()
  const startTarget = controls.target.clone()
  const startOffset = camera.view?.offsetX || 0

  const endCamPos = preFocusCamPos.clone()
  const endTarget = preFocusTarget.clone()

  const container = containerRef.value!
  const width = container.clientWidth
  const height = container.clientHeight

  gsap.killTweensOf(tweenObj)
  tweenObj.p = 0
  gsap.to(tweenObj, {
    p: 1, duration: 1.0, ease: 'power3.inOut',
    onUpdate: () => {
      const p = tweenObj.p
      camera.position.lerpVectors(startCamPos, endCamPos, p)
      controls.target.lerpVectors(startTarget, endTarget, p)
      camera.lookAt(controls.target)
      const currentOffset = startOffset * (1 - p)
      camera.setViewOffset(width, height, currentOffset, 0, width, height)
    },
    onComplete: () => {
      camera.clearViewOffset()
      controls.enabled = true
      controls.update()
    },
  })
}

// ── 交互事件 ──
function raycastHitbox(): { mesh: THREE.InstancedMesh; id: number; color: number; brightColor: number } | null {
  if (!containerRef.value) return null
  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(hitboxMeshes, false)

  if (intersects.length === 0) return null
  if (intersects.length === 1) {
    const m = intersects[0].object as THREE.InstancedMesh
    const i = intersects[0].instanceId!
    const d = instanceDataMap.get(m)!
    return { mesh: m, id: i, color: d.colors[i], brightColor: d.brightColors[i] }
  }

  const rect = containerRef.value.getBoundingClientRect()
  const sx = ((mouse.x + 1) / 2) * rect.width
  const sy = ((-mouse.y + 1) / 2) * rect.height

  let best: { mesh: THREE.InstancedMesh; id: number; color: number; brightColor: number } | null = null
  let bestDist = Infinity

  for (const hit of intersects) {
    const instMesh = hit.object as THREE.InstancedMesh
    const instanceId = hit.instanceId!
    const mapData = instanceDataMap.get(instMesh)
    if (!mapData) continue

    const wp = getInstanceWorldPos(instMesh, instanceId, mapData.group)
    wp.project(camera)
    const hx = (wp.x * 0.5 + 0.5) * rect.width
    const hy = (-wp.y * 0.5 + 0.5) * rect.height
    const dist = (hx - sx) ** 2 + (hy - sy) ** 2

    if (dist < bestDist) {
      bestDist = dist
      best = { mesh: instMesh, id: instanceId, color: mapData.colors[instanceId], brightColor: mapData.brightColors[instanceId] }
    }
  }
  return best
}


function onPointerDown(e: PointerEvent) {
  if (!containerRef.value) return
  pointerDownPos.set(e.clientX, e.clientY)
  isDragging = false

  const hit = raycastHitbox()
  if (hit) {
    currentHoverInstance = hit
    highlightInstance(hit)
  }
}

function onPointerMove(e: PointerEvent) {
  if (!containerRef.value) return

  if (pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5) {
    isDragging = true
  }

  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  const hit = raycastHitbox()
  if (hit) {
    if (!currentHoverInstance || currentHoverInstance.mesh !== hit.mesh || currentHoverInstance.id !== hit.id) {
      if (currentHoverInstance) unhighlightInstance()
      currentHoverInstance = hit
      highlightInstance(hit)
      containerRef.value.style.cursor = 'crosshair'
    }
  } else {
    if (currentHoverInstance) { unhighlightInstance(); currentHoverInstance = null }
    if (containerRef.value) containerRef.value.style.cursor = isFocusMode.value ? 'pointer' : 'grab'
  }
}

function onPointerUp(e: PointerEvent) {
  if (!containerRef.value) return
  if (isDragging) return

  if (currentHoverInstance) {
    unhighlightInstance()
    const hit = currentHoverInstance
    const mapData = instanceDataMap.get(hit.mesh)!
    mapData.group.updateMatrixWorld(true)
    const worldPos = getInstanceWorldPos(hit.mesh, hit.id, mapData.group)

    focusOnData({
      item: mapData.items[hit.id],
      worldPos,
      baseScale: mapData.baseScales[hit.id],
      tierColor: mapData.colors[hit.id] || 0xffffff
    })
    
    currentHoverInstance = null
  } else {
    if (isFocusMode.value && !gsap.isTweening(tweenObj)) {
      exitFocusMode()
    }
  }
}

onMounted(() => {
  const container = containerRef.value!
  const { width, height } = container.getBoundingClientRect()

  try {
    const testCanvas = document.createElement('canvas')
    if (!testCanvas.getContext('webgl2') && !testCanvas.getContext('webgl')) throw new Error()
  } catch {
    webglUnavailable.value = true; isLoading.value = false; return
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020408)
  scene.fog = new THREE.FogExp2(0x020408, 0.015)

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
  camera.position.set(10, 6, 16)
  
  preFocusCamPos.copy(camera.position)
  preFocusTarget.set(0, 0, 0)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.maxDistance = 80
  controls.minDistance = 2 
  controls.enablePan = true
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE } 

  // ── 配置 Post-Processing (发光Bloom管线) ──
  const renderScene = new RenderPass(scene, camera)
  // 参数: 分辨率, 发光强度, 半径, 阈值 (2.0 的阈值确保普通受光不会泛光，只有代理发光体会泛光)
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.35, 0.3, 2.0)
  
  const outputPass = new OutputPass() // 将线性空间输出为 sRGB

  composer = new EffectComposer(renderer)
  composer.addPass(renderScene)
  composer.addPass(bloomPass)
  composer.addPass(outputPass)


  scene.add(new THREE.AmbientLight(0x0a1525, 1.0))
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.5)
  mainLight.position.set(10, 20, 10)
  scene.add(mainLight)
  const rimLight = new THREE.DirectionalLight(0x0088ff, 4.0)
  rimLight.position.set(-15, 5, -20)
  scene.add(rimLight)

  buildScene()
  initRingsAndEntries()

  // ── 漂浮微尘粒子 ──
  const pCount = 500
  const pGeo = new THREE.BufferGeometry()
  const posArray = new Float32Array(pCount * 3)
  for (let i = 0; i < pCount * 3; i += 3) {
    posArray[i] = (Math.random() - 0.5) * 50
    posArray[i + 1] = (Math.random() - 0.5) * 30
    posArray[i + 2] = (Math.random() - 0.5) * 50
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
  const pMat = new THREE.PointsMaterial({ size: 0.06, color: 0x88aacc, transparent: true, opacity: 0.4, depthWrite: false })
  particles = new THREE.Points(pGeo, pMat)
  trackedGeos.push(pGeo)
  trackedMats.push(pMat)
  scene.add(particles)

  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerup', onPointerUp)
  
  requestAnimationFrame(() => { isLoading.value = false })
  animate()
  window.addEventListener('resize', onResize)
})

const timer = new THREE.Timer()

function animate() {
  animationId = requestAnimationFrame(animate)
  timer.update()
  const elapsedTime = timer.getElapsed()

  if (controls.enabled && !gsap.isTweening(tweenObj)) controls.update()

  icebergGroup.rotation.y = elapsedTime * 0.002
  icebergGroup.position.y = Math.sin(elapsedTime * 0.3) * 0.1

  for (let i = 1; i < icebergGroup.children.length; i++) {
    const chunk = icebergGroup.children[i]
    chunk.rotation.x += chunk.userData.rotSpeedX
    chunk.rotation.y += chunk.userData.rotSpeedY
  }

  ringsGroup.children.forEach((orbitGroup) => {
    const speed = orbitGroup.userData.rotateSpeed
    orbitGroup.rotation.y += isFocusMode.value ? speed * 0.15 : speed
  })

  // 粒子缓慢上升 + 旋转
  if (particles) {
    particles.rotation.y += 0.0003
    particles.position.y = Math.sin(elapsedTime * 0.2) * 0.5
  }

  if (focusRing.visible && focusTargetMesh) {
    // GSAP 未控制位置时持续追踪钻石世界坐标
    if (!gsap.isTweening(ringPosObj)) {
      const mapData = instanceDataMap.get(focusTargetMesh.mesh)
      if (mapData) {
        mapData.group.updateMatrixWorld(true)
        const wp = getInstanceWorldPos(focusTargetMesh.mesh, focusTargetMesh.id, mapData.group)
        focusRing.position.copy(wp)
      }
    }
    focusRing.quaternion.copy(camera.quaternion)
    // GSAP 未控制缩放时保持目标尺寸
    if (!gsap.isTweening(ringScaleObj)) {
      const bs = (focusRing.userData.baseScale as number) || 0.07
      focusRing.scale.setScalar(bs * 4)
    }
  }

  // 通过 Composer 输出渲染，呈现 Bloom 效果
  composer.render()
}

function onResize() {
  if (!containerRef.value) return
  const { width, height } = containerRef.value.getBoundingClientRect()
  renderer.setSize(width, height)
  composer.setSize(width, height) // 必须同步更新 Composer 的尺寸
  camera.aspect = width / height
  camera.updateProjectionMatrix()

  if (isFocusMode.value && !gsap.isTweening(tweenObj)) {
    camera.setViewOffset(width, height, width * 0.25, 0, width, height)
  }
}

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  gsap.killTweensOf(tweenObj)
  window.removeEventListener('resize', onResize)
  containerRef.value?.removeEventListener('pointerdown', onPointerDown)
  containerRef.value?.removeEventListener('pointermove', onPointerMove)
  containerRef.value?.removeEventListener('pointerup', onPointerUp)
  trackedGeos.forEach(g => g.dispose())
  trackedMats.forEach(m => m.dispose())
  renderer?.dispose()
  composer?.dispose()
  scene?.clear()
  controls?.dispose()
})
</script>

<template>
  <div class="iceberg-3d-page">
    <div ref="containerRef" class="canvas-container"></div>

    <div class="scene-ui" :class="{ 'hidden': isFocusMode }">
      <router-link to="/" class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>返回</span>
      </router-link>
    </div>

    <!-- 右侧信息栏 -->
    <aside class="detail-panel" :class="{ 'open': isFocusMode }">
      <transition name="panel-switch" mode="out-in">
        <div class="panel-inner" v-if="selectedEntry" :key="selectedEntry.item.id || selectedEntry.item.title">

          <div class="panel-top">
            <span
              class="cat-badge"
              :style="{ color: '#' + selectedEntry.tierColor.toString(16).padStart(6, '0'), borderColor: '#' + selectedEntry.tierColor.toString(16).padStart(6, '0') }"
            >{{ selectedEntry.item.category }}</span>
            <button class="close-btn" @click="exitFocusMode" aria-label="关闭">&times;</button>
          </div>

          <h2 class="panel-title">{{ selectedEntry.item.title }}</h2>

          <div class="panel-tags" v-if="selectedEntry.item.tags?.length">
            <span v-for="t in selectedEntry.item.tags" :key="t">#{{ t }}</span>
          </div>

          <p class="panel-desc">{{ selectedEntry.item.desc || '暂无描述。' }}</p>

          <a v-if="selectedEntry.item.link" :href="selectedEntry.item.link" target="_blank" rel="noopener" class="panel-link">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 2h3v3M8 8l6-6" /></svg>
            打开链接
          </a>

        </div>
      </transition>
    </aside>
  </div>
</template>

<style scoped>
.iceberg-3d-page {
  position: fixed; inset: 0; background: #020408;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.canvas-container {
  position: absolute; inset: 0; z-index: 1;
}

.scene-ui {
  position: absolute; top: 0; left: 0; right: 0; pointer-events: none; z-index: 10;
  padding: 2rem;
  transition: opacity 0.4s ease;
}
.scene-ui.hidden { opacity: 0; pointer-events: none; }

.back-btn {
  pointer-events: auto; display: inline-flex; align-items: center; gap: 0.5rem;
  color: #ffffff55; text-decoration: none; font-size: 0.8rem;
  transition: color 0.2s; width: fit-content;
}
.back-btn:hover { color: #ffffffcc; }

.detail-panel {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 20;
  width: 420px; max-width: 90vw;
  background: rgba(8, 10, 16, 0.97);
  border-left: 1px solid rgba(255,255,255,0.06);
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column;
}
.detail-panel.open { transform: translateX(0); }

.panel-inner {
  padding: 2.5rem 2rem; height: 100%;
  box-sizing: border-box; overflow-y: auto;
  display: flex; flex-direction: column;
}

.panel-top {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 1.5rem;
}

.cat-badge {
  font-size: 0.75rem; font-weight: 500;
  border: 1px solid; padding: 0.2rem 0.6rem;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.panel-switch-enter-from .cat-badge,
.panel-switch-leave-to .cat-badge { opacity: 0; transform: translateY(8px); }
.panel-switch-enter-from .cat-badge { transition-delay: 0s; }

.close-btn {
  background: none; border: none; color: #ffffff33; cursor: pointer;
  font-size: 1.4rem; line-height: 1; padding: 0 0 0.2rem 0.5rem;
  transition: color 0.15s;
}
.close-btn:hover { color: #ffffff99; }

.panel-title {
  margin: 0 0 1rem; font-size: 1.25rem; font-weight: 500;
  line-height: 1.35; color: #fff; letter-spacing: -0.01em;
  transition: opacity 0.3s ease 0.04s, transform 0.3s ease 0.04s;
}
.panel-switch-enter-from .panel-title,
.panel-switch-leave-to .panel-title { opacity: 0; transform: translateY(8px); }

.panel-tags {
  display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; margin-bottom: 1.25rem;
  transition: opacity 0.3s ease 0.08s, transform 0.3s ease 0.08s;
}
.panel-tags span { font-size: 0.7rem; color: #ffffff25; }
.panel-switch-enter-from .panel-tags,
.panel-switch-leave-to .panel-tags { opacity: 0; transform: translateY(8px); }

.panel-desc {
  font-size: 0.875rem; line-height: 1.7; color: #ffffff55;
  margin: 0; white-space: pre-wrap; flex: 1;
  transition: opacity 0.3s ease 0.12s, transform 0.3s ease 0.12s;
}
.panel-switch-enter-from .panel-desc,
.panel-switch-leave-to .panel-desc { opacity: 0; transform: translateY(8px); }

.panel-link {
  display: inline-flex; align-items: center; gap: 0.5rem;
  margin-top: 1.5rem; padding: 0.5rem 1.25rem;
  border: 1px solid rgba(255,255,255,0.25); border-radius: 8px;
  font-size: 0.75rem; font-weight: 500; color: #ffffff55; text-decoration: none;
  transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.3s ease 0.16s, transform 0.3s ease 0.16s;
  align-self: flex-start;
}
.panel-link:hover { background: rgba(255,255,255,0.08); color: #ffffffcc; border-color: rgba(255,255,255,0.4); }
.panel-switch-enter-from .panel-link,
.panel-switch-leave-to .panel-link { opacity: 0; transform: translateY(8px); }

.panel-inner::-webkit-scrollbar { width: 4px; }
.panel-inner::-webkit-scrollbar-track { background: transparent; }
.panel-inner::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }

/* 面板整体淡入 + 子元素阶梯视差 */
.panel-switch-enter-active, .panel-switch-leave-active {
  transition: opacity 0.2s ease;
}
.panel-switch-enter-from, .panel-switch-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .detail-panel {
    width: 100%; max-width: none; border-left: none; border-top: 1px solid rgba(255,255,255,0.06);
    top: auto; height: 60vh; transform: translateY(100%);
  }
  .detail-panel.open { transform: translateY(0); }
  .panel-inner { padding: 1.5rem; }
  .panel-title { font-size: 1.15rem; }
}
</style>