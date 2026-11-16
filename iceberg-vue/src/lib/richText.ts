// 富文本单一事实源：词条正文与手册释义共用同一套行内标记 / 引用块解析。
// 只做「安全子集」，不使用 v-html：所有输出都是 VNode，天然免 XSS。
//
// 支持的语法：
// - `==强调==` / `**加粗**` / `*斜体*`（可嵌套、可开可关；未闭合按普通文字一直到结尾）
// - `[文字](地址)`：http(s) 外链、`/` 站内路径、`#` 锚点；其余协议按普通文字处理
// - 引用块：连续以 `> ` 开头的段落（标准 Markdown 引用），整段渲染为 blockquote
import { isSafeHttpUrl } from './data'

export interface DescSeg {
  text: string
  em: boolean
  italic: boolean
  bold: boolean
  href?: string
}

export type HrefKind = 'external' | 'hash' | 'internal'

/** 引用块行首标记：`>` 后允许零或一个空格 */
const QUOTE_RE = /^\s*>\s?/

/**
 * 链接地址白名单：站内相对路径 / 锚点 / http(s) 才算链接，
 * 其余（javascript:、data: 等）返回 null，调用方按普通文字渲染。
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (!href) return null
  if (href.startsWith('/') || href.startsWith('?') || href.startsWith('#')) return href
  return isSafeHttpUrl(href) ? href : null
}

export function hrefKind(href: string): HrefKind {
  if (href.startsWith('#')) return 'hash'
  if (href.startsWith('/') || href.startsWith('?')) return 'internal'
  return 'external'
}

/**
 * 行内分段：三种显式标记 + 链接，标记本身不进入输出。
 * 先匹配两字符标记再匹配单星号，避免 `**` 被拆成两个 `*`。
 */
export function segmentDesc(text: string): DescSeg[] {
  const segs: DescSeg[] = []
  let em = false
  let italic = false
  let bold = false
  let buf = ''
  const flush = () => {
    if (buf) {
      segs.push({ text: buf, em, italic, bold })
      buf = ''
    }
  }
  let i = 0
  while (i < text.length) {
    // 链接优先：[label](url)；地址不过白名单就按普通文字处理
    if (text[i] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i))
      if (m) {
        const href = safeHref(m[2])
        if (href) {
          flush()
          segs.push({ text: m[1], em, italic, bold, href })
          i += m[0].length
          continue
        }
      }
    }
    const two = text.slice(i, i + 2)
    if (two === '==') { flush(); em = !em; i += 2; continue }
    if (two === '**') { flush(); bold = !bold; i += 2; continue }
    if (text[i] === '*') { flush(); italic = !italic; i += 1; continue }
    buf += text[i]
    i++
  }
  flush()
  return segs
}

/** 纯文本降级：去掉行内标记、链接只留文字（古籍模式、导出、徽章预览用）。 */
export function stripMdEm(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/==/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
}

/**
 * 按 clreq §6.1.2「符号分离禁则」把一段纯文本切成「可断行 / 不可断行」片段。
 * 不可断行组：
 *  - 省略号 `……`、破折号 `——`（或单个 `—`）：占 2em，不得从中间拆到两行；
 *  - 阿拉伯数字及其前后缀单位符号：`% ‰ ℃ ℉ °` 与其前面的数字、
 *    `+ - ±` 与其后面的数字、货币符号与数字之间不得断行（§6.1.2.2）；
 *    数字串本身也作为一体（§6.1.2.2），避免 `1999` 在窄栏里被拆开。
 *
 * 供渲染层把每组包进 `.clreq-nobreak { white-space: nowrap }`。
 * 纯函数、无 DOM 依赖，便于单测；未命中的文本原样返回为普通片段。
 */
export interface NoBreakPart {
  text: string
  /** true = 该片段不得断行 */
  nobreak: boolean
}

const NOBREAK_RE = /(?:…+|——|—|[+±-]?\d+(?:\.\d+)?(?:[%‰℃℉°])?)/g

export function groupUnbreakable(text: string): NoBreakPart[] {
  const parts: NoBreakPart[] = []
  let last = 0
  let m: RegExpExecArray | null
  NOBREAK_RE.lastIndex = 0
  while ((m = NOBREAK_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), nobreak: false })
    parts.push({ text: m[0], nobreak: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), nobreak: false })
  return parts
}

/** 纯文本降级（含引用标记）：连 `> ` 行首标记一起去掉，供无法渲染富文本的场景使用。 */
export function toPlainText(text: string): string {
  return stripMdEm(text)
    .split('\n')
    .map((line) => line.replace(QUOTE_RE, ''))
    .join('\n')
}

/**
 * 按空行切段（段内的单换行是硬换行，不与分段混淆）。
 * 不接受 CRLF 残留：调用方应先 normalizeDesc 或已保证 `\n`。
 */
export function splitParagraphs(desc: string): string[] {
  return desc
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+$/, '').trimStart())
    .filter((p) => p.trim() !== '')
}

export interface RichBlock {
  /** p = 普通段落；quote = 引用块（`> ` 开头） */
  type: 'p' | 'quote'
  text: string
}

/**
 * 段落 → 区块。整段每一非空行都以 `>` 开头才算引用块；
 * 混排（部分引用）按普通段落处理，避免把正文里的 `>` 误当引用。
 */
export function parseRichBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = []
  for (const para of splitParagraphs(text)) {
    const lines = para.split('\n').filter((l) => l.trim() !== '')
    if (lines.length > 0 && lines.every((l) => QUOTE_RE.test(l))) {
      blocks.push({ type: 'quote', text: lines.map((l) => l.replace(QUOTE_RE, '')).join('\n') })
    } else {
      blocks.push({ type: 'p', text: para })
    }
  }
  return blocks
}

// ── 换行规整（作者书写 → 渲染前文本） ──

const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/

/** 行内连接：中文/标点相邻不加空格，拉丁文相邻补一个空格 */
function joinInParagraph(lines: string[]): string {
  let out = ''
  let prevHard = false
  for (const raw of lines) {
    const hard = raw.endsWith('\u0000')
    const text = hard ? raw.slice(0, -1) : raw
    if (!text) { prevHard = hard; continue }
    if (out) {
      if (prevHard) out += '\n'
      else out += CJK_RE.test(out.slice(-1)) || CJK_RE.test(text[0]) ? '' : ' '
    }
    out += text
    prevHard = hard
  }
  return out
}

/**
 * 释义正文的换行规整：
 * - 行尾两个及以上空格或反斜杠 \ = 显式硬换行（Markdown 语义，想断就断）
 * - `> ` 开头的行同样按硬行保留（引用块要按行解析，不能被回流合并）
 * - 空行 = 段落分隔（输出空行，渲染侧按 pre-line 保留）
 * - 其余单个换行 = 软换行，按中英文规则自动回流（中文不加空格，拉丁文补空格）
 */
export function normalizeDesc(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const paragraphs: string[] = []
  let cur: string[] = []
  for (const line of lines) {
    const quoted = QUOTE_RE.test(line)
    const hard = quoted || /(?: {2,}|\\)$/.test(line)
    let text = line.trimEnd()
    if (!quoted) text = text.replace(/ {2,}$/, '').replace(/\\$/, '').trimEnd()
    if (!text.trim()) {
      if (cur.length) { paragraphs.push(joinInParagraph(cur)); cur = [] }
      continue
    }
    cur.push(hard ? `${text}\u0000` : text)
  }
  if (cur.length) paragraphs.push(joinInParagraph(cur))
  return paragraphs.join('\n\n')
}
