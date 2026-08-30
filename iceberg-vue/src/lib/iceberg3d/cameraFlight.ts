import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { isTweening, killTweensOf, to } from './tween'
import type { IcebergItem } from '../data'

/** reduced-motion：镜头飞行动画改为瞬移（style 审计动效覆盖） */
const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 聚焦态数据：词条 + 世界坐标 + 基准缩放 + 层级色（供 UI/URL 使用） */
export interface FocusState {
  item: IcebergItem
  worldPos: THREE.Vector3
  baseScale: number
  tierColor: number
}

/**
 * 聚焦相机：沿弧线靠近目标，用小幅视锥偏移为详情栏留出呼吸空间，
 * 并加入方向自适应的克制 Dutch angle。退出时完整恢复水平构图。
 */
export class CameraFlight {
  isFocusMode = false

  private preFocusCamPos = new THREE.Vector3()
  private preFocusTarget = new THREE.Vector3()
  private tweenObj = { p: 0 }
  private currentRoll = 0
  private focusRoll = 0

  constructor(
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private container: HTMLElement,
  ) {}

  /** 桌面端仅把目标微微推向左侧；移动端详情从底部出现，不做横向偏移。 */
  private getFocusOffset(width: number): number {
    if (width <= 640) return 0
    return Math.min(width * 0.07, 76)
  }

  private applyRoll(roll: number) {
    this.currentRoll = roll
    if (Math.abs(roll) > 0.00001) this.camera.rotateZ(roll)
  }

  /** 聚焦：从任意位置沿弧线飞入目标。 */
  focus(target: FocusState) {
    if (!this.isFocusMode) {
      this.preFocusCamPos.copy(this.camera.position)
      this.preFocusTarget.copy(this.controls.target)
    }
    this.isFocusMode = true
    this.controls.enabled = false

    const targetPos = target.worldPos.clone()
    const startCamPos = this.camera.position.clone()
    const startTarget = this.controls.target.clone()
    const startOffset = this.camera.view?.offsetX || 0
    const startRoll = this.currentRoll

    // 从冰山外侧观察目标，并略微抬高机位以保留空间纵深。
    const dirFromCenter = targetPos.clone().normalize()
    if (dirFromCenter.lengthSq() === 0) dirFromCenter.set(0, 0, 1)
    const distance = 3.5
    const endCamPos = targetPos.clone().add(dirFromCenter.multiplyScalar(distance))
    endCamPos.y += 1.0

    const { width, height } = this.container.getBoundingClientRect()
    const endOffset = this.getFocusOffset(width)
    const rollDirection = targetPos.x >= 0 ? -1 : 1
    this.focusRoll = THREE.MathUtils.degToRad(5.2) * rollDirection

    // 非直线飞入：横向弧线和轻微抬升让镜头靠近过程更自然。
    const dir = new THREE.Vector3().subVectors(endCamPos, startCamPos)
    const side = new THREE.Vector3()
      .crossVectors(dir.clone().normalize(), new THREE.Vector3(0, 1, 0))
      .normalize()
    const arcRadius = dir.length() * 0.18

    killTweensOf(this.tweenObj)
    this.tweenObj.p = 0
    to(this.tweenObj, {
      p: 1,
      duration: prefersReducedMotion() ? 0.01 : 1.25,
      ease: 'power3.inOut',
      onUpdate: () => {
        const p = this.tweenObj.p
        const easedRoll = THREE.MathUtils.smoothstep(p, 0.18, 1)
        const camPos = new THREE.Vector3().lerpVectors(startCamPos, endCamPos, p)
        const arc = Math.sin(p * Math.PI)
        camPos.add(side.clone().multiplyScalar(arc * arcRadius))
        camPos.y += arc * arcRadius * 0.45
        this.camera.position.copy(camPos)
        this.controls.target.lerpVectors(startTarget, targetPos, p)
        this.camera.lookAt(this.controls.target)
        this.applyRoll(THREE.MathUtils.lerp(startRoll, this.focusRoll, easedRoll))
        this.camera.setViewOffset(
          width,
          height,
          THREE.MathUtils.lerp(startOffset, endOffset, p),
          0,
          width,
          height,
        )
      },
      onComplete: () => {
        this.controls.enabled = true
        this.controls.update()
        this.applyFocusRoll()
      },
    })
  }

  /** 退出聚焦：沿平滑路径飞回，并同步撤销偏移与镜头倾斜。 */
  exit() {
    if (!this.isFocusMode) return
    this.isFocusMode = false
    this.controls.enabled = false

    const startCamPos = this.camera.position.clone()
    const startTarget = this.controls.target.clone()
    const startOffset = this.camera.view?.offsetX || 0
    const startRoll = this.currentRoll
    const endCamPos = this.preFocusCamPos.clone()
    const endTarget = this.preFocusTarget.clone()
    const { width, height } = this.container.getBoundingClientRect()

    killTweensOf(this.tweenObj)
    this.tweenObj.p = 0
    to(this.tweenObj, {
      p: 1,
      duration: prefersReducedMotion() ? 0.01 : 1.05,
      ease: 'power3.inOut',
      onUpdate: () => {
        const p = this.tweenObj.p
        this.camera.position.lerpVectors(startCamPos, endCamPos, p)
        this.controls.target.lerpVectors(startTarget, endTarget, p)
        this.camera.lookAt(this.controls.target)
        this.applyRoll(THREE.MathUtils.lerp(startRoll, 0, p))
        this.camera.setViewOffset(width, height, startOffset * (1 - p), 0, width, height)
      },
      onComplete: () => {
        this.currentRoll = 0
        this.focusRoll = 0
        this.camera.clearViewOffset()
        this.controls.enabled = true
        this.controls.update()
      },
    })
  }

  /** OrbitControls.update() 会重建相机朝向；聚焦态每次更新后重新施加 roll。 */
  applyFocusRoll() {
    if (!this.isFocusMode || this.isFlying()) return
    this.camera.rotateZ(this.focusRoll)
    this.currentRoll = this.focusRoll
  }

  /** resize 后恢复小幅偏心构图和 Dutch angle。 */
  restoreFocusComposition() {
    if (!this.isFocusMode || this.isFlying()) return
    const { width, height } = this.container.getBoundingClientRect()
    const offset = this.getFocusOffset(width)
    if (offset === 0) this.camera.clearViewOffset()
    else this.camera.setViewOffset(width, height, offset, 0, width, height)
    this.camera.lookAt(this.controls.target)
    this.applyFocusRoll()
  }

  isFlying(): boolean {
    return isTweening(this.tweenObj)
  }

  /** 清理：杀 tween、清偏移、恢复水平镜头与控制器。 */
  kill() {
    killTweensOf(this.tweenObj)
    this.currentRoll = 0
    this.focusRoll = 0
    this.camera.clearViewOffset()
    this.controls.enabled = true
  }
}
