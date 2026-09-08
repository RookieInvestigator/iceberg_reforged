import { computed, inject, ref } from 'vue'
import { useStore } from '@nanostores/vue'
import Fuse from 'fuse.js'
import { searchQuery } from '../../filterStore'
import { RENDER_ITEMS_KEY, type RenderItem } from '../../injectionKeys'

// V2 搜索速查下拉（审计 C3：V2FilterBar 拆分其二）。
// 输入框 Fuse 标题速查（与 Worker 全文搜索互补）：防抖写 store + 下拉开合/键盘导航。
// query 读全局 searchQuery（150ms 防抖后才更新，速查天然滞后一拍——原语义保留）。
export interface SuggestRow {
  id: string
  title: string
  category: string
}

export function useV2SearchSuggest() {
  const query = useStore(searchQuery)
  const suggestOpen = ref(false)
  const suggestIdx = ref(0)
  const searchInputRef = ref<HTMLInputElement | null>(null)

  // 搜索 150ms 防抖（与 v1 同参数，语义一致）
  let debounce = 0
  function onSearchInputEvent(e: Event) {
    const v = (e.target as HTMLInputElement).value
    clearTimeout(debounce)
    debounce = window.setTimeout(() => searchQuery.set(v), 150)
    suggestIdx.value = 0
    if (v.trim()) { ensureSuggest(); suggestOpen.value = true }
  }
  function onSearchFocus() {
    if (query.value.trim()) { ensureSuggest(); suggestOpen.value = true }
  }

  // 输入框速查下拉：标题 Fuse 速查（与 Worker 全文搜索互补），Enter 直达词条
  const renderItemsRef = inject(RENDER_ITEMS_KEY)
  let suggestFuse: Fuse<RenderItem> | null = null
  function ensureSuggest() {
    if (!suggestFuse) {
      const items: RenderItem[] = renderItemsRef?.value || []
      suggestFuse = new Fuse(items, {
        keys: [{ name: 'title', weight: 0.7 }, { name: 'category', weight: 0.2 }, { name: 'tags', weight: 0.1 }],
        threshold: 0.3,
        ignoreLocation: true,
      })
    }
    return suggestFuse
  }
  const suggestRows = computed<SuggestRow[]>(() => {
    const q = query.value.trim()
    if (!q) return []
    return ensureSuggest().search(q, { limit: 6 }).map((h) => ({ id: h.item.id, title: h.item.title, category: h.item.category }))
  })
  function chooseSuggest(row: SuggestRow | undefined) {
    suggestOpen.value = false
    if (!row?.id) return
    document.dispatchEvent(new CustomEvent('open-item-modal', { detail: row.id }))
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
    searchInputRef,
    onSearchInputEvent,
    onSearchFocus,
    onSuggestKey,
    chooseSuggest,
    ensureSuggest,
  }
}
