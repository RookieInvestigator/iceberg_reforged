/**
 * guji-fontof.mjs —— 问浏览器：某个字在页面上**实际**是用哪款字体渲染的。
 *
 * 用途：判断「〇 到底来自仲春仿宋、思源宋还是花园明朝」。只靠回退链推断会猜错
 * （思源宋也有 〇，栈里排在花园明朝前面），必须问渲染器。
 *
 * 做法：CDP 的 CSS.getPlatformFontsForNode —— 返回该节点实际命中的字体文件
 * 与各自的字形数，是浏览器内部的最终结果，不是推测。
 *
 * 用法：
 *   node scripts/guji-fontof.mjs --port 5175 --font sotyr --find 〇
 *   node scripts/guji-fontof.mjs --port 5175 --font sotyr --find 〇 --also 葉八
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const FONT = arg('font', '')
const FIND = arg('find', '〇')
const ALSO = arg('also', '')
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
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
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
  await sleep(300)
  // DOM.requestNode 要求文档树已加载，否则报 "Could not find node with given id"
  await cdp.send('DOM.getDocument', { depth: -1, pierce: true })

  const targets = [FIND, ...([...ALSO].filter(Boolean))]
  const out = []

  for (const ch of targets) {
    let foundAt = -1
    for (let i = 0; i < 60; i++) {
      const hit = await cdp.eval(`[...document.querySelectorAll('.c span')].some(s => s.textContent.includes(${JSON.stringify(ch)}))`)
      if (hit) { foundAt = i; break }
      const moved = await cdp.eval(`(() => {
        const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
        if (!b || b.disabled) return false
        b.click(); return true
      })()`)
      if (!moved) break
      await sleep(400)
    }
    if (foundAt < 0) { out.push({ ch, error: '展上找不到' }); continue }

    // 该字所在的 span 节点
    const evalu = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const s = [...document.querySelectorAll('.c span')].find(x => x.textContent.includes(${JSON.stringify(ch)}))
        return s || null
      })()`,
    })
    const objId = evalu.result?.objectId
    if (!objId) { out.push({ ch, error: '取不到节点' }); continue }

    const { nodeId } = await cdp.send('DOM.requestNode', { objectId: objId })
    const fonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    out.push({ ch, foundAt, fonts: fonts.fonts })
    await cdp.send('Runtime.releaseObject', { objectId: objId })

    // 回到第 0 展，避免下一次从中间开始
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('上'))
      for (let i = 0; i < 80 && b && !b.disabled; i++) b.click()
      return true
    })()`)
    await sleep(600)
  }

  console.log('GUJI_FONTOF ' + JSON.stringify({ font: FONT || '(prefs)', out }))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_FONTOF_FAIL', e.message); process.exit(1) })
