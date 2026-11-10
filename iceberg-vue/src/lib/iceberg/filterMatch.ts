import { itemCategories } from './extraCategories'
import type { RenderItem } from '../injectionKeys'

/**
 * 词条是否命中当前筛选 —— **唯一判定源**（过滤管线 F15 的纯函数，随机入口同一口径）。
 *
 * 各维度之间是 AND：搜索词、分类、标签、隐藏分类/标签、特殊档、收藏、最近更新……
 * **任何维度都不许提前 return**：搜索与标签同时生效时必须两者都满足。
 * 历史实现里标签分支直接 `return tagMode === 'AND' ? every : some`，于是标签一开，
 * 搜索整段被跳过 —— 输什么词都只看标签命中（实测：标签「📜」+ 查询「才得以」
 * 会返回全部带该标签的词条）。现在搜索命中集（resultSet）在最后统一判定。
 */

export interface FilterSnapshot {
  /** 特殊档：all / hasLink / hasDesc / isNew / noLinkNoDesc */
  spl: string
  favF: boolean
  /** 收藏 id 集合（已过 F30 旧 id 归一） */
  favSet: Set<string>
  hCats: readonly string[]
  hTags: readonly string[]
  cats: readonly string[]
  tags: readonly string[]
  tagMode: string
  /** 搜索命中集；null = 无搜索 */
  resultSet: Set<string> | null
  /** NEW 时间窗下界（秒级时间戳） */
  newCutoff: number
}

/** 多分类副表（叠加 OR）：隐藏看任一分类，选中看交集 */
export function matchesFilter(item: RenderItem, snap: FilterSnapshot): boolean {
  const { spl, favF, favSet, hCats, hTags, cats, tags, tagMode, resultSet, newCutoff } = snap

  if (spl === 'hasLink') { if (!item.link) return false }
  else if (spl === 'hasDesc') { if (!item.desc) return false }
  else if (spl === 'isNew') { if ((item.modifiedAt || 0) < newCutoff) return false }
  else if (spl === 'noLinkNoDesc') { if (item.link || item.desc) return false }

  if (favF && !favSet.has(item.id)) return false

  const catsOf = itemCategories(item)
  if (hCats.length > 0 && hCats.some((c) => catsOf.includes(c))) return false
  if (hTags.length > 0 && hTags.some((t) => (item.emojis || []).includes(t))) return false
  if (cats.length > 0 && !cats.some((c) => catsOf.includes(c))) return false

  if (tags.length > 0) {
    const hit = tagMode === 'AND'
      ? tags.every((t) => (item.emojis || []).includes(t))
      : tags.some((t) => (item.emojis || []).includes(t))
    if (!hit) return false
  }

  if (resultSet && !resultSet.has(item.id)) return false

  return true
}
