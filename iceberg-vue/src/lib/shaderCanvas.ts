import { prefersReducedMotion } from './motion'
/**
 * ShaderCanvas —— WebGL2 全屏着色器画布。
 *
 * 引擎行为：
 * - WebGL2 上下文：{ alpha: false, antialias: true, premultipliedAlpha: false }
 * - 全屏三角形（6 顶点两个三角形），fragment shader 为 GLSL ES 3.0
 * - fragment 头部由调用方注入（prepareFragmentShader：version + 三个 precision
 *   + varying in/out + 全量 uniform 声明；其中 `precision highp int;` 保证
 *   PCG hash 的 uvec3 乘法在 fragment 中不溢出）
 * - uniforms 每帧全量上传：colors 数组走 setColorArray（u_colors[i] 逐元素
 *   uniform4f + u_colors_length）、颜色字符串走 hexToRgb（支持 3 位 hex）、
 *   number → uniform1f、boolean → 0/1，location 惰性缓存
 * - 内置 u_time / u_resolution / u_pixelRatio（不经过 uniforms 对象）
 * - heightmap 纹理支持（u_image_heightmap，diamond / 文字遮罩），LiquidGradient 未使用
 * - resize 依赖 canvas.clientWidth（canvas 自身 100% 尺寸，铺满容器）
 *
 * Vue 适配差异：
 * - 引擎创建在任意容器内（canvas display:block + 100%/100%）
 * - setUniforms() 增量合并 uniform 值（组件 watch 调用），渲染循环仍每帧全量上传
 * - 增加 prefers-reduced-motion 冻结 u_time、webglcontextlost 停止循环
 * - [项目扩展] resolutionScale：backing store 降分辨率渲染（CSS 放大，低频渐变视觉无损）
 * - [项目扩展] fps：帧率封顶（rAF 仍在跑但跳帧绘制，u_time 基于真实时间不受影响）
 * - 编译失败抛异常（由组件捕获回退静态渐变），而非静默 console.error
 */

export interface ShaderCanvasOptions {
  /** fragment shader 源码（必须是已注入头部声明的 GLSL ES 3.0） */
  fragmentShader: string
  /** 初始 uniform 值（键为 shader 中的 uniform 名，含 u_ 前缀） */
  uniforms?: Record<string, unknown>
  /** heightmap 纹理（可选，LiquidGradient 不使用） */
  heightmap?: HeightmapOptions
  /**
   * [项目扩展] backing store 分辨率缩放系数，默认 1（全分辨率）。
   * 画布 CSS 尺寸不变、由浏览器放大；对低频有机渐变类 shader，0.5 视觉几乎无损，
   * 片元数量降为 1/4。u_resolution / u_pixelRatio 均按缩放后的实际像素上传。
   */
  resolutionScale?: number
  /**
   * [项目扩展] 帧率封顶（0 = 不限制，默认 0）。慢速流动类动画 30fps 足够，
   * GPU 每秒开销按比例下降；u_time 基于真实时间，封顶不会拖慢动画速度。
   */
  fps?: number
}

export interface HeightmapOptions {
  label?: string
  shape?: 'diamond' | 'text'
  blur?: number
  scale?: number
}

export interface ShaderCanvas {
  canvas: HTMLCanvasElement
  /** 增量更新 uniform 值（下一帧生效） */
  setUniforms(partial: Record<string, unknown>): void
  /** [项目扩展] 动态调整帧率上限（0 = 不限）。滚动自适应：滚动时降帧让 GPU 给合成让路 */
  setFps(fps: number): void
  /** 动态切换冻结（减弱动效：静态只重绘脏帧，不空转 rAF） */
  setFrozen(frozen: boolean): void
  /** 更新高度图配置 */
  setHeightmap(heightmap: HeightmapOptions | undefined): void
  /** 暂停渲染循环（keep-alive 失活时调用，节省 GPU/CPU） */
  pause(): void
  /** 恢复渲染循环 */
  resume(): void
  dispose(): void
}

export function computeBackingSize(
  clientWidth: number,
  clientHeight: number,
  dpr: number,
  resolutionScale: number,
  maxBacking = 1440,
): { width: number; height: number; actualRatio: number } {
  const pixelRatio = Math.min(Math.max(dpr || 1, 1), 2) * Math.max(0.1, Math.min(resolutionScale, 1))
  let width = Math.max(1, Math.floor(clientWidth * pixelRatio))
  let height = Math.max(1, Math.floor(clientHeight * pixelRatio))
  const longest = Math.max(width, height)
  if (longest > maxBacking) {
    const s = maxBacking / longest
    width = Math.max(1, Math.floor(width * s))
    height = Math.max(1, Math.floor(height * s))
  }
  const actualRatio = clientWidth > 0 ? width / clientWidth : 1
  return { width, height, actualRatio }
}

export function uniformValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false
    }
    return true
  }
  return false
}

/** 官方顶点着色器：a_position ∈ [-1,1]，v_uv ∈ [0,1] */
const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

