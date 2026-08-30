/**
 * scroll-probe.mjs —— 滚动性能探针（CDP，headless Chrome）。
 *
 * 测什么：滚动期间的三类「延迟」来源
 *   1. 帧间隔分布（frame pacing）—— 卡不卡看 p95/max，不看平均值
 *   2. scroll 事件 → 下一帧开始 的延迟（scroll→paint 代理指标）
 *   3. 主线程长任务（>50ms）—— 掉帧的真正元凶
 *
 * 用法：
 *   node scripts/scroll-probe.mjs                     # 默认对比三种背景模式
 *   node scripts/scroll-probe.mjs --bg liquid         # 只测液态
 *   node scripts/scroll-probe.mjs --bg liquid,black   # 指定若干模式（逗号分隔）
 *   node scripts/scroll-probe.mjs --steps 40 --delta 160
 *   node scripts/scroll-probe.mjs --no-serve --port 5173   # 指向已运行的 vite dev
 *   node scripts/scroll-probe.mjs --headful                # 有头模式：真实 GPU + vsync 锁定
 *
 * 前置：默认**自带静态服务**（读 iceberg-vue/dist，绑 127.0.0.1:4180），无需另起服务。
 *       之所以不用 `vite preview`：它只监听 IPv6 回环（[::1]），IPv4 客户端连接被拒。
 *       用生产构建更可信——dev 模式有 HMR、未压缩模块与 sourcemap，会扭曲性能数据。
 *
 * ⚠️ 读数注意：headless 走 SwiftShader 软件光栅，WebGL 着色器（液态背景）的绝对值
 *    明显劣于真机 GPU。**请以同环境下的 A/B 对比为准，不要拿绝对值当真机表现。**
 *    `black`（纯黑，无着色器）可作为基线：液态与它的差值 ≈ 着色器在软光栅下的开销。
 *
 * 输出：每个模式一行 SCROLL_PROBE {...} JSON，末尾一行 SCROLL_SUMMARY 对比。
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'iceberg-vue', 'dist')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const args = process.argv.slice(2)
const get = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d)
const BASE_PORT = Number(get('port', 4180))
const SELF_SERVE = !args.includes('--no-serve')
/** 有头模式：走真实 GPU + vsync 锁定（会在桌面弹 Chrome 窗口）。默认 headless 软光栅。 */
const HEADFUL = args.includes('--headful')
/** 生产构建的 base（vite.config.ts：非 CF_PAGES 时为 /iceberg_reforged/） */
const BASE_PATH = '/iceberg_reforged/'
/**
 * 逐轮附加的 URL 查询串，逗号分隔，轮数与 --bg 的轮数一一对应。
 * 用于 LiquidBg 的帧率旋钮（?scrollFps=N / ?idleFps=N / ?hoverFps=N），
 * 一次构建即可对比多档帧率。例：--bg liquid,liquid --qs ",?scrollFps=60"
 */
const QS_LIST = (get('qs', '') || '').split(',').map((s) => s.trim())

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
}

/**
 * 自带静态服务（显式绑 127.0.0.1）。
 * 不用 `vite preview` 的原因：它只监听 IPv6 回环（[::1]），IPv4 客户端连不上，
 * 且要求"先起服务"这一前置步骤。自带服务让探针一条命令即可运行。
 */
function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath.startsWith(BASE_PATH)) urlPath = urlPath.slice(BASE_PATH.length - 1) // 保留前导 /
    let filePath = path.join(DIST, urlPath)
    // 目录 → index.html；无扩展名 → SPA 回退
    if (!path.extname(filePath)) filePath = path.join(DIST, 'index.html')
    if (!filePath.startsWith(DIST)) { res.writeHead(403).end('forbidden'); return }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
      res.end(buf)
    })
  })
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
const CDP_PORT = 9225
const STEPS = Number(get('steps', 40))
const DELTA = Number(get('delta', 160))
const STEP_MS = Number(get('step-ms', 24))
const MODES = (get('bg', 'liquid,black,static') || 'liquid').split(',').map((s) => s.trim()).filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 最小 CDP 客户端（Node 22+ 内置 WebSocket） */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
  }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const c = new Cdp(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej } = c.pending.get(msg.id)
        c.pending.delete(msg.id)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      }
    }
    return c
  }
  call(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { res, rej }))
  }
  async evaluate(expr) {
    const r = await this.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
    return r.result?.value
  }
  close() { try { this.ws.close() } catch {} }
}

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome devtools target not found')
}

