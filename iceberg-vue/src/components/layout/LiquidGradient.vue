<script setup lang="ts">
/**
 * LiquidGradient —— 流动液态渐变背景（Mssh meshh 官方组件 Vue 移植）。
 * 填充父容器，纯装饰（aria-hidden）；props 与参考实现一致，默认值为官方 defaultConfig。
 * 引擎为官方 ShaderCanvas 移植（src/lib/shaderCanvas.ts）。
 * WebGL2 不可用时回退为静态渐变。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
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
  },
)

const containerRef = ref<HTMLElement>()
const failed = ref(false)
let engine: ShaderCanvas | null = null

function syncUniforms() {
  engine?.setUniforms(buildUniforms(props))
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  try {
    engine = createShaderCanvas(el, {
      fragmentShader: prepareFragmentShader(fragmentShader, fragmentHeader),
      uniforms: buildUniforms(props),
    })
  } catch {
    failed.value = true
  }
})

// props 是响应式对象 → watch 深层监听，运行时调参实时生效
watch(props, syncUniforms)

onUnmounted(() => {
  engine?.dispose()
  engine = null
})
</script>

<template>
  <div ref="containerRef" class="liquid-gradient" aria-hidden="true">
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
