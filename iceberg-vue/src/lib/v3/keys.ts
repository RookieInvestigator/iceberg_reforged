import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { IcebergItem } from '../data'
import type { EntryView } from '../iceberg/entryView'
import type { CategoryRecord, ContributorRecord, ExtraRecord, ReadingRecord } from '../iceberg/appendix'
import type { ReferenceLink } from '../injectionKeys'
import type { TrailNode } from '../iceberg/useTrail'

export interface V3Item extends IcebergItem {
  tier: string
  tierIndex: number
}

export interface V3Dataset {
  tierOrder: string[]
  tiers: Record<string, V3Item[]>
  items: V3Item[]
  byId: Map<string, V3Item>
  categoryColors: Record<string, string>
  tagMap: Record<string, string>
  defaultColor: string
  introText: string
  generatedAt: number
  idAliases: Record<string, string>
  facetCats: Record<string, number>
  facetTags: Record<string, number>
  related: Map<string, string[]>
  references: Map<string, ReferenceLink[]>
  reading: Map<string, ReadingRecord[]>
  contributors: Map<string, ContributorRecord[]>
  extra: Map<string, ExtraRecord[]>
  categoryRecords: Map<string, CategoryRecord[]>
}

export interface V3SearchState {
  hits: Readonly<Ref<string[] | null>>
  resultSet: Readonly<Ref<Set<string> | null>>
  fuzzy: Readonly<Ref<boolean>>
  exactCount: Readonly<Ref<number>>
  hitsQuery: Readonly<Ref<string>>
}

export interface V3FilterResult {
  visible: Set<string> | null
  matched: Set<string> | null
  tierCounts: Map<string, number> | null
  total: number
  visibleOrder: string[]
}

export interface V3SuggestRow {
  id: string
  title: string
  category: string
  snippet: string
}

export interface V3Context {
  dataset: ShallowRef<V3Dataset>
  buildDate: Readonly<Ref<string>>
  filter: Readonly<Ref<V3FilterResult>>
  isFiltered: Readonly<Ref<boolean>>
  search: V3SearchState
  trail: ShallowRef<TrailNode[]>
  activeView: Ref<EntryView | null>
  openEntry: (id: string, opts?: { fromId?: string | null; preferHover?: boolean }) => void
  openEntryDialog: (id: string, fromId?: string | null) => void
  closeEntry: () => void
  pickAndShowRandom: () => void
  jumpTier: (name: string) => void
  toggleFilterPanel: (source?: 'fab' | 'bar') => void
  openSettings: () => void
  openShortcuts: () => void
  openOnThisDay: () => void
  toast: (msg: string) => void
}

/** V3 全局单上下文键：收敛原 V2 散落的多把注入键为统一类型化契约 */
export const V3_CTX_KEY: InjectionKey<V3Context> = Symbol('v3Context')