/** 页内探针：帧间隔 + scroll→下一帧延迟 + longtask */
const INSTRUMENT = `
window.__scrollProbe = (() => {
  const frames = [], latencies = [], longtasks = [];
  let running = false, last = 0, pendingScrollTs = null, po = null;
  function onScroll() { if (pendingScrollTs === null) pendingScrollTs = performance.now(); }
  function tick(ts) {
    if (!running) return;
    // 帧间隔用 rAF 的 ts（帧开始时刻，衡量 pacing 更准）；
    // 延迟用回调内的 performance.now()——输入事件在「帧开始之后」才派发，
    // 若用 ts 减 scroll 事件时间会得出负值（曾实测 -5.9ms）。
    const now = performance.now();
    if (last) frames.push(ts - last);
    last = ts;
    if (pendingScrollTs !== null) { latencies.push(now - pendingScrollTs); pendingScrollTs = null; }
    requestAnimationFrame(tick);
  }
  return {
    start() {
      frames.length = 0; latencies.length = 0; longtasks.length = 0;
      last = 0; pendingScrollTs = null;
      try {
        po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longtasks.push({ s: e.startTime, d: e.duration }); });
        po.observe({ entryTypes: ['longtask'] });
      } catch (e) { po = null; }
      window.addEventListener('scroll', onScroll, { passive: true });
      running = true;
      requestAnimationFrame(tick);
      return true;
    },
    stop() {
      running = false;
      window.removeEventListener('scroll', onScroll);
      if (po) { try { po.disconnect(); } catch (e) {} }
      return { frames, latencies, longtasks };
    }
  };
})();
true`

function stats(arr) {
  if (!arr.length) return { n: 0 }
  const s = [...arr].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]
  const sum = s.reduce((a, b) => a + b, 0)
  return {
    n: s.length,
    avg: +(sum / s.length).toFixed(2),
    p50: +q(0.5).toFixed(2),
    p95: +q(0.95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
  }
}

