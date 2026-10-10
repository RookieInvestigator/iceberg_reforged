// 词条视图载荷唯一产地：「打开词条」意图收敛为 openEntry + resolvePresenter，
// 字段名统一用 categoryColor（不要各处自拼 payload 字面量）。
// depth 供探索轨迹使用（当前调用方一律传 0）。
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
  /** 多分类副表挂载（主 + 副）；无则回退 [category]，见 extraCategories.itemCategories */
  categories?: string[]
  tags?: string[]
  link?: string
  references?: EntryLink[]
  related?: EntryRelated[]
  recommended?: EntryRelated[]
  prevId?: string
  nextId?: string
  /** 探索轨迹深度（缺省 0） */
  depth?: number
}

interface EntryRaw {
  id: string
  title: string
  tier?: string
  desc?: string
  category: string
  categoryColor: string
  categories?: string[]
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
    categories: raw.categories,
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

/** 视口断点唯一定义处（useTooltip 内两处属共享文件，未收敛） */
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
