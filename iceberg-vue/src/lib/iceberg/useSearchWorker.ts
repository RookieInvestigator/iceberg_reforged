import { watch, onScopeDispose, type Ref } from 'vue'
import { reportError } from '../report'
import { searchHits, searchHitsExactCount, searchHitsFuzzy, searchHitsQuery } from './wallState'

/** 搜索初始化/增量搜索载荷（仅发送搜索所需字段，减少结构化克隆开销） */
export interface SearchItemPayload {
  id: string
  title: string
  desc: string
  category: string
  tags: string[]
}

/**
 * Fuse.js Web Worker 引导（codeq 拆分：原 ItemInteractivity 的搜索 Worker 职责）。
 * 搜索不阻塞主线程；F09 请求序号 —— 快速切换查询/模式时丢弃过期响应。
 * ⚠️ Worker URL 相对本文件解析（src/lib/iceberg/ → ../search.worker.ts）。
 *
 * **惰性启动**：Worker 里装着 Fuse + pinyin-match + 拼音首字母表（gzip ≈ 45KB），
 * 首屏不该为「还没开始搜索」付这份体积。第一次有非空查询时才建 Worker ——
 * 之后索引一直留在 Worker 里，打字不走网络。
 *
 * 命中结果写进 wallState 的 searchHits（模块级单例）：词条墙的过滤管线与
 * 搜索速查下拉读同一份命中，**不再各建一个 Fuse 索引**（两套实现的必然结局是
 * 「下拉说无结果、墙上有命中」）。searchHitsQuery 记录命中对应的查询，下拉据此
 * 区分「真的没搜到」与「Worker 还没回来」。
 */
export function useSearchWorker(
  query: Readonly<Ref<string>>,
  sMode: Readonly<Ref<string>>,
  fuzzyMode: Readonly<Ref<'fuzzy' | 'exact'>>,
) {
  const searchResults = searchHits
  let searchWorker: Worker | null = null
  /** 首个查询可能早于 initSearch（挂载顺序），先存着，建 Worker 时一起发 */
  let pendingInit: SearchItemPayload[] | null = null
  let searchSeq = 0
  // 只接受最新一条响应的 seq；因此这条记录的查询必然就是当前响应对应的那条
  let sentQuery = ''

  function settle(ids: string[] | null, fuzzy: boolean, exactCount: number) {
    // 三态必须分清：null = 没有搜索（全量可见）；[] = 搜了但零命中（一条都不该可见）
    searchResults.value = ids
    searchHitsFuzzy.value = fuzzy && !!ids && ids.length > 0
    searchHitsExactCount.value = exactCount
    searchHitsQuery.value = sentQuery
  }

  function ensureWorker(): Worker {
    if (searchWorker) return searchWorker
    const w = new Worker(new URL('../search.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      if (e.data.type === 'results') {
        if (e.data.seq !== undefined && e.data.seq !== searchSeq) return
        settle(e.data.ids ?? null, e.data.fuzzy === true, e.data.exactCount ?? 0)
      } else if (e.data.type === 'error') {
        // F08：Worker 内部异常 → 可追踪事件（不采集查询内容）
        reportError('worker', new Error(e.data.message), { op: 'search' })
        settle(null, false, 0)
      }
    }
    w.onerror = (e) => {
      reportError('worker', new Error(e.message || 'unknown'), { op: 'worker-crash' })
      settle(null, false, 0)
    }
    searchWorker = w
    if (pendingInit) w.postMessage({ type: 'init', items: pendingInit })
    return w
  }

  // 搜索走 Worker（异步，不阻塞主线程；F09：带请求序号）
  // 三个维度任一变化都重发：查询词 / 全文-标题 / 精确-模糊
  watch([query, sMode, fuzzyMode], ([q, mode, fm]) => {
    sentQuery = q
    // 清空查询不需要 Worker：直接回到「没有搜索」三态，别为空字符串唤醒 45KB
    if (!q.trim()) {
      settle(null, false, 0)
      return
    }
    ensureWorker().postMessage({ type: 'search', query: q, mode, allowFuzzy: fm !== 'exact', seq: ++searchSeq })
  })

  function initSearch(items: SearchItemPayload[]) {
    pendingInit = items
    searchWorker?.postMessage({ type: 'init', items })
  }

  onScopeDispose(() => searchWorker?.terminate())
  return { searchResults, initSearch }
}
