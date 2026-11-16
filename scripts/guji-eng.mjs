/**
 * guji-eng.mjs —— 西文格自检：串宽、占几行、落位与补字距。
 *
 * 回答三件事：
 * 1. canvas 量出来的串宽与 CSS 里渲染的实际高度对不对得上；
 * 2. `grid-row` 有没有被浏览器丢掉（丢了就等于没占位，会被 grid 自动摆放，
 *    表现就是「英文前后出现大空位、跟邻列错位」——曾经因为少写一个分号出现过）；
 * 3. 补字距（`letter-spacing`，见 layout.ts 的 ENG_MAX_TRACK）有没有生效。
 *
 * 用法：node scripts/guji-eng.mjs --port 5175 --font song --page 1
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}
const PORT = Number(arg('port', '5175'))
const FONT = arg('font', 'song')
const PAGE = Number(arg('page', '1'))
const WIDTH = 1440
const HEIGHT = 900
const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`
const BASE = `http://[::1]:${PORT}/iceberg_reforged/ancient-book`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve: res, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : res(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, reject) => { this.pending.set(id, { resolve: res, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
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
  for (let i = 0; i < 120 && !wsUrl; i++) {
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
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: BASE })
  for (let i = 0; i < 120; i++) {
    if (await cdp.eval(`document.querySelectorAll('.c').length > 0`).catch(() => false)) break
    await sleep(250)
  }
  await cdp.eval(`(() => {
    const raw = localStorage.getItem('iceberg:ancient-book:prefs')
    const p = raw ? JSON.parse(raw) : {}
    p.font = ${JSON.stringify(FONT)}
    localStorage.setItem('iceberg:ancient-book:prefs', JSON.stringify(p))
    return true
  })()`)
  await cdp.send('Page.reload')
  for (let i = 0; i < 160; i++) {
    if (await cdp.eval(`document.querySelectorAll('.c').length > 0`).catch(() => false)) break
    await sleep(250)
  }
  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
      if (b) b.click(); return true
    })()`)
    await sleep(450)
  }
  await sleep(400)

  const out = await cdp.eval(`(() => {
    const cs = getComputedStyle(document.querySelector('.wr'))
    const rh = parseFloat(cs.getPropertyValue('--rh'))
    const fs = parseFloat(cs.getPropertyValue('--fs'))
    const engScale = cs.getPropertyValue('--eng-scale').trim()
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = (fs * parseFloat(engScale)) + "px 'Times New Roman', Georgia, serif"
    const cells = [...document.querySelectorAll('.c.eng')]
    return {
      rh, fs, engScale,
      measure: ['Akilulf', 'C7H14S', 'UFO', 'Discovery'].map((t) => ({
        t, w: +ctx.measureText(t).width.toFixed(2), span: Math.ceil(ctx.measureText(t).width / rh),
      })),
      cells: cells.map((c) => {
        const s = c.querySelector('.eng-span')
        const r = s.getBoundingClientRect()
        return {
          t: s.textContent,
          cm: c.classList.contains('cm'),
          h: +r.height.toFixed(1),
          rowSpan: c.style.gridRow,
          // grid-row 缺失 = 被浏览器丢了，整格英文没有落位
          lost: !c.style.gridRow && !c.classList.contains('cm'),
          track: c.style.letterSpacing,
        }
      }),
    }
  })()`)
  console.log('GUJI_ENG ' + JSON.stringify(out, null, 1))
  ws.close(); cleanup()
}

main().catch((e) => { console.error('GUJI_ENG_FAIL', e.message); process.exit(1) })