async function main() {
  let server = null
  if (SELF_SERVE) {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      throw new Error(`dist 未构建：${DIST}\\index.html 不存在。请先 npm run build，或用 --no-serve 指定已有服务。`)
    }
    server = await startStaticServer(BASE_PORT)
    console.error(`[probe] 静态服务已启动 http://127.0.0.1:${BASE_PORT}${BASE_PATH}（源文件 ${DIST}）`)
  }

  // --headful：起有头 Chrome。headless 走 SwiftShader 软件光栅，WebGL 着色器成本被 CPU 化，
  // 测不出真实 GPU 合成表现；且 headless 无 vsync 锁定（p50 帧间隔 7ms ≈ 142fps），
  // fps 指标失真。有头模式下渲染走真实 GPU、rAF 被显示器刷新率锁定，数据才接近真机。
  // 代价：会在桌面弹出 Chrome 窗口，且受当前前台负载干扰（建议测量时别动鼠标键盘）。
  const chrome = spawn(CHROME, [
    HEADFUL ? '--headful' : '--headless=new',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
    // 环境常设 HTTP_PROXY，Chrome 会把 localhost 也走代理导致页面加载失败
    // （表现为 localStorage SecurityError：实际落在代理错误页上）。本地探针必须绕过。
    '--no-proxy-server', '--proxy-bypass-list=<-loopback>',
    '--window-size=1440,900', '--user-data-dir=' + process.env.TEMP + `\\dsh-scroll-probe-${Date.now()}`,
    'about:blank',
  ], { stdio: 'ignore' })
  process.on('exit', () => { try { chrome.kill() } catch {} })

  const cdp = await Cdp.connect(await findTarget())
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')

  // 先落一次页面，拿到 localStorage 域，再设背景模式
  for (const path of ['/iceberg_reforged/', '/']) {
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${BASE_PORT}${path}` })
    let ok = false
    for (let i = 0; i < 100; i++) {
      if (await cdp.evaluate(`document.querySelectorAll('#items-container .iceberg-item').length > 100`)) { ok = true; break }
      await sleep(300)
    }
    if (ok) break
  }
  await cdp.evaluate(`document.fonts.ready.then(() => (window.__fontsReady = true)); true`)
  for (let i = 0; i < 60; i++) { if (await cdp.evaluate(`window.__fontsReady === true`)) break; await sleep(200) }

  const results = []

  for (let mi = 0; mi < MODES.length; mi++) {
    const mode = MODES[mi]
    const qs = QS_LIST[mi] || ''
    await cdp.evaluate(`localStorage.setItem('iceberg-bg-mode', ${JSON.stringify(JSON.stringify(mode))}); true`)
    await cdp.call('Page.navigate', { url: `http://127.0.0.1:${BASE_PORT}/iceberg_reforged/${qs}` })
    let mounted = false
    for (let i = 0; i < 100; i++) {
      if (await cdp.evaluate(`document.querySelectorAll('#items-container .iceberg-item').length > 100`)) { mounted = true; break }
      await sleep(300)
    }
    if (!mounted) { console.log(`SCROLL_PROBE ${JSON.stringify({ mode, error: 'wall not mounted' })}`); continue }
    const log = (m) => console.error(`[probe] ${mode}${qs || ''} ${m}`)
    log('挂载完成，等待落定')
    await sleep(2500) // 入场动画 + 分片挂载落定

    // 预热：词条墙是分片挂载（wallMount），首次滚到深处会触发剩余层级 flush，
    // 产生与背景无关的百毫秒级长任务。先完整滚一遍并等落定，
    // 第二轮才测稳态滚动，否则测的是"挂载开销"而非"滚动开销"。
    for (let i = 0; i < STEPS; i++) {
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: DELTA })
      await sleep(16)
      if ((i + 1) % 10 === 0) log(`预热 ${i + 1}/${STEPS}`)
    }
    await sleep(1500)
    await cdp.evaluate(`window.scrollTo(0, 0); true`)
    await sleep(1200) // 归零 + content-visibility 重算落定
    log('预热完成，开始测量')

    await cdp.evaluate(INSTRUMENT)
    await cdp.evaluate(`window.__scrollProbe.start(); true`)
    await sleep(200)

    // 用真实 wheel 事件驱动滚动（合成器路径），而非 JS scrollTo
    for (let i = 0; i < STEPS; i++) {
      await cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: DELTA,
      })
      await sleep(STEP_MS)
      if ((i + 1) % 10 === 0) log(`测量 ${i + 1}/${STEPS}`)
    }
    await sleep(400) // 收尾（滚动停止后 200ms 降档窗口）

    const raw = await cdp.evaluate(`window.__scrollProbe.stop()`)
    const scrollY = await cdp.evaluate(`window.scrollY`)
    const fr = stats(raw.frames || [])
    const lt = stats(raw.latencies || [])
    const ltask = raw.longtasks || []

    const report = {
      mode,
      qs: qs || null,
      scrollY,
      // headless 无 vsync 锁定（实测 p50 帧间隔 7ms ≈ 142fps），故 fps 仅作同环境相对参考
      fps: fr.n ? +(1000 / fr.avg).toFixed(1) : 0,
      frameMs: fr,
      // 掉帧：以 16.7ms(60fps) 与 33.4ms(30fps) 为两道线分别计数
      drop60: (raw.frames || []).filter((v) => v > 16.7 * 1.5).length,
      drop30: (raw.frames || []).filter((v) => v > 33.4 * 1.5).length,
      scrollLatencyMs: lt,
      longtask: {
        count: ltask.length,
        totalMs: +ltask.reduce((a, b) => a + b.d, 0).toFixed(1),
        maxMs: +ltask.reduce((a, b) => Math.max(a, b.d), 0).toFixed(1),
      },
    }
    results.push(report)
    console.log('SCROLL_PROBE ' + JSON.stringify(report))
  }

  if (results.length > 1) {
    const base = results.find((r) => r.mode === 'black') || results[0]
    console.log(
      'SCROLL_SUMMARY ' +
        JSON.stringify(
          results.map((r) => ({
            mode: r.mode,
            fps: r.fps,
            p95FrameMs: r.frameMs.p95,
            p95ScrollLatencyMs: r.scrollLatencyMs.p95,
            longtaskTotalMs: r.longtask.totalMs,
            vsBlackFrameP95: +(r.frameMs.p95 - base.frameMs.p95).toFixed(2),
          })),
        ),
    )
  }

  cdp.close()
  chrome.kill()
  if (server) server.close()
  setTimeout(() => process.exit(0), 200)
}

main().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1) })
