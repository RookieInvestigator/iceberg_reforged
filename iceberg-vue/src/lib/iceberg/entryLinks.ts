/**
 * 链接副表（appendix/references.csv）的语义层（2026-10-09 升级）。
 *
 * 升级前：references.csv 只是「附加参考链接」——一个词条的主链接只能来自主数据 item.link，
 * 显示名也只能靠自动识别。
 * 升级后：它是**链接副表**，一张表同时表达三件事：
 *   · `role=ref`（缺省）—— 附加参考链接（旧行为不变）
 *   · `role=main`      —— **覆盖词条主链接**（改 URL）
 *   · `label` 非空     —— **覆盖显示名**（主链接与参考链接都适用；留空则按域名自动判，见 lib/sourceLabel.ts）
 * 于是「主链接换了地址」「来源站名写错了要改」「补一条更权威的参考」都能只靠副表完成，
 * 不必动主数据（主数据来自上游 API，本地改不了 —— 这也是当初做副表的原因）。
 *
 * 列：`source_id,label,url[,role]`。role 列缺省为 ref，旧文件（无该列）行为完全不变。
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
