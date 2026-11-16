/**
 * guji-pic.mjs —— 最小可用的整页截图（CDP，带硬超时）。
 *
 * 为什么另起一个：`guji-shot.mjs` 会等 `document.fonts.ready` 的 Promise 与
 * 2× 缩放的全页截图，在本机对 2MB 级 woff2 偶发卡到十几分钟。
 * 这里只做三件事：打开页 → 选字体（可覆写任意排版偏好）→ 截图，每步都有超时。
 *
 * 用法：node scripts/guji-pic.mjs --port 5175 --font sotyr --page 1 --out shots/x.png
 *       --prefs '{"rulesFull":true,"fontScale":1.6}'   覆写排版偏好（实验用）
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const PORT = Number(arg('port', '5175'))
const FONT = arg('font', 'sotyr')
const PAGE = Number(arg('page', '1'))
const PREFS = arg('prefs', '')
const CLICK = arg('click', '')
const OUT = resolve(arg('out', 'shots/pic.png'))
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', '900'))

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`
const BASE = `http://[::1]:${PORT}/iceberg_reforged/ancient-book`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function withTimeout(p, ms, what) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))])
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id)
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return withTimeout(new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })) }), 60000, method)
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result.value
  }
}

async function main() {
  const dbg = 9800 + Math.floor(Math.random() * 400)
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dbg}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' })
  const cleanup = () => { try { chrome.kill() } catch {} }
  process.on('exit', cleanup)

  let wsUrl = null
  for (let i = 0; i < 100 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
    } catch {}
    if (!wsUrl) await sleep(200)
  }
  if (!wsUrl) throw new Error('chrome CDP 未就绪')

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const cdp = new CDP(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: Number(arg('dpr','1')), mobile: false })

  await cdp.send('Page.navigate', { url: BASE })
  for (let i = 0; i < 120; i++) {
    if (await cdp.eval(`document.querySelectorAll('.c').length > 0`).catch(() => false)) break
    await sleep(250)
  }

  await cdp.eval(`(() => {
    const raw = localStorage.getItem('iceberg:ancient-book:prefs')
    const p = raw ? JSON.parse(raw) : {}
    p.font = ${JSON.stringify(FONT)}
    Object.assign(p, ${JSON.stringify(PREFS)} ? JSON.parse(${JSON.stringify(PREFS)}) : {})
    localStorage.setItem('iceberg:ancient-book:prefs', JSON.stringify(p))
    return true
  })()`)
  await cdp.send('Page.reload')
  for (let i = 0; i < 160; i++) {
    if (await cdp.eval(`document.querySelectorAll('.c').length > 0`).catch(() => false)) break
    await sleep(250)
  }
  // 轮询字体状态，不用 fonts.ready 的 Promise
  for (let i = 0; i < 120; i++) {
    if (await cdp.eval(`document.fonts.status === 'loaded'`).catch(() => false)) break
    await sleep(250)
  }
  await sleep(500)

  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
      if (b) b.click(); return true
    })()`)
    await sleep(400)
  }
  await sleep(300)

  if (CLICK) {
    await cdp.eval(`(() => { const el = document.querySelector(${JSON.stringify(CLICK)}); if (el) el.click(); return !!el })()`)
    await sleep(600)
  }

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('GUJI_PIC ' + JSON.stringify({ out: OUT, font: FONT, page: PAGE }))
  ws.close(); cleanup()
}

main().catch((e) => { console.error('GUJI_PIC_FAIL', e.message); process.exit(1) })
