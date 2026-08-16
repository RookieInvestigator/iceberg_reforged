/**
 * ShaderCanvas —— WebGL2 全屏着色器画布（Mssh meshh 官方 ShaderCanvas 的 Vue/TS 移植）。
 *
 * 官方行为（与 meshh 源码保持一致）：
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
 * - 编译失败抛异常（由组件捕获回退静态渐变），而非静默 console.error
 */

export interface ShaderCanvasOptions {
  /** fragment shader 源码（必须是已注入头部声明的 GLSL ES 3.0） */
  fragmentShader: string
  /** 初始 uniform 值（键为 shader 中的 uniform 名，含 u_ 前缀） */
  uniforms?: Record<string, unknown>
  /** heightmap 纹理（可选，LiquidGradient 不使用） */
  heightmap?: HeightmapOptions
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
  /** 更新 heightmap 纹理 */
  setHeightmap(heightmap: HeightmapOptions | undefined): void
  /** 暂停渲染循环（keep-alive 失活时调用，节省 GPU/CPU） */
  pause(): void
  /** 恢复渲染循环 */
  resume(): void
  dispose(): void
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

/** setColorArray：u_colors[i] 逐元素上传（vec4，alpha=1）+ 设置 u_colors_length。
 *  颜色在 CPU 端转 linear（gamma 2.2），shader 中无需每像素重复 pow。 */
function setColorArray(gl: WebGL2RenderingContext, program: WebGLProgram, values: string[]) {
  const colors = values.slice(0, 8)
  gl.uniform1i(gl.getUniformLocation(program, 'u_colors_length'), colors.length)
  colors.forEach((color, index) => {
    const [sr, sg, sb] = hexToRgb(color)
    const r = Math.pow(sr, 2.2)
    const g = Math.pow(sg, 2.2)
    const b = Math.pow(sb, 2.2)
    gl.uniform4f(gl.getUniformLocation(program, `u_colors[${index}]`), r, g, b, 1)
  })
}

/** 官方 updateHeightmapTexture：在离屏 canvas 上绘制 diamond 或文字遮罩，上传为纹理 */
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

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%;'
  container.appendChild(canvas)

  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, premultipliedAlpha: false })
  if (!gl) {
    canvas.remove()
    throw new Error('WebGL2 not supported')
  }

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

  // ── 用户 uniform：location 惰性缓存，每帧全量上传 ──
  const locations = new Map<string, WebGLUniformLocation | null>()
  const getLocation = (name: string) => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
    return locations.get(name)
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
    gl.uniform1i(gl.getUniformLocation(program, 'u_image_heightmap'), 0)
  }

  // ── 值容器：用户 uniform + 内置变量 ──
  const values: Record<string, unknown> = { ...uniforms }
  let uniformsDirty = true
  let sizeDirty = true
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const resize = () => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio))
    const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      sizeDirty = true
    }
    // 尺寸未变化时跳过 viewport/uniform 上传，减少每帧 CPU 开销
    if (sizeDirty) {
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolution, width, height)
      gl.uniform1f(pixelRatioLocation, pixelRatio)
      sizeDirty = false
    }
  }
  resize()

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  // ── 渲染循环（官方：每帧 resize + 全量上传 uniforms + 绘制） ──
  let frame = 0
  let disposed = false
  let paused = false
  const start = performance.now()

  const render = (now: number) => {
    if (disposed || paused) return
    resize()
    gl.useProgram(program)
    gl.uniform1f(time, reducedMotion ? 0 : (now - start) / 1000)

    // heightmap 变化时重绘纹理（官方 key 对比逻辑）
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

    // 静态 uniform 只在首次或 setUniforms 后上传，避免每帧全量上传
    if (uniformsDirty) {
      for (const [name, value] of Object.entries(values)) {
        // 官方：colors 数组走 setColorArray（含 u_colors_length）
        if (name === 'u_colors' && Array.isArray(value)) {
          setColorArray(gl, program, value as string[])
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
          // 兜底：vec2/3/4 数字数组（官方仅 colors 数组走特殊分支，这里按长度上传）
          if (value.length >= 4) gl.uniform4f(location, value[0], value[1], value[2], value[3])
          else if (value.length === 3) gl.uniform3f(location, value[0], value[1], value[2])
          else if (value.length === 2) gl.uniform2f(location, value[0], value[1])
        }
      }
      uniformsDirty = false
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6)
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)

  // ── 上下文丢失：停止循环，让浏览器尝试恢复（不自动重建） ──
  const onContextLost = (e: Event) => {
    e.preventDefault()
    disposed = true
    cancelAnimationFrame(frame)
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  return {
    canvas,
    setUniforms(partial) {
      Object.assign(values, partial)
      uniformsDirty = true
    },
    setHeightmap(heightmap) {
      heightmapRef = heightmap
    },
    pause() {
      if (paused || disposed) return
      paused = true
      cancelAnimationFrame(frame)
    },
    resume() {
      if (!paused || disposed) return
      paused = false
      frame = requestAnimationFrame(render)
    },
    dispose() {
      if (disposed) return
      disposed = true
      paused = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buffer)
      if (heightmapTexture) gl.deleteTexture(heightmapTexture)
      gl.deleteProgram(program)
      canvas.remove()
    },
  }
}
