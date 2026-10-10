/**
 * 社区订正（overrides.csv）的**渲染层叠加**。
 *
 * 支持字段（与 scripts/apply_feedback.py 的 SUPPORTED、lib/iceberg/appendix.ts 的
 * OVERRIDE_FIELDS 同口径）：**title / desc / tags**。
 *
 * ⚠️ 分类不在这里：`category` 归 categories.csv 一家管，见 lib/iceberg/extraCategories.ts。
 * 保留字段一律不生效，由 appendix.ts 记入 violations 并在此上报（不静默）。
 *
 * ⚠️ tags 必须**连带重算派生字段**，否则会出现「筛选按旧标签、墙显示旧 emoji」这类半生效状态：
 *   tags → emojis = tags.map(nameToEmoji) —— emojis 才是词条墙/ScatterField/导出渲染的字段，
 *   也是 useFilterPipeline 做标签筛选的依据（都在 lib/data.ts 的 normalizeData 里算）。
 *
 * 同键多行（CSV 历史遗留）取**最后一条**：apply_feedback.py 按 (item_id, field) upsert，
 * 正常只有一行；last-wins 与「新采纳覆盖旧值」的约定一致。
 */
import { normalizeTags } from '../tags'
import type { IcebergItem } from '../data'
import type { OverrideRecord } from './appendix'
import { ownerOfField, tableFile } from './appendix'

/** 叠加生效的字段（其余字段只报告不落值） */
export const APPLIED_FIELDS = ['title', 'desc', 'tags'] as const

/** 重算派生字段所需的映射（来自 IcebergData，调用方传入） */
export interface OverrideContext {
  /** tag 名 → emoji（normalizeData 的同一映射，用于重算 item.emojis） */
  nameToEmoji?: Record<string, string>
}

export interface OverrideApplyStat {
  title: number
  desc: number
  tags: number
  /** 遇到但不支持的字段（去重，供调用方 console.warn / 上报） */
  skipped: string[]
  /** 越界写进通用表的保留字段（去重，附它该去的表）：category / link / related */
  violations: string[]
}

/**
 * 就地叠加：把 overridesMap 里的采纳值写回词条对象（含派生字段重算）。
 * 就地（而非返回新数组）是刻意的 —— 调用方在词条对象被浅拷贝进墙 / descMap 之前调用一次，
 * 后续所有消费方（词条墙、详情、descMap、hero 标题、筛选管线、导出）自动拿到订正后的值。
 */
export function applyOverrides(
  items: IcebergItem[],
  overridesMap: Map<string, OverrideRecord[]>,
  ctx: OverrideContext = {},
): OverrideApplyStat {
  const stat: OverrideApplyStat = { title: 0, desc: 0, tags: 0, skipped: [], violations: [] }
  if (!overridesMap.size) return stat
  const skipped = new Set<string>()
  const violations = new Set<string>()

  for (const item of items) {
    const records = overridesMap.get(item.id)
    if (!records?.length) continue
    for (const rec of records) {
      const field = (rec.field || '').trim()
      const value = rec.value ?? ''
      const owner = ownerOfField(field)
      if (owner) {
        // 保留字段：分类 / 链接 / 关联各有专表，写这里不生效 —— 明确报出来，别静默
        violations.add(`overrides.csv:${field}（应写 ${tableFile(owner)}）`)
        continue
      }
      if (field === 'title') {
        if (value) { item.title = value; stat.title++ }
      } else if (field === 'desc') {
        if (value) { item.desc = value; stat.desc++ }
      } else if (field === 'tags') {
        const list = normalizeTags(value)
        if (!list.length) continue
        item.tags = list
        // emojis 是墙/筛选/导出的真实消费字段，必须与 tags 同步重算
        item.emojis = list.map((n) => ctx.nameToEmoji?.[n] || n)
        stat.tags++
      } else if (field) {
        skipped.add(field)
      }
    }
  }

  stat.skipped = [...skipped]
  stat.violations = [...violations]
  return stat
}
