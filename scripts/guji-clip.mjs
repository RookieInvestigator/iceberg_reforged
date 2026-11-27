/**
 * guji-clip.mjs —— 精确裁切截图（CDP，headless Chrome）。
 *
 * 用途：把某个字格放大到能看清笔画，判断「字在格子里偏上/偏下/偏左/偏右」。
 * 比整页截图 + 手工算坐标可靠：直接问 DOM 要盒子，再让 Chrome 按 clip 截。
 *
 * 用法：
 *   node scripts/guji-clip.mjs --port 5175 --font sotyr --find 〇 --zoom 8
 *   node scripts/guji-clip.mjs --port 5175 --font sotyr --find 〇 --pad 1   # 上下各多带一格
 *
 * 输出：shots/clip.png + 一行 GUJI_CLIP JSON（含字格盒与字栈）。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const FONT = arg('font', '')
const FIND = arg('find', '〇')
const PAD = Number(arg('pad', '1'))
const ZOOM = Number(arg('zoom', '8'))
const OUT = resolve(arg('out', 'shots/clip.png'))
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', '900'))

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
  await sleep(400)

  // 翻到含目标字的展
  let foundAt = -1
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
  if (foundAt < 0) throw new Error(`翻不到含「${FIND}」的展`)

  const info = await cdp.eval(`(() => {
    const cell = [...document.querySelectorAll('.c')].find(c => (c.querySelector('span')?.textContent || '') === ${JSON.stringify(FIND)})
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    const cs = getComputedStyle(cell)
    const wr = document.querySelector('.wr')
    const wcs = getComputedStyle(wr)
    return {
      cell: { x: r.x, y: r.y, w: r.width, h: r.height },
      rh: parseFloat(wcs.getPropertyValue('--rh')),
      cw: parseFloat(wcs.getPropertyValue('--cw')),
      fontStack: wcs.getPropertyValue('--font-stack').trim(),
      cellFont: cs.fontFamily,
      spanFont: getComputedStyle(cell.querySelector('span')).fontFamily,
    }
  })()`)
  if (!info) throw new Error('找不到该字的字格')

  const { cell, rh, cw } = info
  const clip = {
    x: cell.x - cw * 0.5,
    y: cell.y - rh * PAD,
    width: cell.w + cw,
    height: cell.h + rh * PAD * 2,
    scale: ZOOM,
  }
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: ZOOM },
  })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))

  console.log('GUJI_CLIP ' + JSON.stringify({ out: OUT, foundAt, clip, ...info }))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_CLIP_FAIL', e.message); process.exit(1) })
