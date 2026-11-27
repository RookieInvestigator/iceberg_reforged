/**
 * guji-vmetric.mjs —— 直排字形落点探针（CDP，headless Chrome）。
 *
 * 为什么单独一个：古籍模式的字在字格里偏上/偏下，取决于浏览器**直排**时用的
 * 竖排度量（vmtx / VORG，没有就按 hhea ascent 合成），跟横排的 canvas
 * measureText 完全是两套。要判断「〇 该下移多少」，只能看真实渲染。
 *
 * 做法：打开 /ancient-book（@font-face 已就位），往页面里注入一张对照表 ——
 * 每款字体一列、同一批字、字号与古籍模式一致，逐格截图量墨迹包围盒，
 * 报「墨迹中心相对字格中心的偏移」。
 *
 * 用法：
 *   node scripts/guji-vmetric.mjs --port 5175
 *   node scripts/guji-vmetric.mjs --port 5175 --chars 〇永書一國中 --fs 21
 *
 * 输出：shots/vmetric.png + shots/vmetric.json（逐格盒），一行 GUJI_VMETRIC JSON。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const CHARS = arg('chars', '〇永書一國中')
const FS = Number(arg('fs', '21'))
const OVR = arg('ovr', '')   // 形如 "HanaMinA:ascent-override=96%"（可逗号分隔多条）
const OUT = resolve(arg('out', 'shots/vmetric.png'))
const WIDTH = 1000
const HEIGHT = 460

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`

// 与 layout.ts 的 FONT_STACKS 一致（含回退链，才能看出回退字落在哪）
const FAMILIES = [
  ['song', "'Noto Serif SC', 'HanaMinA', serif"],
  ['sotyr', "'sotyr', 'Noto Serif SC', 'HanaMinA', serif"],
  ['fangsong', "'Zhuque Fangsong', 'Noto Serif SC', 'HanaMinA', serif"],
  ['kai', "'Huiji Zhengkai', 'Noto Serif SC', 'HanaMinA', serif"],
  ['hana', "'HanaMinA', serif"],
]

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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 4, mobile: false })

  // 打开古籍页：@font-face 与字体文件都在这个 origin 下
  await cdp.send('Page.navigate', { url: BASE })
  await waitFor(async () => {
    try { return await cdp.eval(`document.querySelectorAll('.c').length > 0`) } catch { return false }
  }, 25000)
  await cdp.eval(`document.fonts.ready.then(() => true)`)

  // 注入对照表（覆盖全屏，白底）
  await cdp.eval(`(() => {
    const fams = ${JSON.stringify(FAMILIES)}
    const chars = [...${JSON.stringify(CHARS)}]
    const fs = ${FS}
    const root = document.createElement('div')
    root.id = '__vmetric'
    root.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#fff;color:#000;display:flex;gap:20px;padding:14px;font-size:' + fs + 'px'
    for (const [key, stack] of fams) {
      const col = document.createElement('div')
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center'
      const lbl = document.createElement('div')
      lbl.textContent = key
      lbl.style.cssText = 'font:11px/1.4 monospace;color:#888;margin-bottom:6px'
      col.appendChild(lbl)
      for (const ch of chars) {
        const cell = document.createElement('div')
        cell.className = 'vm-cell'
        cell.dataset.ch = ch
        cell.dataset.fam = key
        cell.style.cssText = 'width:' + fs + 'px;height:' + fs + 'px;display:grid;place-items:center;' +
          'writing-mode:vertical-rl;text-orientation:upright;line-height:1;outline:1px solid #eee'
        const sp = document.createElement('span')
        sp.textContent = ch
        sp.style.fontFamily = stack
        sp.style.fontSize = fs + 'px'
        sp.style.color = '#000'
        cell.appendChild(sp)
        col.appendChild(cell)
      }
      root.appendChild(col)
    }
    document.body.appendChild(root)
    return true
  })()`)
  await sleep(500)

  const rects = await cdp.eval(`(() => {
    return [...document.querySelectorAll('.vm-cell')].map(c => {
      const r = c.getBoundingClientRect()
      return { ch: c.dataset.ch, fam: c.dataset.fam,
               x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
    })
  })()`)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  mkdirSync(resolve(OUT, '..'), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  writeFileSync(OUT.replace(/\.png$/i, '') + '.json', JSON.stringify({ fs: FS, chars: CHARS, cells: rects }, null, 1))

  console.log('GUJI_VMETRIC ' + JSON.stringify({ out: OUT, fs: FS, chars: CHARS, cells: rects.length }))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_VMETRIC_FAIL', e.message); process.exit(1) })
