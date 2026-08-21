/**
 * tooltip-probe.mjs —— tooltip 实测定位探针（headless Chrome + CDP）。
 * 输出：chip/tooltip 的视口矩形、计算样式、祖先链 transform/will-change/overflow 干扰、
 *       对齐数学（上/下、水平偏差）、可见性。
 * 用法：node scripts/tooltip-probe.mjs [--chip-idx N] [--scroll-tier T]
 */
import { spawn } from 'node:child_process'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT_TARGET = 5173
const CDP_PORT = 9224
const args = process.argv.slice(2)
const chipIdx = Number(args.includes('--chip-idx') ? args[args.indexOf('--chip-idx') + 1] : 3)
const scrollTier = args.includes('--scroll-tier') ? Number(args[args.indexOf('--scroll-tier') + 1]) : 1

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map() }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const c = new Cdp(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && c.pending.has(msg.id)) { const { res, rej } = c.pending.get(msg.id); c.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result) }
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
    if (r.exceptionDetails) return { __evalError: r.exceptionDetails.text }
    return r.result?.value
  }
  close() { try { this.ws.close() } catch {} }
}

async function findTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(200)
  }
  throw new Error('chrome devtools target not found')
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--hide-scrollbars', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
    '--window-size=1440,900', '--user-data-dir=' + process.env.TEMP + `\\dsh-tip-probe-${Date.now()}`,
    'about:blank',
  ], { stdio: 'ignore' })
  process.on('exit', () => { try { chrome.kill() } catch {} })

  const wsUrl = await findTarget()
  const cdp = await Cdp.connect(wsUrl)
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')

  for (const url of [`http://localhost:${PORT_TARGET}/iceberg_reforged/`, `http://localhost:${PORT_TARGET}/`]) {
    await cdp.call('Page.navigate', { url })
    const ok = await (async () => {
      for (let i = 0; i < 100; i++) {
        if (await cdp.evaluate(`document.querySelectorAll('#items-container .iceberg-item').length > 100`)) return true
        await sleep(300)
      }
      return false
    })()
    if (ok) break
  }
  await cdp.evaluate(`localStorage.setItem('iceberg-detail-mode', '"tooltip"'); localStorage.setItem('iceberg-bg-mode', '"black"'); location.reload(); true`)
  await sleep(3500) // 挂载 + 入场 + 缓存
  await cdp.evaluate(`document.fonts.ready.then(() => window.__fontsReady = true); true`)
  await (async () => { for (let i = 0; i < 60; i++) { if (await cdp.evaluate(`window.__fontsReady === true`)) return; await sleep(200) } })()

  // 定位目标 chip：指定层级第 chipIdx 个可见词条，滚动使其进入视口中央
  const chipInfo = await cdp.evaluate(`
    (() => {
      const secs = [...document.querySelectorAll('.iceberg-tier[data-tier]')];
      const sec = secs[${scrollTier - 1}] || secs[0];
      const els = [...sec.querySelectorAll('.iceberg-item')].filter(e => e.getBoundingClientRect().width > 0);
      const el = els[${chipIdx}] || els[0];
      const id = el.dataset.id;
      el.scrollIntoView({ block: 'center' });
      return { id };
    })()`)
  await sleep(1200)
  // content-visibility「真实高度记忆」会使滚动目标在首滚后跳变：二次滚动 + 长等落定
  await cdp.evaluate(`document.querySelector('.iceberg-item[data-id="${chipInfo.id}"]')?.scrollIntoView({ block: 'center' }); true`)
  await sleep(2200) // 完全落定 + 滚动抑制窗口（300ms）结束
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 450 })
  await sleep(120)

  const target = await cdp.evaluate(`
    (() => {
      const el = document.querySelector('.iceberg-item[data-id="${chipInfo.id}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cr = document.getElementById('items-container').getBoundingClientRect();
      return { chip: { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom },
               container: { left: cr.left, top: cr.top, bottom: cr.bottom },
               cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
               tier: el.closest('.iceberg-tier')?.dataset.tier, id: el.dataset.id,
               scrollY: window.scrollY };
    })()`)
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.cx, y: target.cy })
  await sleep(700) // 200ms 延迟 + 淡入完成

  const report = await cdp.evaluate(`
    (() => {
      const chip = document.querySelector('.iceberg-item[data-id="${chipInfo.id}"]');
      const tb = document.querySelector('.tooltip-box');
      if (!chip) return { error: 'chip gone' };
      const cr = chip.getBoundingClientRect();
      const out = { chip: { left: cr.left, top: cr.top, width: cr.width, height: cr.height, bottom: cr.bottom },
                    tooltip: null, ancestors: [], viewport: { w: innerWidth, h: innerHeight } };
      const anc = [];
      let n = chip;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        const t = cs.transform !== 'none' || cs.willChange.includes('transform') || cs.filter !== 'none' || cs.backdropFilter !== 'none';
        const o = cs.overflow !== 'visible' ? cs.overflow : null;
        if (t || o) anc.push({ tag: n.tagName, id: n.id, cls: (n.className || '').toString().slice(0, 60), transform: cs.transform.slice(0, 40), willChange: cs.willChange, overflow: o, position: cs.position });
        n = n.parentElement;
      }
      out.ancestors = anc;
      if (tb) {
        const tr = tb.getBoundingClientRect();
        const cs = getComputedStyle(tb);
        out.tooltip = { left: tr.left, top: tr.top, width: tr.width, height: tr.height, bottom: tr.bottom, right: tr.right,
                        position: cs.position, opacity: cs.opacity, visibility: cs.visibility,
                        inlineLeft: tb.style.left, inlineTop: tb.style.top, inlineRight: tb.style.right, inlineTransform: tb.style.transform,
                        parent: tb.parentElement?.id || tb.parentElement?.tagName,
                        show: tb.classList.contains('show') };
        // 对齐数学（上置）：
        out.geom = {
          aboveGap: tr.bottom - cr.top,
          belowGap: tr.top - cr.bottom,
          hCenterErr: Math.abs((tr.left + tr.width / 2) - (cr.left + cr.width / 2)),
        };
        // 公式回放：用「当前 chip 矩形 + 当前 tooltip 尺寸」重算，看 inline 值是否与之一致
        const M = 8, hh = tb.offsetHeight, ww = tb.offsetWidth;
        const replayY = Math.min(Math.max(cr.top - M - hh, M), Math.max(M, innerHeight - hh - M));
        let rx = cr.left + cr.width / 2 - ww / 2;
        rx = Math.min(Math.max(rx, M), Math.max(M, innerWidth - ww - M));
        out.replay = { y: replayY, x: rx, h: hh, w: ww, yErr: tr.top - replayY, xErr: tr.left - rx };
        out.debug = window.__tipDebug || null;
      } else out.tooltip = 'MISSING';
      return out;
    })()`)

  console.log('TIP_PROBE ' + JSON.stringify(report))
  cdp.close()
  chrome.kill()
}

main().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1) })