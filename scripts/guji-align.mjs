/**
 * guji-align.mjs —— 古籍模式「字格对齐」精确测量（CDP，headless Chrome）。
 *
 * 测什么：每个字在字格里的**实际墨迹位置**，用来判断
 *   1. 同一列内相邻字的间距是否严格等于 --rh（行高）
 *   2. 回退字体（花园明朝）的字与主字体的字是否在同一基线上
 *   3. 字在字格内是否水平居中（左右留白是否对称）
 *
 * 做法：对每个 .c 里的 <span> 取 Range.getClientRects()，那是**字形墨迹**的
 * 包围盒（不是元素盒），比 getBoundingClientRect 更能反映真实落点。
 *
 * 用法：
 *   node scripts/guji-align.mjs --port 5175 --page 4 --font sotyr
 *   node scripts/guji-align.mjs --port 5175 --page 4 --font song --chars 〇二九
 *   node scripts/guji-align.mjs --port 5175 --font sotyr --find 〇   # 自动翻到含该字的展
 *
 * 输出：一行 GUJI_ALIGN {...} JSON。
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const PAGE = Number(arg('page', '0'))
const FONT = arg('font', '')
const CHARS = arg('chars', '')
const FIND = arg('find', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', '900'))

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`

// vite dev 只监听 IPv6 回环（::1），用 127.0.0.1 会连不上 —— 必须写 [::1]。
const BASE = `http://[::1]:${PORT}/iceberg_reforged/ancient-book`

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }
}

async function waitFor(fn, timeoutMs = 20000, stepMs = 200) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const dbgPort = 9800 + Math.floor(Math.random() * 400)
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${dbgPort}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
  ], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill() } catch {} }
  process.on('exit', cleanup)

  let wsUrl = null
  const ok = await waitFor(async () => {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; return true }
      return false
    } catch { return false }
  })
  if (!ok) throw new Error('chrome CDP 未就绪')

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false })

  await cdp.send('Page.navigate', { url: BASE })
  await waitFor(async () => {
    try { return await cdp.eval(`document.querySelectorAll('.c').length > 0`) } catch { return false }
  }, 25000)

  if (FONT) {
    await cdp.eval(`(() => {
      const raw = localStorage.getItem('iceberg:ancient-book:prefs')
      const p = raw ? JSON.parse(raw) : {}
      p.font = ${JSON.stringify(FONT)}
      localStorage.setItem('iceberg:ancient-book:prefs', JSON.stringify(p))
      return true
    })()`)
    await cdp.send('Page.reload')
    await waitFor(async () => {
      try { return await cdp.eval(`document.querySelectorAll('.c').length > 0`) } catch { return false }
    }, 25000)
  }
  await cdp.eval(`document.fonts.ready.then(() => true)`)
  await sleep(500)

  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
      if (b) b.click(); return true
    })()`)
    await sleep(420)
  }

  // --find：自动翻到含该字的展（最多 60 展）
  let foundAt = -1
  if (FIND) {
    for (let i = 0; i < 60; i++) {
      const hit = await cdp.eval(`[...document.querySelectorAll('.c span')].some(s => s.textContent.includes(${JSON.stringify(FIND)}))`)
      if (hit) { foundAt = i; break }
      const moved = await cdp.eval(`(() => {
        const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
        if (!b || b.disabled) return false
        b.click(); return true
      })()`)
      if (!moved) break
      await sleep(420)
    }
  }

  const result = await cdp.eval(`(() => {
    const wr = document.querySelector('.wr')
    const cs = getComputedStyle(wr)
    const rh = parseFloat(cs.getPropertyValue('--rh'))
    const cw = parseFloat(cs.getPropertyValue('--cw'))
    const fs = parseFloat(cs.getPropertyValue('--fs'))
    const stack = cs.getPropertyValue('--font-stack').trim()
    const wantChars = ${JSON.stringify(CHARS)}

    // 用 canvas 的 actualBoundingBox 量**真实墨迹**（Range.getClientRects 给的是行盒，
    // 所有字都一样大，量不出偏移 —— 这是上一版探针失效的原因）。
    const cv = document.createElement('canvas')
    cv.width = cv.height = 200
    const ctx = cv.getContext('2d')
    ctx.font = fs + 'px ' + stack
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'

    const inkOf = (ch) => {
      const m = ctx.measureText(ch)
      const l = m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight
      const a = m.actualBoundingBoxAscent, d = m.actualBoundingBoxDescent
      return {
        ch,
        w: +(l + r).toFixed(2),
        h: +(a + d).toFixed(2),
        // 墨迹中心相对「advance 中心 / 基线」的偏移
        cx: +((r - l) / 2).toFixed(2),
        cy: +((a - d) / 2).toFixed(2),
        adv: +m.width.toFixed(2),
      }
    }

    // 采样页面上真实出现的字
    const seen = new Set()
    for (const cell of document.querySelectorAll('.c')) {
      const t = cell.querySelector('span')?.textContent
      if (t && t.length === 1 && t.trim()) seen.add(t)
    }
    const chars = wantChars ? [...wantChars] : [...seen].slice(0, 400)
    const inks = chars.map(inkOf)

    // 按字面高分组：满格字（≥0.6em）才是对齐基准
    const full = inks.filter((i) => i.h >= fs * 0.6)
    const med = (arr) => {
      const s = [...arr].sort((a, b) => a - b)
      return s.length ? s[Math.floor(s.length / 2)] : null
    }

    return {
      fontStack: stack, fs, rh, cw,
      sampled: inks.length,
      fullCount: full.length,
      // 满格字的墨迹中心偏移中位数（正 = 偏右/偏下）
      medianCx: med(full.map((i) => i.cx)),
      medianCy: med(full.map((i) => i.cy)),
      medianH: med(full.map((i) => i.h)),
      // 逐字明细（按字面高排序，最小的在前 —— 〇 这类小字一眼可见）
      byHeight: [...inks].sort((a, b) => a.h - b.h).slice(0, 14),
    }
  })()`)

  console.log('GUJI_ALIGN ' + JSON.stringify(result))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_ALIGN_FAIL', e.message); process.exit(1) })
