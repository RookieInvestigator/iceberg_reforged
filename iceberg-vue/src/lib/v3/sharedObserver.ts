type ObserverCallback = (entry: IntersectionObserverEntry) => void

interface ObserverBucket {
  observer: IntersectionObserver
  callbacks: Map<Element, ObserverCallback>
}

const pool = new Map<string, ObserverBucket>()

function bucketKey(rootMargin: string, threshold: number | number[]): string {
  const t = Array.isArray(threshold) ? threshold.join(',') : String(threshold)
  return `${rootMargin}|${t}`
}

/**
 * 共享 IntersectionObserver 池：按 rootMargin + threshold 复用底层 observer 实例，
 * 所有观察目标解除订阅后自动 disconnect 并释放桶。
 */
export function observeShared(
  el: Element,
  cb: ObserverCallback,
  opts: { rootMargin?: string; threshold?: number | number[] } = {},
): () => void {
  if (typeof IntersectionObserver !== 'function') return () => {}
  const rootMargin = opts.rootMargin ?? '0px'
  const threshold = opts.threshold ?? 0
  const key = bucketKey(rootMargin, threshold)

  let bucket = pool.get(key)
  if (!bucket) {
    const callbacks = new Map<Element, ObserverCallback>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbacks.get(entry.target)?.(entry)
        }
      },
      { rootMargin, threshold },
    )
    bucket = { observer, callbacks }
    pool.set(key, bucket)
  }

  bucket.callbacks.set(el, cb)
  bucket.observer.observe(el)

  let active = true
  return () => {
    if (!active) return
    active = false
    const b = pool.get(key)
    if (!b) return
    b.callbacks.delete(el)
    b.observer.unobserve(el)
    if (b.callbacks.size === 0) {
      b.observer.disconnect()
      pool.delete(key)
    }
  }
}

export function _observerPoolSize(): number {
  return pool.size
}
