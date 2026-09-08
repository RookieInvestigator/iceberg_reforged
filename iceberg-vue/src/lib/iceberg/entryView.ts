// 词条视图载荷唯一产地（审计 A2）：「打开词条」意图收敛为 openEntry + resolvePresenter，
// 消灭 4 份 payload 字面量与 color/categoryColor 字段名不一致（统一 categoryColor）。
// depth 预留给 A3 探索轨迹（当前调用方一律传 0）。
export interface EntryLink {
  label: string
  url: string
}

export interface EntryRelated {
  id: string
  title: string
}

export interface EntryView {
  id: string
  title: string
  tier?: string
  desc: string
  category: string
  categoryColor: string
  tags?: string[]
  link?: string
  references?: EntryLink[]
  related?: EntryRelated[]
  recommended?: EntryRelated[]
  prevId?: string
  nextId?: string
  /** A3 探索轨迹深度（缺省 0；v1 兼容接口无此字段） */
  depth?: number
}

interface EntryRaw {
  id: string
  title: string
  tier?: string
  desc?: string
  category: string
  categoryColor: string
  tags?: string[]
  link?: string
  references?: EntryLink[]
}

export function toEntryView(
  raw: EntryRaw,
  parts: {
    related?: EntryRelated[]
    recommended?: EntryRelated[]
    prevId?: string | null
    nextId?: string | null
    depth?: number
  } = {},
): EntryView {
  return {
    id: raw.id,
    title: raw.title,
    tier: raw.tier,
    desc: raw.desc || '',
    category: raw.category,
    categoryColor: raw.categoryColor,
    tags: raw.tags || [],
    link: raw.link,
    references: raw.references,
    related: parts.related || [],
    recommended: parts.recommended || [],
    prevId: parts.prevId || undefined,
    nextId: parts.nextId || undefined,
    depth: parts.depth || 0,
  }
}

/** 视口断点只出现一次（原散落 5 处，此处 1 处；useTooltip 内 2 处属 v1 共享文件不动） */
export const MOBILE_BP = 1024

export type Presenter = 'modal' | 'sheet' | 'link'

/**
 * 呈现策略：纯函数，可单测。
 * tooltip 模式无链接时返回 'link'（调用方无链接则 no-op），与原 onClick 语义一致。
 */
export function resolvePresenter(ctx: { viewport: number; detailMode: string }): Presenter {
  if (ctx.viewport < MOBILE_BP) return 'sheet'
  if (ctx.detailMode === 'modal') return 'modal'
  return 'link'
}
