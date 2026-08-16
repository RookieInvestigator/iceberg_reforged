import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { reportError } from '../report'

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
 */
export function useSearchWorker(query: Readonly<Ref<string>>, sMode: Readonly<Ref<string>>) {
  const searchResults = ref<string[] | null>(null) // { ids: string[] } | null
  const searchWorker = new Worker(new URL('../search.worker.ts', import.meta.url), { type: 'module' })
  let searchSeq = 0

  searchWorker.onmessage = (e) => {
    if (e.data.type === 'results') {
      if (e.data.seq !== undefined && e.data.seq !== searchSeq) return
      searchResults.value = e.data.ids ? e.data.ids : null
    } else if (e.data.type === 'error') {
      // F08：Worker 内部异常 → 可追踪事件（不采集查询内容）
      reportError('worker', new Error(e.data.message), { op: 'search' })
      searchResults.value = null
    }
  }
  searchWorker.onerror = (e) => {
    reportError('worker', new Error(e.message || 'unknown'), { op: 'worker-crash' })
    searchResults.value = null
  }

  // 搜索走 Worker（异步，不阻塞主线程；F09：带请求序号）
  watch([query, sMode], ([q, mode]) => {
    searchWorker.postMessage({ type: 'search', query: q, mode, seq: ++searchSeq })
  })

  function initSearch(items: SearchItemPayload[]) {
    searchWorker.postMessage({ type: 'init', items })
  }

  onScopeDispose(() => searchWorker.terminate())
  return { searchResults, initSearch }
}
