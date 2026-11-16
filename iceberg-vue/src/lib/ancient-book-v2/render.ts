import type { PlacedCell, JudouConfig, MarginalChar } from './types'

/**
 * 古籍 v2 · 渲染派生函数
 *
 * 句读（圈点）只有一个开关：显示 = 朱笔圈 / 点，
 * 不显示 = 白文。位置与大小是稿本固定写法，不进设置。
 */

/** 单元格 grid 定位/尺寸样式 */
export function cellStyle(c: PlacedCell): string {
  if (c.cm) {
    // 夹注：半格宽、半行高。**整块居中在列内**（列宽 = 字格 + 列间距），
    // 否则列间距一加宽，夹注就贴到列右缘、与正文错位。
    // 右列（subCol=1）在中心右侧 cw/4，左列（subCol=2）在中心左侧 cw/4。
    let s = `grid-area:${c.rw + 1} / ${c.cl + 1};`
    // 夹注里的西文要占 span 个半行槽（engine 按半行量过），格子必须跟着长高，
    // 否则一行英文会溢出到下一行的小字上（「夹注有英文就乱」的根因）。
    const h = c.isEng && c.span > 1 ? `calc(var(--rh) * 0.5 * ${c.span})` : 'calc(var(--rh) * 0.5)'
    s += `width:calc(var(--cw) * 0.5);height:${h};`
    s += 'justify-self:center;align-self:start;'
    const dx = c.subCol === 2 ? 'calc(var(--cw) * -0.25)' : 'calc(var(--cw) * 0.25)'
    const dy = c.subRow === 1 ? 'calc(var(--rh) * 0.5)' : '0px'
    s += `transform:translate(${dx}, ${dy});`
    return s
  }
  let s = `grid-column:${c.cl + 1};grid-row:${c.rw + 1}`
  // 每条声明都必须带分号收尾：少了分号会和下一条粘成一个非法声明，
  // 浏览器会**整条丢掉**（表现为「跨行英文没有占位、被自动摆放」）。
  if (c.span > 1) s += ` / span ${c.span};`
  // 西文补字距：把「串宽对不齐整行」的零头摊进字距（见 layout.ts 的 ENG_MAX_TRACK）
  if (c.els) s += `letter-spacing:${c.els}px;`
  return s
}

/** 单元格 class */
export function cellClass(c: PlacedCell): string {
  const cls = ['c']
  if (c.cm) {
    cls.push('cm')
    if (c.isEng) cls.push('eng')
    return cls.join(' ')
  }
  if (c.isEng) cls.push('eng')
  if (c.hw) {
    cls.push('hw', 'clk')
    if (c.hp) cls.push('hp')
  }
  if (c.vr) cls.push('vl')
  if (c.bk) cls.push('bl')
  return cls.join(' ')
}

/** 句读标记类型：'stop' 句 / 'pause' 读 / null 无 */
export function punctKind(pn: string | undefined, enabled: boolean): 'stop' | 'pause' | null {
  if (!enabled || !pn) return null
  return pn === '。' ? 'stop' : 'pause'
}

/** 圈点的 CSS 定位：字格下缘偏右（两字夹缝），随字号缩放 */
export function judouStyle(cfg: JudouConfig): string {
  const size = `calc(var(--fs) * ${cfg.size})`
  return `width:${size};height:${size};color:${cfg.color};bottom:-10%;right:0%;`
}

/**
 * 眉批小字格 —— **照抄夹注的定位**，只是颜色/底色不同。
 *
 * 夹注：`.c.cm` 是 `cw/2 × rh/2` 的格子，`justify-self: center` 贴住列心，
 * 右列 `+cw/4`、左列 `-cw/4`（`engine.ts` 的 subCol）。眉批的小字用的是**同一套**：
 * 一格 4 小字的位置关系完全一致，所以两者的视觉密度必然对得上。
 * 差别只有一处：眉批的每个字自己占一个格（`r` 递增），而夹注是上下两个小字叠在一格里。
 *
 * `h` 是第几个半列：偶数为右半列（+cw/4）、奇数为左半列（-cw/4）；
 * 每两个半列换到左边一套字格轨道。
 */
export function mbCellStyle(cl: number, ch: MarginalChar): string {
  const dx = ch.h % 2 === 0 ? 'calc(var(--cw) * 0.25)' : 'calc(var(--cw) * -0.25)'
  const col = cl + 1 + Math.floor(ch.h / 2)
  return (
    `grid-column:${col};grid-row:${ch.r + 1};` +
    'width:calc(var(--cw) * 0.5);height:calc(var(--rh) * 0.5);' +
    `justify-self:center;align-self:start;transform:translateX(${dx});`
  )
}

/**
 * 书名页 / 卷首页的标题分段。
 *
 * 只取**本页标题本身**：从 `⚑`/`⚐` 之后开始，到第一个非 hw 单元格、
 * 或页号变化（`\f` 分页后下一页的内容不该混进来）为止。
 */
export function titleParts(cells: PlacedCell[]): string[] {
  const parts: string[] = []
  let cur = ''
  let started = false
  let startPage: number | null = null
  for (const cell of cells) {
    if (cell.c === '⚑' || cell.c === '⚐') {
      started = true
      startPage = cell.pg
      continue
    }
    if (!started) continue
    // 分页符 / 页号变化：标题到此为止
    if (cell.c === '\f' || cell.pb) break
    if (startPage !== null && cell.pg !== startPage) break
    if (cell.nl) { if (cur) { parts.push(cur); cur = '' } continue }
    if (!cell.hw) break
    if (cell.c === '　') { if (cur) { parts.push(cur); cur = '' } }
    else cur += cell.c + (cell.pn ?? '')
  }
  if (cur) parts.push(cur)
  return parts
}

/** 宣纸底可读色：把暗色主题的亮分类色压到墨色区间（保留色相） */
const INK_HUES = [18, 210, 0, 95, 48, 205, 190, 250, 40, 28, 165, 120, 275, 330, 60]

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = Math.floor(h / 60) % 6
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]!
  return `#${rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function inkColor(hex: string, catIndex = 0): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return '#7a6e61'
  const n = parseInt(m[1]!, 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // 无彩度（纯白/纯灰）：按分类索引给稳定淡墨色相
  if (max - min < 12) return hslToHex(INK_HUES[catIndex % INK_HUES.length]!, 0.22, 0.34)
  if (lum > 0.43) {
    const k = 0.4 / lum
    r = Math.round(r * k)
    g = Math.round(g * k)
    b = Math.round(b * k)
    r = Math.round(r * 0.82 + 34 * 0.18)
    g = Math.round(g * 0.82 + 28 * 0.18)
    b = Math.round(b * 0.82 + 24 * 0.18)
  }
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}
