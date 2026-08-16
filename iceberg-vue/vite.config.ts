import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'
import { vitePrerenderPlugin } from 'vite-prerender-plugin'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MAX_APPENDIX_BODY = 2 * 1024 * 1024 // JSON body 大小限制：2MB

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    compression(),
    {
      // perf：首屏关键 chunk（IndexView 路由懒加载 + 其静态依赖）不在 index.html 自动预载序列中，
      // 构建后解析入口静态图注入 <link rel="modulepreload">，消除首屏串行瀑布（index → IndexView → 依赖链）
      name: 'first-screen-preload',
      closeBundle() {
        try {
          const dist = path.resolve(__dirname, 'dist')
          const htmlPath = path.join(dist, 'index.html')
          if (!fs.existsSync(htmlPath)) return
          const assetsDir = path.join(dist, 'assets')
          const entry = fs.readdirSync(assetsDir).find(f => f.startsWith('index-') && f.endsWith('.js'))
          if (!entry) return
          // 首屏路由 chunk：直接按文件名取（免解析入口代码）
          const viewChunk = fs.readdirSync(assetsDir).find(f => f.startsWith('IndexView-') && f.endsWith('.js'))
          const seen = new Set<string>()
          const depRe = new RegExp('from"[.]/([^"]+[.]js)"', 'g')
          const collect = (name: string) => {
            if (seen.has(name)) return
            seen.add(name)
            let code = ''
            try { code = fs.readFileSync(path.join(assetsDir, name), 'utf-8') } catch { return }
            for (const m of code.matchAll(depRe)) collect(m[1])
          }
          if (viewChunk) collect(viewChunk)
          const base = process.env.CF_PAGES_BRANCH ? '/' : '/iceberg_reforged/'
          const tags = [...seen]
            .filter(n => !n.startsWith('vue-') && !n.startsWith('index-')) // vue 已有 Vite 自动预载
            .map(n => '<link rel="modulepreload" crossorigin href="' + base + 'assets/' + n + '">')
            .join('\n    ')
          const cssFile = fs.readdirSync(assetsDir).find(f => f.startsWith('IndexView-') && f.endsWith('.css'))
          const cssTag = cssFile ? '\n    <link rel="preload" as="style" crossorigin href="' + base + 'assets/' + cssFile + '">' : ''
          if (!tags && !cssTag) return
          let html = fs.readFileSync(htmlPath, 'utf-8')
          html = html.replace('<script type="module"', tags + cssTag + '\n    <script type="module"')
          fs.writeFileSync(htmlPath, html)
        } catch (e) {
          console.warn('[first-screen-preload] skipped:', e)
        }
      },
    },
    {
      name: 'spa-fallback',
      closeBundle() {
        const dist = path.resolve(__dirname, 'dist')
        const fallback = path.join(dist, '404.html')
        // public/404.html 由 Vite 自动复制到 dist/404.html；已存在则视为自定义 404，不覆盖
        if (!fs.existsSync(fallback)) {
          fs.copyFileSync(path.join(dist, 'index.html'), fallback)
        }
      },
    },
    {
      name: 'appendix-save',
      configureServer(server) {
        // POST /__appendix-save  →  直接写 src/data/appendix/<file>
        server.middlewares.use('/__appendix-save', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          const chunks: Buffer[] = []
          let size = 0
          let tooLarge = false
          req.on('data', (chunk: Buffer) => {
            if (tooLarge) return
            size += chunk.length
            if (size > MAX_APPENDIX_BODY) {
              // 超过 2MB 限制：丢弃已缓冲内容，等待请求结束统一返回 413
              tooLarge = true
              chunks.length = 0
              return
            }
            chunks.push(chunk)
          })
          req.on('end', async () => {
            if (tooLarge) {
              res.statusCode = 413
              res.end(JSON.stringify({ ok: false, error: 'payload too large (max 2MB)' }))
              return
            }
            try {
              const { file, content } = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { file: string; content: string }
              if (typeof file !== 'string' || typeof content !== 'string') throw new Error('invalid payload')
              // path.basename 防路径穿越
              const filePath = path.resolve(__dirname, 'src/data/appendix', path.basename(file))
              await fsp.writeFile(filePath, content, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e: any) {
              res.statusCode = 400
              res.end(JSON.stringify({ ok: false, error: e.message }))
            }
          })
        })
      },
    },
    // 构建期预渲染：Node 内运行 src/prerender.ts，为每个路由生成静态内容快照写入产物 HTML
    // （解决 SPA 首帧无内容问题，爬虫/无 JS 用户直接可见，Vue 启动后接管）。
    vitePrerenderPlugin({
      renderTarget: '#app',
      prerenderScript: path.resolve(__dirname, 'src/prerender.ts'),
      additionalPrerenderRoutes: ['/home', '/handbook', '/features', '/on-this-day'],
    }),
  ],
  base: process.env.CF_PAGES_BRANCH ? '/' : '/iceberg_reforged/',
  resolve: {
    alias: { '@': '/src' },
  },
  // F08：仅移除 debug 日志与 debugger，保留 console.error/warn 作为生产可观察性出口
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // ⚠️ 注意：项目目录名 iceberg-vue 含 "vue"，不能用裸 includes('vue') 匹配，
          // 必须按路径段（/vue/、/@vue/）判断，否则会把所有 node_modules 模块吸进 vue chunk
          if (!id.includes('node_modules')) return
          if (id.includes('gsap')) return 'gsap'
          if (id.includes('/three/examples/jsm/')) return 'three-examples'
          if (id.includes('/three/')) return 'three'
          if (id.includes('vue-router')) return 'vue'
          if (id.includes('/vue/') || id.includes('/@vue/')) return 'vue'
        },
      },
    },
  },
})