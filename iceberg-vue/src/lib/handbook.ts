import {
  hrefKind,
  normalizeDesc,
  safeHref,
  segmentDesc,
  splitParagraphs,
  stripMdEm,
  toPlainText,
} from './richText'

// 术语表单一事实源（HandbookView 与 V2 徽章共用）：tab 定义、深链构造、md 解析。
// 富文本原语（行内标记 / 引用块 / 换行规整）统一在 lib/richText.ts，这里只做手册专属的
// 文件结构解析（## 节 → ### 条目）并向后兼容地转出共用原语。
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

export { hrefKind, normalizeDesc, segmentDesc, splitParagraphs, stripMdEm, toPlainText }
export type { DescSeg, HrefKind, RichBlock } from './richText'
/** 旧名保留：手册侧曾把链接白名单叫 safeHandbookHref（词条正文也走同一套）。 */
export const safeHandbookHref = safeHref

/** 解析 handbook.md：二级标题 →（三级标题 → 描述）。释义首行若为 `> ` 开头，视为短版摘要行：
 * 从 desc 剥离（术语表不显示），由 getShortMap 另行提取（徽章 hover 优先显示短版）。 */
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
      const desc = normalizeDesc(end === -1 ? rest : rest.slice(0, end))
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
