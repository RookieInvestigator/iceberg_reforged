import Fuse from 'fuse.js'

let fuseFull: Fuse<any> | null = null
let fuseTitle: Fuse<any> | null = null
let itemMap: Map<string, any> = new Map()

self.onmessage = (e: MessageEvent) => {
  const { type, items, query, mode } = e.data

  if (type === 'init') {
    itemMap = new Map(items.map((i: any) => [i.id, i]))
    const allItems = items.map((i: any) => markRaw(i))
    // Pre-build both indices
    fuseTitle = new Fuse(allItems, { keys: ['title'], threshold: 0.3, minMatchCharLength: 1, distance: 100 })
    fuseFull = new Fuse(allItems, { keys: ['title', 'desc', 'category', 'tags'], threshold: 0.3, minMatchCharLength: 1, distance: 100 })
    self.postMessage({ type: 'ready' })
    return
  }

  if (type === 'search') {
    if (!query) { self.postMessage({ type: 'results', ids: null }); return }
    const fuse = mode === 'title' ? fuseTitle : fuseFull
    if (!fuse) { self.postMessage({ type: 'results', ids: [] }); return }
    const results = fuse.search(query)
    const ids = results.map((r: any) => r.item.id)
    self.postMessage({ type: 'results', ids })
    return
  }
}

// markRaw not available in worker — just pass through
function markRaw<T>(obj: T): T { return obj }
