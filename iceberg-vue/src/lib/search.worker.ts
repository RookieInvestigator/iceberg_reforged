import Fuse from 'fuse.js'

let fuseFull: Fuse<any> | null = null
let fuseTitle: Fuse<any> | null = null
let itemMap: Map<string, any> = new Map()

// F09：初始化竞态防护 —— 索引未就绪前收到的搜索请求缓存为 pending，
// init 完成后重放最新一条（仅保留最后一次，过期查询丢弃）
let ready = false
let pending: { query: string; mode: string; seq: number } | null = null

function doSearch(query: string, mode: string): string[] | null {
  if (!query) return null
  const fuse = mode === 'title' ? fuseTitle : fuseFull
  if (!fuse) return null
  const results = fuse.search(query)
  return results.map((r: any) => r.item.id)
}

self.onmessage = (e: MessageEvent) => {
  // F08：Worker 内异常 postMessage 回主线程（主线程侧上报可追踪事件）
  try {
    const { type, items, query, mode, seq } = e.data

    if (type === 'init') {
      itemMap = new Map(items.map((i: any) => [i.id, i]))
      const allItems = items.map((i: any) => markRaw(i))
      // Pre-build both indices
      fuseTitle = new Fuse(allItems, { keys: ['title'], threshold: 0.3, minMatchCharLength: 1, distance: 100 })
      fuseFull = new Fuse(allItems, { keys: ['title', 'desc', 'category', 'tags'], threshold: 0.3, minMatchCharLength: 1, distance: 100 })
      ready = true
      self.postMessage({ type: 'ready' })
      // 重放 init 期间积压的最新查询
      if (pending) {
        const p = pending
        pending = null
        self.postMessage({ type: 'results', ids: doSearch(p.query, p.mode), seq: p.seq })
      }
      return
    }

    if (type === 'search') {
      if (!ready) {
        pending = { query, mode, seq }  // 仅缓存最新一条
        return
      }
      self.postMessage({ type: 'results', ids: doSearch(query, mode), seq })
      return
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
  }
}

// markRaw not available in worker — just pass through
function markRaw<T>(obj: T): T { return obj }
