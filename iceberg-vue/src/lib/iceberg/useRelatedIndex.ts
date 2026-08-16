import { onScopeDispose } from 'vue'
import type { RenderItem } from '../injectionKeys'

/**
 * 相关词条索引（codeq 拆分：原 ItemInteractivity 的相似度推荐职责）。
 * 空闲时预建索引避免首次打开弹窗卡顿；若用户先打开弹窗，getRelMap 同步构建兜底。
 * F18：保存调度 id，卸载时取消，避免路由离开后仍执行重计算。
 */
export function useRelatedIndex(itemMap: Map<string, RenderItem>, relatedMap: Map<string, string[]>) {
  const allItems = [...itemMap.values()]
  let _relMap: Map<string, string[]> | null = null

  function buildRelMap() {
    if (_relMap) return

    // 预建索引
    const catIdx = new Map<string, string[]>();   // category → [itemId]
    const tagIdx = new Map<string, string[]>();   // tag → [itemId]
    const bgIdx = new Map<string, string[]>();    // bigram → [itemId]
    for (const item of allItems) {
      if (!catIdx.has(item.category)) catIdx.set(item.category, []);
      catIdx.get(item.category)!.push(item.id);
      for (const t of (item.tags || [])) {
        if (!tagIdx.has(t)) tagIdx.set(t, []);
        tagIdx.get(t)!.push(item.id);
      }
      for (let i = 0; i < item.title.length - 1; i++) {
        const bg = item.title.slice(i, i + 2);
        if (!bgIdx.has(bg)) bgIdx.set(bg, []);
        bgIdx.get(bg)!.push(item.id);
      }
    }

    _relMap = new Map<string, string[]>();
    for (const item of allItems) {
      const scores = new Map<string, number>();   // id → score
      const bgN = new Map<string, number>();      // id → bigram count

      for (const id of (catIdx.get(item.category) || [])) { if (id !== item.id) scores.set(id, 3); }
      for (const t of (item.tags || [])) {
        for (const id of (tagIdx.get(t) || [])) { if (id !== item.id) scores.set(id, (scores.get(id) || 0) + 2); }
      }
      for (let i = 0; i < item.title.length - 1; i++) {
        for (const id of (bgIdx.get(item.title.slice(i, i + 2)) || [])) {
          if (id !== item.id) bgN.set(id, (bgN.get(id) || 0) + 1);
        }
      }
      for (const [id, n] of bgN) { scores.set(id, (scores.get(id) || 0) + Math.min(n, 3)); }

      const sorted = [...scores.entries()]
        .filter(([, s]) => s >= 2)
        .sort((a, b) => b[1] - a[1]);
      _relMap.set(item.id, sorted.slice(0, 10).map(([id]) => id));
    }
  }
  function getRelMap(): Map<string, string[]> {
    if (_relMap) return _relMap;
    buildRelMap();
    return _relMap!;
  }

  // 空闲预建（F18：调度 id 由 onScopeDispose 清理）
  let relMapTask = 0
  if (typeof requestIdleCallback === 'function') {
    relMapTask = requestIdleCallback(() => { if (!_relMap) buildRelMap() }, { timeout: 5000 })
  } else {
    relMapTask = window.setTimeout(() => { if (!_relMap) buildRelMap() }, 1000)
  }

  /** 关联词条：1. 副表手动精选优先；2. 相似度随机选 2 个推荐 */
  function pickRelated(item: RenderItem) {
    const explicitIds = relatedMap.get(item.id) || (item.related?.length ? item.related : [])
    const explicit = explicitIds
      .map(id => itemMap.get(id)).filter((r): r is RenderItem => Boolean(r))
      .filter(r => r.id !== item.id);
    const usedIds = new Set(explicit.map(r => r.id));

    const pool = (getRelMap().get(item.id) || []).filter(id => !usedIds.has(id));
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const recommended = arr.slice(0, 2).map(id => itemMap.get(id)).filter((r): r is RenderItem => Boolean(r));

    return { explicit, recommended };
  }

  onScopeDispose(() => {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(relMapTask)
    else window.clearTimeout(relMapTask)
  })
  return { pickRelated }
}
