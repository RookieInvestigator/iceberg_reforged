/**
 * guji-shot.mjs —— 古籍模式截图探针（CDP，headless Chrome）。
 *
 * 用途：改字体/版式后，肉眼确认「同一列的字是否对齐」「界行是否与字格重合」。
 * 纯 CDP，不依赖 playwright 包（本机只有 playwright 下载的 chromium 二进制）。
 *
 * 用法：
 *   node scripts/guji-shot.mjs                       # 默认截 /ancient-book
 *   node scripts/guji-shot.mjs --page 3              # 翻到第 3 展再截
 *   node scripts/guji-shot.mjs --font sotyr           # 切字体（song/hei/kai/fangsong/sotyr）
 *   node scripts/guji-shot.mjs --out shots/guji.png
 *   node scripts/guji-shot.mjs --port 5175           # 指向已运行的 vite dev
 *   node scripts/guji-shot.mjs --find 〇             # 自动翻到含该字的展（最多 60 展）
 *
 * 前置：vite dev 已运行（默认 5175，可用 --port 改）。
 * 输出：PNG 文件 + 一行 GUJI_SHOT {...} JSON（含版面变量与字体加载状态）。
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createServer } from 'node:http'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const PAGE = Number(arg('page', '0'))
const FONT = arg('font', '')
const FIND = arg('find', '')
const OUT = resolve(arg('out', 'shots/guji.png'))
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', '900'))

const CHROME =
  process.env.CHROME_PATH ||
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe`

// vite dev 只监听 IPv6 回环（::1），用 127.0.0.1 会连不上 —— 必须写 [::1]。
const BASE = `http://[::1]:${PORT}/iceberg_reforged/ancient-book`

/** 极简 CDP 客户端 */
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result)
      } else if (msg.method) {
        this.events.push(msg)
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
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }
}

async function waitFor(fn, timeoutMs = 15000, stepMs = 200) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 1. 起 chrome（远程调试端口随机）
  const dbgPort = 9300 + Math.floor(Math.random() * 500)
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${dbgPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${WIDTH},${HEIGHT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const cleanup = () => {
    try { chrome.kill() } catch {}
  }
  process.on('exit', cleanup)

  // 2. 等 CDP 端口就绪，取**页面** target 的 ws（浏览器级 ws 不支持 Page.*）
  let wsUrl = null
  const ok = await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${dbgPort}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl
        return true
      }
      return false
    } catch {
      return false
    }
  }, 20000)
  if (!ok) throw new Error('chrome CDP 未就绪')

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const cdp = new CDP(ws)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  })

  // 3. 打开古籍页
  await cdp.send('Page.navigate', { url: BASE })
  await waitFor(async () => {
    try {
      return await cdp.eval(`!!document.querySelector('.wr') && document.querySelectorAll('.c').length > 0`)
    } catch {
      return false
    }
  }, 25000)

  // 4. 等字体全部加载（否则截图里是回退字体，看不出对齐问题）
  await cdp.eval(`document.fonts.ready.then(() => true)`)
  await sleep(600)

  // 5. 切字体 / 翻页
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
      try {
        return await cdp.eval(`document.querySelectorAll('.c').length > 0`)
      } catch {
        return false
      }
    }, 25000)
    await cdp.eval(`document.fonts.ready.then(() => true)`)
    await sleep(600)
  }

  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => x.getAttribute('aria-label') && x.getAttribute('aria-label').includes('下'))
      if (b) b.click()
      return true
    })()`)
    await sleep(450)
  }

  // 5b. --find：自动翻到含该字的展（最多 60 展），省得手数页码
  let foundAt = -1
  let findRect = null
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
      await sleep(450)
    }
    // 找到字的元素盒（截图裁切用；CSS 像素，deviceScaleFactor=2 时乘 2 得像素）
    findRect = await cdp.eval(`(() => {
      const s = [...document.querySelectorAll('.c span')].find(x => x.textContent.includes(${JSON.stringify(FIND)}))
      if (!s) return null
      const r = s.getBoundingClientRect()
      const c = s.closest('.c').getBoundingClientRect()
      return { span: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
               cell: { x: +c.x.toFixed(1), y: +c.y.toFixed(1), w: +c.width.toFixed(1), h: +c.height.toFixed(1) } }
    })()`)
  }

  // 6. 量版面：字格与界行是否重合、字体是否真的生效
  const metrics = await cdp.eval(`(() => {
    const wr = document.querySelector('.wr')
    if (!wr) return { error: 'no .wr', url: location.href, bodyLen: document.body.innerHTML.length, title: document.title }
    const cs = getComputedStyle(wr)
    const cells = [...document.querySelectorAll('.c')].slice(0, 40)
    const rules = [...document.querySelectorAll('.rc')].slice(0, 6)
    const cellRects = cells.map(c => { const r = c.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } })
    const ruleRects = rules.map(c => { const r = c.getBoundingClientRect(); return { x: +r.x.toFixed(1), w: +r.width.toFixed(1) } })
    // 同一列内相邻字的 y 间距（判断是否等距）
    const byCol = {}
    for (const c of cells) {
      const r = c.getBoundingClientRect()
      const key = Math.round(r.x)
      ;(byCol[key] ||= []).push(+r.y.toFixed(1))
    }
    const colGaps = Object.entries(byCol).map(([x, ys]) => {
      ys.sort((a, b) => a - b)
      const gaps = []
      for (let i = 1; i < ys.length; i++) gaps.push(+(ys[i] - ys[i-1]).toFixed(1))
      return { x: +x, gaps: [...new Set(gaps)] }
    })
    // 全量字格（截图后逐格量墨迹用）：t = 字，x/y/w/h = 字格盒
    const allCells = [...document.querySelectorAll('.c')].map(c => {
      const r = c.getBoundingClientRect()
      return { t: c.querySelector('span')?.textContent || '', x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
    })
    return {
      fontStack: cs.getPropertyValue('--font-stack').trim(),
      fs: cs.getPropertyValue('--fs').trim(),
      cw: cs.getPropertyValue('--cw').trim(),
      rh: cs.getPropertyValue('--rh').trim(),
      colW: cs.getPropertyValue('--col-w').trim(),
      colGap: cs.getPropertyValue('--col-gap').trim(),
      cols: cs.getPropertyValue('--cols').trim(),
      rows: cs.getPropertyValue('--rows').trim(),
      cellCount: document.querySelectorAll('.c').length,
      ruleCount: document.querySelectorAll('.rc').length,
      cellRects: cellRects.slice(0, 8),
      ruleRects,
      colGaps,
      allCells,
      fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family),
    }
  })()`)

  // 7. 截图
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))

  // 8. 旁挂 JSON：字格盒 + 版面变量，供 guji-ink.py 逐格量墨迹
  const meta = { ...metrics, out: OUT, page: PAGE, font: FONT || '(prefs)', find: FIND || undefined, foundAt: FIND ? foundAt : undefined, findRect: findRect || undefined }
  writeFileSync(OUT.replace(/\.png$/i, '') + '.json', JSON.stringify(meta, null, 1))

  console.log('GUJI_SHOT ' + JSON.stringify({ out: OUT, page: PAGE, font: FONT || '(prefs)', find: FIND || undefined, foundAt: FIND ? foundAt : undefined, findRect: findRect || undefined, ...metrics }))

  ws.close()
  cleanup()
}

main().catch((e) => {
  console.error('GUJI_SHOT_FAIL', e.message)
  process.exit(1)
})
