/**
 * 链接副表（appendix/references.csv）的语义层。
 *
 * 一张表同时表达三件事：
 *   · `role=ref`（缺省）—— 附加参考链接
 *   · `role=main`      —— **覆盖词条主链接**（改 URL）
 *   · `label` 非空     —— **覆盖显示名**（主链接与参考链接都适用；留空则按域名自动判，见 lib/sourceLabel.ts）
 * 主数据来自上游 API、本地改不了 —— 换地址 / 改站名 / 补参考都只靠副表完成。
 *
 * 列：`source_id,label,url[,role]`。role 缺省为 ref（无该列时行为不变）。
 */
import type { ReferenceLink } from '../injectionKeys'

export type LinkRole = 'main' | 'ref'

/** 带角色的链接行（ReferenceLink 的扩展；role 缺省视作 ref） */
export interface LinkRow extends ReferenceLink {
  role?: LinkRole
}

export const roleOf = (row: LinkRow): LinkRole => (row.role === 'main' ? 'main' : 'ref')

export interface PickedLinks {
  /** 主链接（副表有 role=main 则覆盖）；label 为空串表示「按域名自动判」 */
  main: { url: string; label: string } | null
  /** 附加参考链接（不含 role=main 的行） */
  refs: LinkRow[]
}

/**
 * 从「词条主链接 + 副表行」挑出主链接与参考链接。
 * 主链接优先级：副表 role=main 的 URL > 主数据 item.link；显示名：副表 label > 自动识别。
 */
export function pickLinks(itemLink: string | undefined, rows: LinkRow[] | undefined): PickedLinks {
  const list = rows || []
  const mainRow = list.find((r) => roleOf(r) === 'main' && (r.url || '').trim())
  const refs = list.filter((r) => roleOf(r) !== 'main')
  const url = ((mainRow?.url || '').trim() || (itemLink || '').trim())
  return {
    main: url ? { url, label: (mainRow?.label || '').trim() } : null,
    refs,
  }
}
