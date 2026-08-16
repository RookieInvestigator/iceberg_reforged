import * as THREE from 'three'
import type { IcebergItem } from '../data'

export interface PickHit {
  mesh: THREE.InstancedMesh
  id: number
  color: number
  brightColor: number
}

export interface RingData {
  hitMesh: THREE.InstancedMesh
  items: IcebergItem[]
  group: THREE.Group
  baseScales: number[]
  colors: number[]
  brightColors: number[]
  /** 最近修改（NEW）标记，用于常态发光编码 */
  newFlags: boolean[]
  visibleMeshes: THREE.InstancedMesh[]
  visibleItemIds: number[][]
}

const instanceMatrix = new THREE.Matrix4()
const worldMatrix = new THREE.Matrix4()
const worldCenter = new THREE.Vector3()
const cameraCenter = new THREE.Vector3()
const projectedCenter = new THREE.Vector3()
const worldAxisPoint = new THREE.Vector3()
const projectedAxisPoint = new THREE.Vector3()
const localAxes = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
]

function toScreenX(ndcX: number, width: number) {
  return (ndcX * 0.5 + 0.5) * width
}

function toScreenY(ndcY: number, height: number) {
  return (-ndcY * 0.5 + 0.5) * height
}

/**
 * 可见几何 + 实际投影轮廓拾取：
 * - 真实几何射线与按非均匀缩放、旋转、轨道矩阵计算的投影轮廓共同决定候选；
 * - 多个前后候选重叠时，只按光标到碎片屏幕中心的绝对像素距离选择；
 * - 仅中心几乎等距时按相机深度消歧，避免近景碎片无条件抢走远景目标。
 */
export function pickInstance(
  rings: RingData[],
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  mouseNdc: THREE.Vector2,
  rect: { width: number; height: number },
  coarsePointer = false,
): PickHit | null {
  const raycastCandidates = new Map<THREE.InstancedMesh, Set<number>>()
  const intersections: THREE.Intersection[] = []
  raycaster.setFromCamera(mouseNdc, camera)

  for (const ring of rings) {
    ring.group.updateWorldMatrix(true, true)
    for (const mesh of ring.visibleMeshes) {
      intersections.length = 0
      raycaster.intersectObject(mesh, false, intersections)
      const geometryIndex = ring.visibleMeshes.indexOf(mesh)
      for (const intersection of intersections) {
        if (intersection.instanceId === undefined) continue
        const id = ring.visibleItemIds[geometryIndex]?.[intersection.instanceId]
        if (id === undefined || id >= ring.items.length) continue
        let ids = raycastCandidates.get(ring.hitMesh)
        if (!ids) {
          ids = new Set<number>()
          raycastCandidates.set(ring.hitMesh, ids)
        }
        ids.add(id)
      }
    }
  }

  const sx = toScreenX(mouseNdc.x, rect.width)
  const sy = toScreenY(mouseNdc.y, rect.height)
  const padding = coarsePointer ? 12 : 5
  const depthTieDistance = coarsePointer ? 3 : 1.5

  let best: PickHit | null = null
  let bestDepth = Infinity
  let bestCenterDistance = Infinity

  camera.updateMatrixWorld()

  for (const ring of rings) {
    ring.group.updateWorldMatrix(true, true)

    for (let id = 0; id < ring.items.length; id++) {
      const geometryIndex = id % 3
      const localIndex = Math.floor(id / 3)
      const visibleMesh = ring.visibleMeshes[geometryIndex]
      if (localIndex >= visibleMesh.count) continue

      visibleMesh.getMatrixAt(localIndex, instanceMatrix)
      worldMatrix.multiplyMatrices(visibleMesh.matrixWorld, instanceMatrix)

      worldCenter.setFromMatrixPosition(worldMatrix)
      cameraCenter.copy(worldCenter).applyMatrix4(camera.matrixWorldInverse)
      if (cameraCenter.z >= -0.01) continue
      const depth = -cameraCenter.z

      projectedCenter.copy(worldCenter).project(camera)
      if (projectedCenter.z < -1 || projectedCenter.z > 1) continue

      const cx = toScreenX(projectedCenter.x, rect.width)
      const cy = toScreenY(projectedCenter.y, rect.height)
      const dx = sx - cx
      const dy = sy - cy
      const centerDistance = Math.hypot(dx, dy)

      // 计算椭球投影在“中心指向鼠标”方向上的支撑半径。
      let supportSq = 0
      let maxAxisRadius = 0
      const invCenterDistance = centerDistance > 1e-4 ? 1 / centerDistance : 0
      const ux = dx * invCenterDistance
      const uy = dy * invCenterDistance

      for (const axis of localAxes) {
        worldAxisPoint.copy(axis).applyMatrix4(worldMatrix)
        cameraCenter.copy(worldAxisPoint).applyMatrix4(camera.matrixWorldInverse)
        if (cameraCenter.z >= -0.01) continue

        projectedAxisPoint.copy(worldAxisPoint).project(camera)
        const ax = toScreenX(projectedAxisPoint.x, rect.width) - cx
        const ay = toScreenY(projectedAxisPoint.y, rect.height) - cy
        const axisRadius = Math.hypot(ax, ay)
        maxAxisRadius = Math.max(maxAxisRadius, axisRadius)
        const directionalExtent = centerDistance > 1e-4 ? ax * ux + ay * uy : axisRadius
        supportSq += directionalExtent * directionalExtent
      }

      const projectedRadius = centerDistance > 1e-4 ? Math.sqrt(supportSq) : maxAxisRadius
      const hitRadius = Math.max(projectedRadius + padding, coarsePointer ? 16 : 8)
      const hasRaycastHit = raycastCandidates.get(ring.hitMesh)?.has(id) ?? false
      const hasProjectedHit = centerDistance <= hitRadius
      if (!hasRaycastHit && !hasProjectedHit) continue

      const isCloserCenter = centerDistance < bestCenterDistance - depthTieDistance
      const isSameCenter = Math.abs(centerDistance - bestCenterDistance) <= depthTieDistance
      const isCloserDepth = depth < bestDepth

      if (isCloserCenter || (isSameCenter && isCloserDepth)) {
        bestCenterDistance = centerDistance
        bestDepth = depth
        best = {
          mesh: ring.hitMesh,
          id,
          color: ring.colors[id],
          brightColor: ring.brightColors[id],
        }
      }
    }
  }

  return best
}

/** 实例世界坐标：本地矩阵 × 轨道组世界矩阵。 */
export function getInstanceWorldPos(
  hitMesh: THREE.InstancedMesh,
  instanceId: number,
  parentGroup: THREE.Group,
) {
  hitMesh.getMatrixAt(instanceId, instanceMatrix)
  worldCenter.setFromMatrixPosition(instanceMatrix)
  return worldCenter.clone().applyMatrix4(parentGroup.matrixWorld)
}
