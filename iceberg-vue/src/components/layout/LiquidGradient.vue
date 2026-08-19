<script setup lang="ts">
/**
 * LiquidGradient —— 流动液态渐变背景（Mssh meshh 官方组件 Vue 移植）。
 * 填充父容器，纯装饰（aria-hidden）；props 与参考实现一致，默认值为官方 defaultConfig。
 * 引擎为官方 ShaderCanvas 移植（src/lib/shaderCanvas.ts）。
 * WebGL2 不可用时回退为静态渐变。
 */
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { createShaderCanvas, prepareFragmentShader, type ShaderCanvas } from '../../lib/shaderCanvas'
import { fragmentShader, fragmentHeader, buildUniforms } from '../../lib/liquidGradient'

const props = withDefaults(
  defineProps<{
    colorA?: string
    colorB?: string
    colorC?: string
    colorD?: string
    colorE?: string
    seed?: number
    speed?: number
    loop?: number
    scale?: number
    turbAmp?: number
    turbFreq?: number
    turbIter?: number
    waveFreq?: number
    distBias?: number
    jellify?: boolean
    ditherMode?: number
    dither?: number
    exposure?: number
    contrast?: number
    saturation?: number
    /** [项目扩展] 越大则色板采样越向深色端偏移（黑色占比越大），默认 0 = 官方行为 */
    darkShift?: number
    /** [项目扩展] CSS filter: brightness()，1 = 不变，<1 整体压暗（含 WebGL 静态回退图），>1 提亮 */
    brightness?: number
    /** [项目扩展] 渲染帧率上限，默认 30。慢速液态视觉上 24fps 与 30 几乎无差，但 GPU 开销降 20% */
    fps?: number
  }>(),
  {
    colorA: '#001220',
    colorB: '#013a63',
    colorC: '#0582ca',
    colorD: '#00a8e8',
    colorE: '#ff791a',
    seed: 648,
    speed: 0.2,
    loop: 0,
    scale: 0.55,
    turbAmp: 0.4,
    turbFreq: 0.1,
    turbIter: 7,
    waveFreq: 3.8,
    distBias: 0,
    jellify: false,
    ditherMode: 0,
    dither: 0.05,
    exposure: 1.1,
    contrast: 1,
    saturation: 0.9,
    darkShift: 0,
    brightness: 1,
    fps: 30,
  },
)

const containerRef = ref<HTMLElement>()
const failed = ref(false)
/** 整体亮度旋钮：仅在 brightness ≠ 1 时挂 CSS filter（恒等 filter 也会强制滤镜管线，
 *  破坏 WebGL canvas 的直接 GPU 合成快路径 → 滚动卡顿，故默认 1 时完全不挂） */
const liquidFilter = computed(() =>
  props.brightness === 1 ? {} : { filter: `brightness(${props.brightness})` },
)
let engine: ShaderCanvas | null = null
let pageActive = true

function syncUniforms() {
  engine?.setUniforms(buildUniforms(props))
}

// 标签页切到后台时也暂停，切回且页面仍激活时恢复（不降低可见时的表现）
function onVisibilityChange() {
  if (document.hidden) {
    engine?.pause()
  } else if (pageActive) {
    engine?.resume()
  }
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  try {
    engine = createShaderCanvas(el, {
      fragmentShader: prepareFragmentShader(fragmentShader, fragmentHeader),
      uniforms: buildUniforms(props),
      // 性能：backing store 半分辨率（低频渐变视觉无损，片元数 1/4）+ fps 封顶（慢速流动无感）
      resolutionScale: 0.5,
      fps: props.fps,
    })
  } catch {
    failed.value = true
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
})

// keep-alive 失活时暂停 WebGL 渲染循环，避免后台多个流体背景同时跑
onActivated(() => {
  pageActive = true
  if (!document.hidden) engine?.resume()
})
onDeactivated(() => {
  pageActive = false
  engine?.pause()
})

// props 是响应式对象 → watch 深层监听，运行时调参实时生效
watch(props, syncUniforms)
// fps 动态调整（滚动自适应降帧等）：只更新引擎帧率上限，无需重建
watch(() => props.fps, (fps) => engine?.setFps(fps ?? 30))

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div ref="containerRef" class="liquid-gradient" :style="liquidFilter" aria-hidden="true">
    <div v-if="failed" class="liquid-gradient__fallback"></div>
  </div>
</template>

<style scoped>
.liquid-gradient {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}
.liquid-gradient__fallback {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #00001a, #2962ff 55%, #40bcff);
}
</style>
