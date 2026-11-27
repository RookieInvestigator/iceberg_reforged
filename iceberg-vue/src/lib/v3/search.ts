import { computed, onScopeDispose, ref, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import { normalizeSearchText, searchTerms } from '../iceberg/searchIndex'
import { toPlainText } from '../richText'
import { reportError } from '../report'
import { searchFuzzyMode, searchMode, searchQuery } from './store'
import type { V3Item, V3SearchState } from './keys'

const SNIPPET_BEFORE = 10
const SNIPPET_AFTER = 16

let lastSnippetQuery = ''
let lastSnippetTerms: string[] = []

function getSnippetTerms(rawQuery: string): string[] {
  if (rawQuery === lastSnippetQuery) return lastSnippetTerms
  lastSnippetQuery = rawQuery
  lastSnippetTerms = searchTerms(rawQuery)
  return lastSnippetTerms
}

/**
 * 正文摘要：仅当标题未命中全部关键词时返回纯文本上下文片段；
 * 过滤富文本标记（==highlight== / > quote 等），避免源码泄露进速查列表。
 */
export function bodySnippet(item: Pick<V3Item, 'title' | 'desc'>, rawQuery: string): string {
  const terms = getSnippetTerms(rawQuery)
  if (!terms.length) return ''
  const normTitle = normalizeSearchText(item.title)
  if (terms.every((t) => normTitle.includes(t))) return ''
  const plain = toPlainText(item.desc || '')
  if (!plain) return ''
  const lower = plain.toLowerCase()
  const norm = normalizeSearchText(plain)
  for (const term of terms) {
    let at = lower.indexOf(term)
    if (at < 0) at = norm.indexOf(term)
    if (at < 0) continue
    const start = Math.max(0, at - SNIPPET_BEFORE)
    const end = Math.min(plain.length, at + term.length + SNIPPET_AFTER)
    const head = start > 0 ? '…' : ''
    const tail = end < plain.length ? '…' : ''
    return `${head}${plain.slice(start, end).replace(/\s+/g, ' ').trim()}${tail}`
  }
  return ''
}

/**
 * 作用域化的 Worker 搜索控制器：无模块级全局变量泄漏，切换 quoteStyle 时自动重索引并重搜。
 */
export function useV3Search(items: () => readonly V3Item[]): V3SearchState {
  const query = useStore(searchQuery)
  const scope = useStore(searchMode)
  const fuzzyMode = useStore(searchFuzzyMode)

  const hits = ref<string[] | null>(null)
  const fuzzy = ref(false)
  const exactCount = ref(0)
  const hitsQuery = ref('')

  let worker: Worker | null = null
  let indexedSource: readonly V3Item[] | null = null
  let initPayload: Array<{ id: string; title: string; desc: string; category: string; tags: string[] }> | null = null
  let seq = 0
  let sentQuery = ''
  let debounce = 0

  function settle(ids: string[] | null, isFuzzy: boolean, exact: number, qSnapshot = sentQuery) {
    hits.value = ids
    fuzzy.value = isFuzzy && !!ids && ids.length > 0
    exactCount.value = exact
    hitsQuery.value = qSnapshot
  }

  function ensureWorker(): Worker {
    if (worker) return worker
    const w = new Worker(new URL('../search.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      if (e.data?.type === 'results') {
        if (e.data.seq !== undefined && e.data.seq !== seq) return
        settle(e.data.ids ?? null, e.data.fuzzy === true, e.data.exactCount ?? 0, sentQuery)
      } else if (e.data?.type === 'error') {
        reportError('worker', new Error(e.data.message), { op: 'v3-search' })
        settle(null, false, 0, sentQuery)
      }
    }
    w.onerror = (e) => {
      reportError('worker', new Error(e.message || 'unknown'), { op: 'v3-worker' })
      settle(null, false, 0, sentQuery)
    }
    worker = w
    if (initPayload) w.postMessage({ type: 'init', items: initPayload })
    return w
  }

  function syncIndex(force = false) {
    const list = items()
    if (!force && indexedSource === list && initPayload) return
    indexedSource = list
    initPayload = list.map((it) => ({
      id: it.id,
      title: it.title,
      desc: it.desc || '',
      category: it.category,
      tags: it.tags || [],
    }))
    if (worker) worker.postMessage({ type: 'init', items: initPayload })
  }

  function dispatchSearch(q: string) {
    sentQuery = q
    if (!q.trim()) {
      settle(null, false, 0, '')
      return
    }
    syncIndex()
    ensureWorker().postMessage({
      type: 'search',
      query: q,
      mode: scope.value === 'title' ? 'title' : 'full',
      allowFuzzy: fuzzyMode.value !== 'exact',
      seq: ++seq,
    })
  }

  watch([query, scope, fuzzyMode], ([q]) => {
    window.clearTimeout(debounce)
    if (!q.trim()) {
      sentQuery = ''
      settle(null, false, 0, '')
      return
    }
    debounce = window.setTimeout(() => dispatchSearch(q), 120)
  })

  // 引号风格切换会产出新 items 数组引用：同步更新 Worker 索引，如有激活搜索则重跑
  watch(items, () => {
    indexedSource = null
    initPayload = null
    if (worker || query.value.trim()) {
      syncIndex(true)
      if (query.value.trim()) dispatchSearch(query.value)
    }
  })

  onScopeDispose(() => {
    window.clearTimeout(debounce)
    worker?.terminate()
    worker = null
    initPayload = null
    indexedSource = null
  })

  const resultSet = computed<Set<string> | null>(() => {
    const h = hits.value
    return h ? new Set(h) : null
  })

  return {
    hits,
    resultSet,
    fuzzy,
    exactCount,
    hitsQuery,
  }
}
