import { createSearchIndex, type SearchIndex, type SearchOutcome, type SearchableItem } from './iceberg/searchIndex'

let index: SearchIndex | null = null

// F09：初始化竞态防护 —— 索引未就绪前收到的搜索请求缓存为 pending，
// init 完成后重放最新一条（仅保留最后一次，过期查询丢弃）
let ready = false
let pending: { query: string; mode: string; allowFuzzy: boolean; seq: number } | null = null

// 搜索实现（归一化 / 多关键词 AND / 拼音模糊层 / Fuse 选项）全在 lib/iceberg/searchIndex.ts，
// 这个文件只做消息收发 —— 逻辑要能被测试直接调，不能埋在 Worker 里。
function doSearch(query: string, mode: string, allowFuzzy: boolean): SearchOutcome {
  if (!index) return { ids: null, fuzzy: false, exactCount: 0 }
  return index.search(query, mode === 'title' ? 'title' : 'full', { allowFuzzy })
}

function reply(query: string, mode: string, allowFuzzy: boolean, seq: number) {
  const r = doSearch(query, mode, allowFuzzy)
  self.postMessage({ type: 'results', ids: r.ids, fuzzy: r.fuzzy, exactCount: r.exactCount, seq })
}

self.onmessage = (e: MessageEvent) => {
  // F08：Worker 内异常 postMessage 回主线程（主线程侧上报可追踪事件）
  try {
    const { type, items, query, mode, seq } = e.data
    // 顶栏「精确 / 模糊」开关；缺省按模糊（= 精确层零命中时允许回落）
    const allowFuzzy = e.data.allowFuzzy !== false

    if (type === 'init') {
      index = createSearchIndex(items as SearchableItem[])
      ready = true
      self.postMessage({ type: 'ready' })
      // 重放 init 期间积压的最新查询
      if (pending) {
        const p = pending
        pending = null
        reply(p.query, p.mode, p.allowFuzzy, p.seq)
      }
      return
    }

    if (type === 'search') {
      if (!ready) {
        pending = { query, mode, allowFuzzy, seq }  // 仅缓存最新一条
        return
      }
      reply(query, mode, allowFuzzy, seq)
      return
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
  }
}
