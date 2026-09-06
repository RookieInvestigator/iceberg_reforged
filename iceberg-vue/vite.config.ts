import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'
import { vitePrerenderPlugin } from 'vite-prerender-plugin'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const MAX_APPENDIX_BODY = 2 * 1024 * 1024 // JSON body 大小限制：2MB

/** first-screen-preload 的注入幂等标记：已注入的入口 HTML 相对路径（closeBundle 每次构建会触发多次） */
const preloadInjected = new Set<string>()

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    compression(),
    {
      // perf：路由 chunk 与其静态依赖不在各入口 HTML 的自动预载序列中，
      // 构建后按入口解析静态依赖图注入 <link rel="modulepreload">，消除首屏串行瀑布
      // （index → 路由 chunk → 依赖链）。此前只处理根 index.html，其余预渲染入口
      // （/home /handbook /features /on-this-day）仍有瀑布，现按入口逐一处理。
      name: 'first-screen-preload',
      // 仅构建期生效：vitest 会加载 vite.config 并触发 closeBundle（实测 npm test 改写 dist），
      // apply + VITEST 双保险，保证测试命令对产物目录零副作用
      apply: 'build',
      closeBundle() {
        if (process.env.VITEST) return
        try {
          const dist = path.resolve(__dirname, 'dist')
          const assetsDir = path.join(dist, 'assets')
          if (!fs.existsSync(assetsDir)) return
          const base = process.env.CF_PAGES_BRANCH ? '/' : '/iceberg_reforged/'

          // 入口 HTML → 该路由首屏 chunk 前缀（与 prerender 的路由一一对应；
          // /ancient-book 与 /3d 同样在列：前者自带古籍样式 chunk，后者 three.js 最重，
          // 缺了它们首屏瀑布优化会被 sitemap 承诺落空）
          const ENTRIES: Array<[html: string, chunkPrefix: string]> = [
            ['index.html', 'IndexView-'],
            ['home/index.html', 'HomeView-'],
            ['handbook/index.html', 'HandbookView-'],
            ['features/index.html', 'FeaturesView-'],
            ['on-this-day/index.html', 'OnThisDayView-'],
            ['ancient-book/index.html', 'AncientBookView-'],
            ['3d/index.html', 'Iceberg3DView-'],
          ]
          // /features/:slug 详情页目录（slug 名不固定，按目录扫描）
          const featuresDir = path.join(dist, 'features')
          if (fs.existsSync(featuresDir)) {
            for (const d of fs.readdirSync(featuresDir, { withFileTypes: true })) {
              if (d.isDirectory()) ENTRIES.push([`features/${d.name}/index.html`, 'FeatureDetailView-'])
            }
          }

          const findAsset = (prefix: string, ext: string) =>
            fs.readdirSync(assetsDir).find(f => f.startsWith(prefix) && f.endsWith(ext))
          const depRe = new RegExp('from"[.]/([^"]+[.]js)"', 'g')
          const collectDeps = (root: string) => {
            const seen = new Set<string>()
            const walk = (name: string) => {
              if (seen.has(name)) return
              seen.add(name)
              let code = ''
              try { code = fs.readFileSync(path.join(assetsDir, name), 'utf-8') } catch { return }
              for (const m of code.matchAll(depRe)) walk(m[1])
            }
            walk(root)
            return seen
          }

          for (const [relHtml, prefix] of ENTRIES) {
            const htmlPath = path.join(dist, relHtml)
            if (!fs.existsSync(htmlPath)) continue
            if (preloadInjected.has(relHtml)) continue // 幂等：closeBundle 每次构建会触发多次
            const viewChunk = findAsset(prefix, '.js')
            if (!viewChunk) continue

            const seen = collectDeps(viewChunk)
            const tags = [...seen]
              .filter(n => !n.startsWith('vue-') && !n.startsWith('index-')) // vue 已有 Vite 自动预载
              .map(n => '<link rel="modulepreload" crossorigin href="' + base + 'assets/' + n + '">')
              .join('\n    ')
            const cssFile = findAsset(prefix, '.css')
            const cssTag = cssFile
              ? '\n    <link rel="preload" as="style" crossorigin href="' + base + 'assets/' + cssFile + '">'
              : ''
            if (!tags && !cssTag) { preloadInjected.add(relHtml); continue }

            const html = fs.readFileSync(htmlPath, 'utf-8')
            // 二次保险：内容里已有首个标签则视为已注入，不再重复写入
            const firstTag = `<link rel="modulepreload" crossorigin href="${base}assets/${[...seen][0]}">`
            if (html.includes(firstTag)) { preloadInjected.add(relHtml); continue }
            fs.writeFileSync(htmlPath, html.replace('<script type="module"', tags + cssTag + '\n    <script type="module"'))
            preloadInjected.add(relHtml)
          }
        } catch (e) {
          console.warn('[first-screen-preload] skipped:', e)
        }
      },
    },
    {
      name: 'spa-fallback',
      apply: 'build',
      closeBundle() {
        if (process.env.VITEST) return
        const dist = path.resolve(__dirname, 'dist')
        const fallback = path.join(dist, '404.html')
        // public/404.html 由 Vite 自动复制到 dist/404.html；已存在则视为自定义 404，不覆盖
        if (!fs.existsSync(fallback)) {
          fs.copyFileSync(path.join(dist, 'index.html'), fallback)
        }
      },
    },
    {
      // 为 sitemap.xml 注入 <lastmod>。
      // 为什么不在 public/sitemap.xml 里手写日期：静态 lastmod 会立刻过期，反而误导
      // 搜索引擎。所有预渲染页共用 index.html 模板，每次构建全部页面内容都会变，
      // 所以 lastmod = 构建日期 对全部 URL 都是准确的。
      // 策略：public/sitemap.xml 继续手工维护（loc / changefreq / priority）；
      // 本插件在 public 拷贝完成后覆盖 dist 版本，只补 lastmod。
      // 失败时 dist 里仍留有 Vite 复制的静态副本，不会丢 sitemap。
      name: 'sitemap-lastmod',
      apply: 'build',
      closeBundle() {
        if (process.env.VITEST) return
        try {
          const dist = path.resolve(__dirname, 'dist')
          const src = path.resolve(__dirname, 'public/sitemap.xml')
          if (!fs.existsSync(src)) return
          const today = new Date().toISOString().slice(0, 10)
          const xml = fs
            .readFileSync(src, 'utf-8')
            .replace(/\s*<lastmod>[^<]*<\/lastmod>/g, '')
            .replace(/(<loc>[^<]*<\/loc>)/g, `$1\n    <lastmod>${today}</lastmod>`)
          fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml)
          console.log(`[sitemap-lastmod] 已注入 lastmod=${today}`)
        } catch (e) {
          console.warn('[sitemap-lastmod] skipped:', e)
        }
      },
    },
    {
      // 主从镜像 SEO 策略（2026-09-05 拍板）：
      // 主站 = Cloudflare Pages（iceberg-reforged.pages.dev），镜像 = GitHub Pages。
      // 主站：index,follow + google-site-verification（让 Search Console 验证通过）。
      // 镜像：noindex,follow，无验证码 —— canonical 已指向主站，noindex 做双保险。
      // dev 模式：不注入任何标签，保持干净。
      // 同时在 closeBundle 时覆盖镜像的 robots.txt（不声明 Sitemap）并删除镜像的 sitemap.xml。
      name: 'seo-master-mirror',
      apply: 'build',
      transformIndexHtml(html) {
        if (process.env.VITEST) return html
        const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER
        if (isDev) return html
        const isMaster = !!process.env.CF_PAGES_BRANCH
        const VERIFICATION_CODE = 'vh0DrM7cFOmicWG2VcUwv1vxGhH_pzuq7OxUW3hF584'
        const tags = isMaster
          ? `  <meta name="robots" content="index, follow" />\n  <meta name="google-site-verification" content="${VERIFICATION_CODE}" />\n`
          : `  <meta name="robots" content="noindex, follow" />\n`
        return html.replace('</head>', `${tags}</head>`)
      },
      closeBundle() {
        if (process.env.VITEST) return
        const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER
        if (isDev) return
        const isMaster = !!process.env.CF_PAGES_BRANCH
        if (isMaster) {
          console.log('[seo-master-mirror] 主站模式（Cloudflare）：index,follow + 验证码')
          return
        }
        // 镜像模式（GitHub Pages）：覆盖 robots.txt，不声明 Sitemap（省爬取预算）。
        // 不用 Disallow: / —— 需要爬虫能抓到页面才能读到 canonical（指向主站）和 noindex。
        try {
          const dist = path.resolve(__dirname, 'dist')
          const robotsPath = path.join(dist, 'robots.txt')
          const sitemapPath = path.join(dist, 'sitemap.xml')
          if (fs.existsSync(robotsPath)) {
            fs.writeFileSync(robotsPath, 'User-agent: *\nAllow: /\n\n# 镜像站（主站：iceberg-reforged.pages.dev）\n# 不声明 Sitemap：镜像不需要被独立索引\n')
            console.log('[seo-master-mirror] 镜像模式：robots.txt Allow（无 Sitemap 声明）')
          }
          if (fs.existsSync(sitemapPath)) {
            fs.unlinkSync(sitemapPath)
            console.log('[seo-master-mirror] 镜像模式：已删除 sitemap.xml')
          }
        } catch (e) {
          console.warn('[seo-master-mirror] skipped:', e)
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
    // 路由表与 sitemap.xml 保持一致：/ancient-book 与 /3d 同样预渲染静态壳
    //（3D 为 WebGL 交互页，静态壳仅为可索引的占位说明，客户端接管后才是完整场景）。
    vitePrerenderPlugin({
      renderTarget: '#app',
      prerenderScript: path.resolve(__dirname, 'src/prerender.ts'),
      additionalPrerenderRoutes: ['/home', '/handbook', '/features', '/on-this-day', '/ancient-book', '/3d'],
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
          if (id.includes('/three/examples/jsm/')) return 'three-examples'
          if (id.includes('/three/')) return 'three'
          if (id.includes('vue-router')) return 'vue'
          if (id.includes('/vue/') || id.includes('/@vue/')) return 'vue'
        },
      },
    },
  },
})