/**
 * guji-mb.mjs —— 检查眉批（天头批注）的落位。
 *
 * 打印：本展有几条眉批、各自贴在哪一列、盒子的真实矩形，以及同列首字格的矩形，
 * 用来确认「眉批中线是否对准列中线」「有没有被天头裁掉」「是不是两列小字」。
 *
 * 用法：node scripts/guji-mb.mjs --port 5175 --font song --page 3
 */

import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const PORT = Number(arg('port', '5175'))
const FONT = arg('font', 'song')
const PAGE = Number(arg('page', '0'))
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeoutMs = 25000, stepMs = 200) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true
    await sleep(stepMs)
  }
  return false
}

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
  })

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
    })
  }

  for (let i = 0; i < PAGE; i++) {
    await cdp.eval(`(() => {
      const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
      if (b) b.click(); return true
    })()`)
    await sleep(450)
  }
  await sleep(400)

  const page = Number(arg('page', '0'))
  const scanTo = Number(arg('scan', '0'))
  if (scanTo > page) {
    const rows = []
    for (let i = page; i <= scanTo; i++) {
      if (i > page) {
        await cdp.eval(`(() => {
          const b = [...document.querySelectorAll('.nv-lnk')].find(x => (x.getAttribute('aria-label')||'').includes('下'))
          if (b) b.click(); return true
        })()`)
        await sleep(450)
      }
      rows.push(await cdp.eval(`(() => {
        const eng = [...document.querySelectorAll('.c.eng')]
        return {
          page: ${i},
          mb: document.querySelectorAll('.mb').length,
          mbTexts: [...document.querySelectorAll('.mb')].map((el) => [...el.querySelectorAll('.mb-grp')].map((g) => g.textContent).join('/')),
          eng: eng.length,
          engSample: eng.slice(0, 3).map((c) => {
            const s = c.querySelector('.eng-span')
            const r = s.getBoundingClientRect()
            return {
              t: s.textContent, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
              fs: getComputedStyle(s).fontSize, track: getComputedStyle(c).letterSpacing,
              style: c.getAttribute('style'),
            }
          }),
          engWide: eng.map((c) => {
            const s = c.querySelector('.eng-span')
            const st = getComputedStyle(c)
            return {
              t: s.textContent,
              cm: c.classList.contains('cm'),
              row: st.gridRow,
              track: st.letterSpacing,
              attr: (c.getAttribute('style') || '').includes('letter-spacing'),
            }
          }).filter((x) => x.row.includes('span')),
        }
      })()`))
    }
    console.log('GUJI_MB_SCAN ' + JSON.stringify(rows, null, 1))
    ws.close()
    cleanup()
    return
  }

  const out = await cdp.eval(`(() => {
    const mb = [...document.querySelectorAll('.mb')]
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }
    const items = mb.map((el) => {
      const grps = [...el.querySelectorAll('.mb-grp')]
      return {
        right: getComputedStyle(el).right,
        text: grps.map((g) => g.textContent).join(' / '),
        font: getComputedStyle(el).fontSize,
        track: getComputedStyle(el).letterSpacing,
        lineH: getComputedStyle(el).lineHeight,
        rect: rect(el),
      }
    })
    // 同一页里各页首字格的位置，用来核对眉批是否对齐列心
    const pages = [...document.querySelectorAll('.pg')].map((pg) => {
      const gd = pg.querySelector('.gd')
      const pbr = pg.querySelector('.pbr')
      const topCells = [...pg.querySelectorAll('.c')].filter(c => {
        const st = getComputedStyle(c)
        return st.gridRow === '1' || st.gridRowStart === '1'
      }).map(c => ({ ch: c.textContent.trim().slice(0, 1), rect: rect(c) }))
      return {
        gd: rect(gd),
        sn: (() => {
          const sn = pg.querySelector('.sn')
          if (!sn) return null
          const fish = [...sn.querySelectorAll('.sn-fish')].map((f) => ({
            cls: f.className.baseVal || f.getAttribute('class'),
            rect: rect(f),
            vb: f.getAttribute('viewBox'),
            // path 的实际包围盒（用户坐标系），用来判断图形有没有铺满 viewBox 宽度
            bbox: (() => { const p = f.querySelector('path'); if (!p) return null; const b = p.getBBox(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1) } })(),
          }))
          return {
            rect: rect(sn),
            kou: [...sn.querySelectorAll('.sn-kou')].map(rect),
            neck: [...sn.querySelectorAll('.sn-neck')].map((n) => ({ ...rect(n), h: getComputedStyle(n).height })),
            fish,
          }
        })(),
        pbr: pbr ? { rect: rect(pbr), n: pbr.querySelectorAll('.rc').length, first: [...pbr.querySelectorAll('.rc')].slice(0, 3).map(rect) } : null,
        title: (() => {
          const t = pg.querySelector('.b-title')
          if (!t) return null
          const ts = getComputedStyle(t)
          const box = t.parentElement
          // 逐字量真实的步进（直排里字距会叠加在字的行进上，肉眼估容易错）
          const node = t.firstChild
          const chars = []
          if (node && node.nodeType === 3) {
            let acc = 0
            for (const ch of node.textContent) {
              const r = document.createRange()
              r.setStart(node, acc); r.setEnd(node, acc + ch.length)
              const b = r.getBoundingClientRect()
              chars.push({ ch, y: +b.y.toFixed(1), h: +b.height.toFixed(1) })
              acc += ch.length
            }
          }
          return {
            rect: rect(t), box: rect(box),
            fs: ts.fontSize, track: ts.letterSpacing, maxH: ts.maxHeight, maxW: ts.maxWidth,
            cols: t.getClientRects().length,
            text: t.textContent,
            chars,
          }
        })(),
        topCells,
        mbCount: pg.querySelectorAll('.mb').length,
      }
    })
    // 逐字量行距：眉批与夹注必须是同一个字距步进（rh/2）
    const charSteps = (el) => {
      const out = []
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 1) { walk(child); continue }
          if (child.nodeType !== 3) continue
          let acc = 0
          for (const ch of child.textContent) {
            const r = document.createRange()
            r.setStart(child, acc); r.setEnd(child, acc + ch.length)
            const b = r.getBoundingClientRect()
            out.push({ ch, y: +b.y.toFixed(1) })
            acc += ch.length
          }
        }
      }
      walk(el)
      return out
    }
    const cmEl = document.querySelector('.c.cm')
    const mbEl = document.querySelector('.mb-grp')
    return {
      mbCount: mb.length,
      items,
      // 版心是 .bx-in 的兄弟节点（不属于 .pg）
      sn: (() => {
        const sn = document.querySelector('.sn')
        if (!sn) return null
        const fish = [...sn.querySelectorAll('.sn-fish')].map((f) => ({
          cls: f.getAttribute('class'),
          rect: rect(f),
          vb: f.getAttribute('viewBox'),
          bbox: (() => { const p = f.querySelector('path'); if (!p) return null; const b = p.getBBox(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1) } })(),
        }))
        return {
          rect: rect(sn),
          kou: [...sn.querySelectorAll('.sn-kou')].map(rect),
          neck: [...sn.querySelectorAll('.sn-neck')].map((n) => ({ ...rect(n), h: getComputedStyle(n).height })),
          fish,
        }
      })(),
      cmSteps: cmEl ? charSteps(cmEl).slice(0, 4) : null,
      cmFont: cmEl ? getComputedStyle(cmEl).fontSize : null,
      mbSteps: mbEl ? charSteps(mbEl).slice(0, 4) : null,
      mbFont: mbEl ? getComputedStyle(mbEl).fontSize : null,
      pages,
    }
  })()`)

  console.log('GUJI_MB ' + JSON.stringify(out, null, 1))
  ws.close()
  cleanup()
}

main().catch((e) => { console.error('GUJI_MB_FAIL', e.message); process.exit(1) })