/**
 * 官方 wrapFragment：version + 精度声明 + varying + uniform 声明注入到 fragment 源码前。
 * 注意三个 precision 缺一不可：highp int 保证 uvec3/uint 运算精度，
 * highp usampler2D 为 heightmap 采样器预留。
 */
export function prepareFragmentShader(source: string, header: string): string {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
${header}
${source}`
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'unknown error'
    gl.deleteShader(shader)
    throw new Error(`Shader compile failed: ${log}`)
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'unknown error'
    gl.deleteProgram(program)
    throw new Error(`Program link failed: ${log}`)
  }
  return program
}

/** 官方 hexToRgb：支持 3 位 hex（如 #abc）与 6 位，返回 0-1 分量 */
function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '').trim()
  const hex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6)
  const int = Number.parseInt(hex, 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}

/** updateHeightmapTexture：在离屏 canvas 上绘制 diamond 或文字遮罩，上传为纹理 */
function updateHeightmapTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  options: HeightmapOptions & { width: number; height: number },
) {
  const { label, shape, blur = 0, scale = 1, width, height } = options
  const mask = document.createElement('canvas')
  mask.width = Math.max(1, width)
  mask.height = Math.max(1, height)
  const context = mask.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, mask.width, mask.height)
  context.fillStyle = 'white'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.shadowColor = 'rgba(255,255,255,0.9)'
  context.shadowBlur = Math.max(0, blur)
  if (shape === 'diamond') {
    const size = Math.min(mask.width, mask.height) * 0.72 * scale
    const cx = mask.width / 2
    const cy = mask.height / 2
    const half = size / 2
    context.beginPath()
    context.moveTo(cx, cy - half)
    context.lineTo(cx + half, cy)
    context.lineTo(cx, cy + half)
    context.lineTo(cx - half, cy)
    context.closePath()
    context.fill()
  } else {
    const text = String(label || 'MESHH')
    context.font = `900 ${Math.min(mask.width * 0.24, mask.height * 0.42) * scale}px Arial, Helvetica, sans-serif`
    context.fillText(text, mask.width / 2, mask.height / 2)
  }
  const image = context.getImageData(0, 0, mask.width, mask.height)
  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3]
    image.data[index] = alpha
    image.data[index + 1] = 0
    image.data[index + 2] = alpha
    image.data[index + 3] = alpha
  }
  context.putImageData(image, 0, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask)
}

export function createShaderCanvas(container: HTMLElement, options: ShaderCanvasOptions): ShaderCanvas {
  const { fragmentShader, uniforms = {}, heightmap: initialHeightmap } = options
  const resolutionScale = Math.max(0.1, Math.min(options.resolutionScale ?? 1, 1))
  let minFrameTime = options.fps && options.fps > 0 ? 1000 / options.fps : 0

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%;'
  container.appendChild(canvas)

  // 全屏三角形着色器无深度/模板/抗锯齿需求，指定 low-power 避免独立显卡强制唤醒
  const rawGl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  })
  if (!rawGl) {
    canvas.remove()
    throw new Error('WebGL2 not supported')
  }
  const gl: WebGL2RenderingContext = rawGl

  const program = createProgram(gl, VERTEX_SHADER, fragmentShader)
  if (!program) {
    canvas.remove()
    throw new Error('Program link failed')
  }
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  if (!buffer) {
    canvas.remove()
    throw new Error('Buffer creation failed')
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  // ── 内置 uniform location（u_time / u_resolution / u_pixelRatio 不经过 uniforms 对象） ──
  const resolution = gl.getUniformLocation(program, 'u_resolution')
  const time = gl.getUniformLocation(program, 'u_time')
  const pixelRatioLocation = gl.getUniformLocation(program, 'u_pixelRatio')

  // ── 用户 uniform：location 惰性缓存 ──
  const locations = new Map<string, WebGLUniformLocation | null>()
  const getLocation = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
    return locations.get(name) ?? null
  }

  function setColorArray(values: string[]) {
    const colors = values.slice(0, 8)
    gl.uniform1i(getLocation('u_colors_length'), colors.length)
    for (let index = 0; index < colors.length; index++) {
      const [sr, sg, sb] = hexToRgb(colors[index])
      gl.uniform4f(
        getLocation(`u_colors[${index}]`),
        Math.pow(sr, 2.2),
        Math.pow(sg, 2.2),
        Math.pow(sb, 2.2),
        1,
      )
    }
  }

  // ── heightmap 纹理（官方支持，LiquidGradient 未使用） ──
  const heightmapTexture = gl.createTexture()
  let heightmapKey = ''
  let heightmapRef = initialHeightmap
  if (heightmapTexture) {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, heightmapTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.uniform1i(getLocation('u_image_heightmap'), 0)
  }

  // ── 值容器：仅在变更时标脏上传，避免冗余 CPU/GL 同步 ──
  const values: Record<string, unknown> = { ...uniforms }
  let uniformsDirty = true
  let sizeDirty = true
  let needsStaticDraw = true
  let frozen = prefersReducedMotion()
  let lastClientWidth = canvas.clientWidth
  let lastClientHeight = canvas.clientHeight

  const applyResize = (cw = lastClientWidth, ch = lastClientHeight) => {
    lastClientWidth = cw
    lastClientHeight = ch
    const { width, height, actualRatio } = computeBackingSize(
      cw,
      ch,
      window.devicePixelRatio || 1,
      resolutionScale,
    )
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      sizeDirty = true
    }
    if (sizeDirty) {
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
      gl.uniform1f(pixelRatioLocation, actualRatio)
      sizeDirty = false
      needsStaticDraw = true
    }
  }
  applyResize()

  let frame = 0
  let disposed = false
  let paused = false
  const start = performance.now()
  let lastDraw = -Infinity

  function scheduleIfNeeded() {
    if (disposed || paused || frame) return
    if (!frozen || needsStaticDraw || uniformsDirty || sizeDirty) {
      frame = requestAnimationFrame(render)
    }
  }

  const observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    const cw = entry ? Math.round(entry.contentRect.width) : canvas.clientWidth
    const ch = entry ? Math.round(entry.contentRect.height) : canvas.clientHeight
    applyResize(cw, ch)
    if (frozen) scheduleIfNeeded()
  })
  observer.observe(canvas)

  const render = (now: number) => {
    frame = 0
    if (disposed || paused) return
    if (!frozen && minFrameTime > 0 && now - lastDraw < minFrameTime) {
      frame = requestAnimationFrame(render)
      return
    }
    lastDraw = now
    if (sizeDirty) applyResize()

    gl.useProgram(program)
    gl.uniform1f(time, frozen ? 0 : (now - start) / 1000)

    if (heightmapTexture && heightmapRef) {
      const key = [
        heightmapRef.label ?? '',
        heightmapRef.shape ?? '',
        heightmapRef.blur ?? 0,
        heightmapRef.scale ?? 1,
        canvas.width,
        canvas.height,
      ].join(':')
      if (key !== heightmapKey) {
        updateHeightmapTexture(gl, heightmapTexture, {
          ...heightmapRef,
          width: canvas.width,
          height: canvas.height,
        })
        heightmapKey = key
      }
    }

    if (uniformsDirty) {
      for (const [name, value] of Object.entries(values)) {
        if (name === 'u_colors' && Array.isArray(value)) {
          setColorArray(value as string[])
          continue
        }
        const location = getLocation(name)
        if (!location) continue
        if (name === 'u_colorBack' && typeof value === 'string') {
          const [r, g, b] = hexToRgb(value)
          gl.uniform4f(location, r, g, b, 1)
        } else if (name === 'u_mousePosition') {
          gl.uniform4f(location, 0.5, 0.5, 0, 0)
        } else if (typeof value === 'number') {
          gl.uniform1f(location, value)
        } else if (typeof value === 'boolean') {
          gl.uniform1f(location, value ? 1 : 0)
        } else if (typeof value === 'string') {
          const [r, g, b] = hexToRgb(value)
          gl.uniform3f(location, r, g, b)
        } else if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
          if (value.length >= 4) gl.uniform4f(location, value[0], value[1], value[2], value[3])
          else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2])
          else if (value.length === 2) gl.uniform2f(location, value[0], value[1])
        }
      }
      uniformsDirty = false
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    needsStaticDraw = false
    if (!frozen) frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)

  // ── 页面不可见就停画：标签页切走/最小化时没有像素被看见 ──
  const pauseLoop = () => {
    if (paused || disposed) return
    paused = true
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
  const resumeLoop = () => {
    if (!paused || disposed) return
    paused = false
    lastDraw = -Infinity
    needsStaticDraw = true
    scheduleIfNeeded()
  }
  const onVisibilityChange = () => {
    if (document.hidden) pauseLoop()
    else resumeLoop()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // ── 上下文丢失：停止循环，让浏览器尝试恢复（不自动重建） ──
  const onContextLost = (e: Event) => {
    e.preventDefault()
    disposed = true
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  return {
    canvas,
    setUniforms(partial) {
      let changed = false
      for (const [k, v] of Object.entries(partial)) {
        if (!uniformValuesEqual(values[k], v)) {
          values[k] = v
          changed = true
        }
      }
      if (!changed) return
      uniformsDirty = true
      needsStaticDraw = true
      if (frozen) scheduleIfNeeded()
    },
    setFps(fps) {
      minFrameTime = fps && fps > 0 ? 1000 / fps : 0
    },
    setFrozen(nextFrozen) {
      const f = nextFrozen || prefersReducedMotion()
      if (frozen === f) return
      frozen = f
      needsStaticDraw = true
      scheduleIfNeeded()
    },
    setHeightmap(heightmap) {
      heightmapRef = heightmap
      needsStaticDraw = true
      if (frozen) scheduleIfNeeded()
    },
    pause() { pauseLoop() },
    resume() { resumeLoop() },
    dispose() {
      if (disposed) return
      disposed = true
      paused = true
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buffer)
      if (heightmapTexture) gl.deleteTexture(heightmapTexture)
      gl.deleteProgram(program)
      canvas.remove()
    },
  }
}
