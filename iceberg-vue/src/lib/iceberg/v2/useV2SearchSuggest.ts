import { computed, inject, ref } from 'vue'
import { useStore } from '@nanostores/vue'
import { searchFuzzyMode, searchQuery } from '../../filterStore'
import { DESC_MAP_KEY, RENDER_ITEMS_KEY, type RenderItem } from '../../injectionKeys'
import { normalizeSearchText, searchTerms } from '../searchIndex'
import { searchHits, searchHitsExactCount, searchHitsFuzzy, searchHitsQuery } from '../wallState'

/**
 * 搜索速查下拉（输入框下方的 top 6 + 键盘 ↑↓ 选择 + Enter 直达）。
 *
 * 命中**不自己算**：读 wallState.searchHits —— 也就是词条墙的同一份 Worker 结果。
 * 历史实现在这里又建了一个只索引标题/分类/标签的 Fuse，于是「正文命中的查询」
 * 会出现「下拉说无结果、墙上却筛出几条」的自相矛盾，还要在主线程再建一份索引。
 * 现在一份命中两处消费；正文命中额外给一行摘要，说明为什么它会出现在结果里。
 */
export interface SuggestRow {
  id: string
  title: string
  category: string
  /** 正文命中的摘要（标题命中时为空：标题本身已经说明了命中的原因） */
  snippet: string
}

const SNIPPET_BEFORE = 10
const SNIPPET_AFTER = 16
const SUGGEST_LIMIT = 6

export function useV2SearchSuggest() {
  const query = useStore(searchQuery)
  const fuzzyMode = useStore(searchFuzzyMode)
  const suggestOpen = ref(false)
  const suggestIdx = ref(0)
  const searchInputRef = ref<HTMLInputElement | null>(null)

  const itemsRef = inject(RENDER_ITEMS_KEY, undefined)
  const descMap = inject(DESC_MAP_KEY, new Map<string, string>())
  const itemMap = computed(() => {
    const m = new Map<string, RenderItem>()
    for (const it of itemsRef?.value ?? []) m.set(it.id, it)
    return m
  })

  // 搜索 150ms 防抖
  let debounce = 0
  function onSearchInputEvent(e: Event) {
    const v = (e.target as HTMLInputElement).value
    clearTimeout(debounce)
    debounce = window.setTimeout(() => searchQuery.set(v), 150)
    suggestIdx.value = 0
    if (v.trim()) suggestOpen.value = true
  }
  function onSearchFocus() {
    if (query.value.trim()) suggestOpen.value = true
  }

  /** 正文摘要：取第一个命中的关键词前后一小段；标题已命中就不给摘要 */
  function bodySnippet(item: RenderItem, terms: string[]): string {
    if (terms.every((t) => normalizeSearchText(item.title).includes(t))) return ''
    const desc = descMap.get(item.id) || ''
    if (!desc) return ''
    const lower = desc.toLowerCase()
    const norm = normalizeSearchText(desc)
    for (const term of terms) {
      let at = lower.indexOf(term)
      if (at < 0) at = norm.indexOf(term)
      if (at < 0) continue
      const start = Math.max(0, at - SNIPPET_BEFORE)
      const end = Math.min(desc.length, at + term.length + SNIPPET_AFTER)
      const head = start > 0 ? '…' : ''
      const tail = end < desc.length ? '…' : ''
      return `${head}${desc.slice(start, end).replace(/\s+/g, ' ').trim()}${tail}`
    }
    return ''
  }

  const terms = computed(() => searchTerms(query.value))

  /** Worker 是否已经回了这条查询的结果（没回之前不要显示「无结果」） */
  const suggestSettled = computed(() => !query.value.trim() || searchHitsQuery.value === query.value)

  /** 这批候选是不是模糊层（拼音/缩写）来的 —— 下拉要如实标注 */
  const suggestFuzzy = computed(() => searchHitsFuzzy.value && (searchHits.value?.length ?? 0) > 0)

  /** 模糊候选里是否混着精确命中（决定提示语用「含」还是「以下是」） */
  const suggestMixed = computed(() => suggestFuzzy.value && searchHitsExactCount.value > 0)

  /**
   * 精确模式下零命中：不下结论说「没有」，而是提示可以切到模糊再试
   * （拼音/缩写是中文最常用的模糊入口，很多人只是没意识到该切模式）。
   */
  const suggestSwitchToFuzzy = computed(() =>
    fuzzyMode.value === 'exact'
    && !!query.value.trim()
    && searchHitsQuery.value === query.value
    && (searchHits.value?.length ?? 0) === 0,
  )

  const suggestRows = computed<SuggestRow[]>(() => {
    const hits = searchHits.value
    const ts = terms.value
    if (!hits?.length || !ts.length) return []
    const map = itemMap.value
    const out: SuggestRow[] = []
    for (const id of hits) {
      const item = map.get(id)
      if (!item) continue
      out.push({ id: item.id, title: item.title, category: item.category, snippet: bodySnippet(item, ts) })
      if (out.length >= SUGGEST_LIMIT) break
    }
    return out
  })

  function chooseSuggest(row: SuggestRow | undefined) {
    suggestOpen.value = false
    if (!row?.id) return
    document.dispatchEvent(new CustomEvent('open-item-modal', { detail: row.id }))
  }

  /** 精确模式零命中时的一键切换：换成模糊模式，同一关键词立即重搜 */
  function switchToFuzzy() {
    searchFuzzyMode.set('fuzzy')
  }
  function onSuggestKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!suggestOpen.value) { suggestOpen.value = true; return }
      const n = suggestRows.value.length
      if (n === 0) return
      suggestIdx.value = e.key === 'ArrowDown'
        ? Math.min(suggestIdx.value + 1, n - 1)
        : Math.max(suggestIdx.value - 1, 0)
    } else if (e.key === 'Enter') {
      if (suggestOpen.value && suggestRows.value.length) {
        e.preventDefault()
        chooseSuggest(suggestRows.value[suggestIdx.value])
      }
    } else if (e.key === 'Escape') {
      suggestOpen.value = false
    }
  }

  return {
    query,
    suggestOpen,
    suggestIdx,
    suggestRows,
    suggestSettled,
    suggestFuzzy,
    suggestMixed,
    suggestSwitchToFuzzy,
    searchInputRef,
    onSearchInputEvent,
    onSearchFocus,
    onSuggestKey,
    chooseSuggest,
    switchToFuzzy,
  }
}
