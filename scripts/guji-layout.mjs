/**
 * guji-layout.mjs —— 打印字格与界行轨道的真实几何关系。
 *
 * 只回答一个问题：每个字格是不是落在自己那条网格轨道的正中间。
 * 会把「轨道 x / 宽」「字格 x / 宽」「界行 x / 宽」和几个关键计算样式一起打出来。
 *
 * 用法：node scripts/guji-layout.mjs --port 5175 --font sotyr --page 1
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const FONT = arg('font', 'sotyr')
const PAGE = Number(arg('page', '1'))
const WIDTH = 1440
const HEIGHT = 900

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
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

  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
      if (b) b.click(); return true
    })()`)
    await sleep(420)
  }

  const out = await cdp.eval(`(() => {
    const gd = document.querySelector('.gd')
    const cs = getComputedStyle(gd)
    const cw = parseFloat(cs.getPropertyValue('--cw'))
    const colW = parseFloat(cs.getPropertyValue('--col-w'))
    const colGap = parseFloat(cs.getPropertyValue('--col-gap'))
    const gdRect = gd.getBoundingClientRect()
    // 网格轨道：getComputedStyle(gd).gridTemplateColumns 会给出实际像素
    const tracks = cs.gridTemplateColumns.split(' ').map(Number)
    const cells = [...document.querySelectorAll('.c')].slice(0, 5).map(c => {
      const r = c.getBoundingClientRect()
      const s = getComputedStyle(c)
      const sp = c.querySelector('span')
      const sr = sp.getBoundingClientRect()
      return {
        ch: sp.textContent,
        x: +r.x.toFixed(2), w: +r.width.toFixed(2),
        spanX: +sr.x.toFixed(2), spanW: +sr.width.toFixed(2),
        justifySelf: s.justifySelf, boxSizing: s.boxSizing, padding: s.padding,
        writingMode: s.writingMode, align: s.alignItems, justify: s.justifyContent,
        spanFont: getComputedStyle(sp).fontFamily,
        spanTransform: getComputedStyle(sp).transform,
      }
    })
    const rules = [...document.querySelectorAll('.rc')].slice(0, 4).map(c => {
      const r = c.getBoundingClientRect()
      return { x: +r.x.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
    })
    return {
      gd: { x: +gdRect.x.toFixed(2), w: +gdRect.width.toFixed(2) },
      cw, colW, colGap, trackCount: tracks.length,
      trackFirst: tracks.slice(0, 4), trackLast: tracks.slice(-2),
      trackSum: +tracks.reduce((a, b) => a + b, 0).toFixed(2),
      gdJustify: cs.justifyContent, gdDirection: cs.direction, gdAlign: cs.alignContent,
      cells, rules,
    }
  })()`)

  console.log('GUJI_LAYOUT ' + JSON.stringify(out, null, 1))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_LAYOUT_FAIL', e.message); process.exit(1) })
