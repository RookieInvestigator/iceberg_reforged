import { defineConfig } from 'vitest/config'
import type { HtmlTagDescriptor } from 'vite'
import { spawnSync } from 'node:child_process'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'
import { vitePrerenderPlugin } from 'vite-prerender-plugin'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import siteConfig from './site.config.json'

const MAX_APPENDIX_BODY = 2 * 1024 * 1024 // JSON body 大小限制：2MB

// 权威域名唯一来源（site.config.json）：构建期替换 index.html 与 public 静态文件里的
// `__SITE_ORIGIN__` 占位符。
const SITE_ORIGIN = String(siteConfig.origin).replace(/\/+$/, '')

// Cloudflare Web Analytics 站点 token（CF 控制台 → Web Analytics → 站点 → 「JS 片段」里的 token）
const CF_ANALYTICS_TOKEN = 'ab9b42c938f9456988f0d5bb4a4bd191'

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
      // （index → 路由 chunk → 依赖链）。每个预渲染入口各处理一次。
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
      // SEO：把 `__SITE_ORIGIN__` 替换成 site.config.json 的域名（index.html 与 public 静态文件同源）；
      // robots meta 只在 CF Pages 生产构建注入 index,follow + 验证码，其余构建不注入、也不动 sitemap。
      name: 'seo-site-origin',
      apply: 'build',
      transformIndexHtml(html) {
        const withOrigin = html.replaceAll('__SITE_ORIGIN__', SITE_ORIGIN)
        if (process.env.VITEST) return withOrigin
        const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER
        if (isDev) return withOrigin
        if (!process.env.CF_PAGES_BRANCH) return withOrigin
        const VERIFICATION_CODE = 'vh0DrM7cFOmicWG2VcUwv1vxGhH_pzuq7OxUW3hF584'
        return withOrigin.replace(
          '</head>',
          `  <meta name="robots" content="index, follow" />\n  <meta name="google-site-verification" content="${VERIFICATION_CODE}" />\n</head>`,
        )
      },
      closeBundle() {
        if (process.env.VITEST) return
        const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER
        if (isDev) return
        // public/ 下的 robots.txt 与 sitemap.xml 是静态文件，不经 HTML 变换 —— 在这里把占位符
        // 落到 dist（单一来源的最后一环）。本插件只替换占位符，不改写其它内容。
        try {
          const dist = path.resolve(__dirname, 'dist')
          for (const name of ['robots.txt', 'sitemap.xml']) {
            const p = path.join(dist, name)
            if (!fs.existsSync(p)) continue
            const src = fs.readFileSync(p, 'utf-8')
            if (!src.includes('__SITE_ORIGIN__')) continue
            fs.writeFileSync(p, src.replaceAll('__SITE_ORIGIN__', SITE_ORIGIN))
            console.log(`[seo-site-origin] ${name} 已注入权威域名 ${SITE_ORIGIN}`)
          }
          console.log(
            process.env.CF_PAGES_BRANCH
              ? '[seo-site-origin] 生产构建（Cloudflare）：index,follow + 验证码'
              : '[seo-site-origin] 非生产构建：不注入 robots meta（可正常本地预览）',
          )
        } catch (e) {
          console.warn('[seo-site-origin] skipped:', e)
        }
      },
    },
    {
      // Cloudflare Web Analytics（手工 JS 片段嵌入，token 见上方常量）。
      // 构建期注入而不是写死进 index.html：dev 服务与本地 preview 的 hostname（localhost）
      // 与 CF 侧登记的站点域名不匹配，beacon 上报会被 CORS 拒绝并在控制台报错；
      // 构建期注入让 dev 保持零第三方请求，生产 HTML 即 CF 片段本身（属性值由 JSON 序列化）。
      // 注入方式：走 Vite 的结构化标签 API（injectTo: 'body'），不用 html.replace('</body>', …) ——
      // 后者会被 HTML 注释文本里的同名片段截胡（标签落进注释、beacon 静默不加载），
      // 并连带打乱 first-screen-preload 的 html.replace('<script type="module"', …) 首个匹配位置。
      // CSP 联动（改 token / 换站点 / 卸载片段时三处一并处理）：script-src 需放行
      // https://static.cloudflareinsights.com/beacon.min.js，connect-src 需放行
      // https://cloudflareinsights.com（手工嵌入上报到 cloudflareinsights.com/cdn-cgi/rum）；
      // 两处 CSP（index.html 的 meta 与 public/_headers）由 src/lib/csp.test.ts 守着不许分叉。
      name: 'cf-web-analytics',
      apply: 'build',
      transformIndexHtml(): HtmlTagDescriptor[] {
        return [
          {
            tag: 'script',
            attrs: {
              type: 'module',
              src: 'https://static.cloudflareinsights.com/beacon.min.js',
              'data-cf-beacon': JSON.stringify({ token: CF_ANALYTICS_TOKEN }),
            },
            injectTo: 'body',
          },
        ]
      },
    },
    {
      // 反馈审核工作台的决定落盘（DEV 工具，配合 /feedback-review 页）：
      // data/feedback/decisions.json 存 { 反馈 id: { decision, reason, at } }。
      // 为什么落 data/：该目录整体 gitignore，审核决定属于本地操作痕迹，不入库；
      // 为什么由中间件写而不是浏览器下载：刷新/换浏览器不丢，apply_feedback.py 直接读该文件。
      name: 'feedback-decisions',
      configureServer(server) {
        const file = path.resolve(__dirname, '../data/feedback/decisions.json')
        server.middlewares.use('/__feedback-decisions', (req, res) => {
          const send = (code: number, body: unknown) => {
            res.statusCode = code
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          }
          if (req.method === 'GET') {
            try {
              if (!fs.existsSync(file)) return send(200, { decisions: {} })
              send(200, JSON.parse(fs.readFileSync(file, 'utf-8')))
            } catch (e: any) {
              send(500, { error: e.message })
            }
            return
          }
          if (req.method !== 'POST') return send(405, { error: 'method not allowed' })
          const chunks: Buffer[] = []
          let size = 0
          let tooLarge = false
          req.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > MAX_APPENDIX_BODY) { tooLarge = true; chunks.length = 0; return }
            chunks.push(chunk)
          })
          req.on('end', () => {
            if (tooLarge) return send(413, { error: 'payload too large (max 2MB)' })
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { decisions?: unknown }
              const decisions = body.decisions && typeof body.decisions === 'object' ? body.decisions : {}
              fs.mkdirSync(path.dirname(file), { recursive: true })
              fs.writeFileSync(file, JSON.stringify(decisions, null, 2) + '\n', 'utf-8')
              send(200, { ok: true, count: Object.keys(decisions).length })
            } catch (e: any) {
              send(400, { error: e.message })
            }
          })
        })
      },
    },
    {
      // 反馈审核工作台：一键把「已采纳」写进 appendix 副表（DEV 工具，配合 /feedback-review）。
      // 刻意**不在 Node 里重写一遍落盘规则** —— 直接调用 scripts/apply_feedback.py，
      // 与 CLI / 未来 workflow 共用同一实现（去重、F34 URL 归一、id 孤儿门、.bak 备份、报告都在那里）。
      // 工作台把「它刚审的那批行」原样送来（离线也能用，不必让脚本再拉一次 Supabase）：
      // 落成 data/feedback/rows-<时间戳>.csv 后当作 --csv 输入；data/ 不入库。
      // body: { rows: [...], write?: boolean } —— write 缺省 = dry-run（只回报不落盘）。
      name: 'feedback-apply',
      configureServer(server) {
        const root = path.resolve(__dirname, '..')
        // 是否配置了 service key（决定能否自动回填 Supabase 状态；key 只在 Node 侧读，绝不进浏览器包）
        const hasServiceKey = () => {
          if (process.env.SUPABASE_SERVICE_ROLE_KEY) return true
          try {
            const env = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8')
            return /^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/m.test(env)
          } catch {
            return false
          }
        }
        const cell = (v: unknown) => {
          const s = v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v))
          return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
        }
        server.middlewares.use('/__feedback-apply', (req, res) => {
          // GET = 就绪探测：工作台用它判断中间件是否已加载（vite.config.ts 改动后若重启竞态读到旧内容，
          // 请求会落到 Vite 的 base 中间件返回 404 提示 —— 有这条就能在页面上说清楚「重启 dev server」），
          // 同时回报能否自动回填 Supabase（是否有 service key）。
          if (req.method === 'GET') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              ready: true,
              canBackfill: hasServiceKey(),
              hint: 'POST { rows, write } 落盘；write=false 为预演',
            }))
            return
          }
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          const chunks: Buffer[] = []
          let size = 0
          req.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size <= MAX_APPENDIX_BODY) chunks.push(chunk)
          })
          req.on('end', () => {
            const send = (code: number, body: unknown) => {
              res.statusCode = code
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            }
            if (size > MAX_APPENDIX_BODY) return send(413, { error: 'payload too large (max 2MB)' })
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') as {
                rows?: Array<Record<string, unknown>>
                write?: boolean
              }
              const rows = Array.isArray(body.rows) ? body.rows : []
              if (!rows.length) return send(400, { error: '没有可落盘的行（rows 为空）' })
              const write = body.write === true

              const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
              const fbDir = path.join(root, 'data', 'feedback')
              const outDir = path.join(root, 'outputs')
              fs.mkdirSync(fbDir, { recursive: true })
              fs.mkdirSync(outDir, { recursive: true })

              const cols = ['id', 'item_id', 'changes', 'note', 'user_id', 'status', 'applied', 'created_at']
              const csv = [cols.join(',')]
                .concat(rows.map((r) => cols.map((c) => cell(r[c])).join(',')))
                .join('\n') + '\n'
              const rowsPath = path.join(fbDir, `rows-${stamp}.csv`)
              fs.writeFileSync(rowsPath, csv, 'utf-8')

              const args = [
                path.join(root, 'scripts', 'apply_feedback.py'),
                '--csv', rowsPath,
                '--decisions', path.join(fbDir, 'decisions.json'),
                '--review-md', path.join(outDir, `feedback-apply-${stamp}.md`),
                '--emit-sql', path.join(outDir, `feedback-backfill-${stamp}.sql`),
              ]
              if (write) args.push('--write', '--mark-applied', '--mark-rejected')

              // PYTHONIOENCODING/PYTHONUTF8：Windows 下 Python 写管道默认用 cp936，
              // 不强制 UTF-8 的话 Node 按 UTF-8 解码就把中文报告变成一堆 `����`
              const r = spawnSync('python', args, {
                cwd: root,
                encoding: 'utf-8',
                timeout: 180000,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
              })
              send(200, {
                ok: r.status === 0,
                code: r.status,
                write,
                canBackfill: hasServiceKey(),
                rowsPath,
                reviewMd: path.join(outDir, `feedback-apply-${stamp}.md`),
                backfillSql: write ? path.join(outDir, `feedback-backfill-${stamp}.sql`) : '',
                stdout: (r.stdout || '').slice(-8000),
                stderr: (r.stderr || '').slice(-4000) || (r.error ? String(r.error) : ''),
              })
            } catch (e: any) {
              send(500, { error: e.message })
            }
          })
        })
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
    // /dive 为 DEV 专用实验页（路由在 router/index.ts 的 import.meta.env.DEV 分支内注册），
    // 不列入预渲染，避免生产产物出现只有占位壳的公开 URL。
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