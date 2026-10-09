// 术语表单一事实源（HandbookView 与 V2 徽章共用）：tab 定义 + 深链构造。
// parseSections 从 HandbookView 上移至此（L3）：徽章 hover 预览释义共用同一解析。
export const HANDBOOK_TABS = [
  { key: 'criteria', heading: '划定标准', labelKey: 'handbookTabCriteria' },
  { key: 'concepts', heading: '各类概念', labelKey: 'handbookTabConcepts' },
  { key: 'people', heading: '人物作品', labelKey: 'handbookTabPeople' },
] as const

export type HandbookTab = (typeof HANDBOOK_TABS)[number]['key']

/** 深链唯一构造处：徽章 → 术语表。from 供反向回跳（术语表设筛选后回原路）。 */
export const handbookLink = (tab: HandbookTab, term: string, from?: string) => ({
  path: '/handbook',
  query: { tab, term, ...(from ? { from } : {}) },
})

/** 解析 handbook.md：二级标题 →（三级标题 → 描述）。与原 HandbookView 实现一致，
 * 另加一条：释义首行若为 `> ` 开头，视为短版摘要行——从 desc 剥离（术语表不显示），
 * 由 getShortMap 另行提取（徽章 hover 优先显示短版）。 */
export function parseSections(md: string): Map<string, Record<string, string>> {
  const sections = new Map<string, Record<string, string>>()
  const parts = md.split(/\r?\n## /)
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const entries: Record<string, string> = {}
    // body 首行紧贴 ###（无空行）时首块会粘住标题，先剥掉
    const blocks = body.replace(/^### /, '').split(/\r?\n### /)
    for (const block of blocks) {
      const sn = block.indexOf('\n')
      if (sn === -1) continue
      const name = block.slice(0, sn).trim()
      let rest = block.slice(sn + 1)
      // 短版行剥离（只认紧随标题后的第一行）
      const firstNl = rest.indexOf('\n')
      const firstLine = (firstNl === -1 ? rest : rest.slice(0, firstNl)).trim()
      if (firstLine.startsWith('> ')) {
        rest = firstNl === -1 ? '' : rest.slice(firstNl + 1)
      }
      const end = rest.search(/\n(?:### |## )/)
      const desc = end === -1 ? rest.trim() : rest.slice(0, end).trim()
      if (name && desc) entries[name] = desc
    }
    sections.set(title, entries)
  }
  return sections
}

let criteriaDescCache: Record<string, string> | null = null

/** 「划定标准」节的名 → 释义表（分类 + 标签；徽章 hover 预览用，惰性单例）。 */
export function getCriteriaDescMap(rawMd: string): Record<string, string> {
  if (!criteriaDescCache) {
    const sections = parseSections(rawMd)
    criteriaDescCache = sections.get('划定标准') || {}
  }
  return criteriaDescCache
}

let shortCache: Record<string, string> | null = null

/** 预览用纯文本：去掉 md 强调标记（`==...==` 只留文字；引号是正常字符，保留）。 */
export function stripMdEm(text: string): string {
  return text.replace(/==/g, '')
}

export interface DescSeg { text: string; em: boolean }

/**
 * 术语表描述的分段（`==...==` 显式强调，可嵌套）。
 *
 * ⚠️ **引号/书名号不再自动高亮**（2026-10-09 用户要求）：此前「」『』“”‘’《》也被当作
 * 强调定界符，正文里这类符号太常见 —— 结果是整段被染花，「哪些是真正被强调的」反而没有信号。
 * 现在强调**只认显式的 `==...==`**，引号原样输出（`stripMdEm` 与徽章预览的口径也一致）。
 *
 * 放在 lib 而不是视图里：这段解析有明确行为约定（标记不出现在输出里、嵌套可开可关、
 * 未闭合的 `==` 只是普通文字），值得单测锁住，而视图层在本仓库没有测试。
 */
export function segmentDesc(text: string): DescSeg[] {
  const segs: DescSeg[] = []
  let em = false
  let buf = ''
  const flush = () => {
    if (buf) { segs.push({ text: buf, em }); buf = '' }
  }
  let i = 0
  while (i < text.length) {
    // ==...== 显式强调：标记不进入输出，仅切换高亮状态（可嵌套，未闭合则一路高亮到末尾）
    if (text.slice(i, i + 2) === '==') {
      flush()
      em = !em
      i += 2
      continue
    }
    buf += text[i]
    i++
  }
  flush()
  return segs
}
/**
 * 全节的名 → 短版表（释义首行 `> ` 开头即短版；徽章 hover 优先显示，无则回退全文）。
 * 与 parseSections 同源解析，两表互补（短版行已从 desc 剥离，不会重复出现）。
 */
export function getShortMap(rawMd: string): Record<string, string> {
  if (!shortCache) {
    const out: Record<string, string> = {}
    const parts = rawMd.split(/\r?\n## /)
    for (const part of parts.slice(1)) {
      const blocks = part.slice(part.indexOf('\n') + 1).replace(/^### /, '').split(/\r?\n### /)
      for (const block of blocks) {
        const sn = block.indexOf('\n')
        if (sn === -1) continue
        const name = block.slice(0, sn).trim()
        const rest = block.slice(sn + 1)
        const firstNl = rest.indexOf('\n')
        const firstLine = (firstNl === -1 ? rest : rest.slice(0, firstNl)).trim()
        if (name && firstLine.startsWith('> ')) {
          out[name] = firstLine.slice(2).trim()
        }
      }
    }
    shortCache = out
  }
  return shortCache
}
