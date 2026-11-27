import { onScopeDispose } from 'vue'
import type { EntityRecord } from './appendix'
import { extractEntryEntities, timeParentPeriod } from './entityExtract'
import type { RenderItem } from '../injectionKeys'

function categoriesOf(item: RenderItem): string[] {
  const raw = item.categories && item.categories.length ? item.categories : [item.category]
  const out: string[] = []
  for (const c of raw) {
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

function tierNum(tier: string | undefined): number {
  const m = tier ? /(\d+)/.exec(tier) : null
  return m ? Number(m[1]) : 9
}

function addPost(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key)
  if (list) list.push(id)
  else map.set(key, [id])
}

/**
 * 相关词条索引（主冰山图推荐词条与副表语义推荐）：
 * 多维 IDF 加权评分（多分类 + 地名 + 时间/年代 + 核心名词 + 标签 + 标题重合 + 互涉 + 层级）。
 * 空闲时预建索引避免首次打开弹窗卡顿；若用户先打开弹窗，getRelMap 同步构建兜底。
 */
export function useRelatedIndex(
  itemMap: Map<string, RenderItem>,
  relatedMap: Map<string, string[]>,
  entitiesMap?: Map<string, EntityRecord>,
) {
  const allItems = [...itemMap.values()]
  const n = allItems.length
  let _relMap: Map<string, string[]> | null = null

  function buildRelMap() {
    if (_relMap) return

    const itemEntities = new Map<string, EntityRecord>()
    const itemDecades = new Map<string, string[]>()
    const itemCats = new Map<string, string[]>()

    const catIdx = new Map<string, string[]>()
    const tagIdx = new Map<string, string[]>()
    const placeIdx = new Map<string, string[]>()
    const timeIdx = new Map<string, string[]>()
    const decadeIdx = new Map<string, string[]>()
    const nounIdx = new Map<string, string[]>()
    const platformIdx = new Map<string, string[]>()
    const bgIdx = new Map<string, string[]>()

    for (const item of allItems) {
      const cats = categoriesOf(item)
      itemCats.set(item.id, cats)
      for (const c of cats) addPost(catIdx, c, item.id)

      for (const t of item.tags || []) addPost(tagIdx, t, item.id)

      const rec = entitiesMap?.get(item.id)
      const ent =
        rec && (rec.places.length || rec.times.length || rec.nouns.length || rec.platforms.length || !item.desc)
          ? rec
          : item.desc
            ? extractEntryEntities(item.title, item.desc)
            : (rec ?? { places: [], times: [], nouns: [], platforms: [] })
      itemEntities.set(item.id, ent)

      for (const p of ent.places) addPost(placeIdx, p, item.id)
      const decs = new Set<string>()
      for (const tm of ent.times) {
        addPost(timeIdx, tm, item.id)
        const parent = timeParentPeriod(tm)
        if (parent && !ent.times.includes(parent)) decs.add(parent)
      }
      const decList = [...decs]
      itemDecades.set(item.id, decList)
      for (const dec of decList) addPost(decadeIdx, dec, item.id)
      for (const nn of ent.nouns) addPost(nounIdx, nn, item.id)
      for (const pf of ent.platforms) addPost(platformIdx, pf, item.id)

      const cleanTitle = item.title.replace(/[\s·・「」『』“”"'()（）【】\[\]，,。.!！?？:：;；\-—…~]/g, '')
      const seenBg = new Set<string>()
      for (let i = 0; i < cleanTitle.length - 1; i++) {
        const bg = cleanTitle.slice(i, i + 2)
        if (!seenBg.has(bg)) {
          seenBg.add(bg)
          addPost(bgIdx, bg, item.id)
        }
      }
    }

    const idfScale = Math.max(6, n)
    const idf = (df: number) => Math.min(4.6, Math.log(1 + idfScale / Math.max(1, df)))
    const maxBgDf = Math.max(12, Math.floor(n * 0.08))

    _relMap = new Map<string, string[]>()
    for (const item of allItems) {
      const scores = new Map<string, number>()
      const catHits = new Map<string, number>()
      const placeHits = new Map<string, number>()
      const nounHits = new Map<string, number>()
      const bgN = new Map<string, number>()
      const ent = itemEntities.get(item.id)!
      const cats = itemCats.get(item.id)!

      // 1) 多分类
      for (const cat of cats) {
        const list = catIdx.get(cat) || []
        const catW = idf(list.length)
        for (const id of list) {
          if (id === item.id) continue
          const target = itemMap.get(id)
          const isMain = cat === item.category && cat === target?.category
          scores.set(id, (scores.get(id) || 0) + (isMain ? 2.05 + catW * 0.48 : 1.75 + catW * 0.45))
          catHits.set(id, (catHits.get(id) || 0) + 1)
        }
      }
      for (const [id, hits] of catHits) {
        if (hits >= 2) scores.set(id, (scores.get(id) || 0) + 2.4)
      }

      // 2) 地名
      for (const p of ent.places) {
        const list = placeIdx.get(p) || []
        const base = 2.0 + idf(list.length) * 1.15
        for (const id of list) {
          if (id === item.id) continue
          const h = placeHits.get(id) || 0
          placeHits.set(id, h + 1)
          scores.set(id, (scores.get(id) || 0) + base * (h === 0 ? 1 : 0.65))
        }
      }

      // 3) 时间与年代
      const matchedTime = new Set<string>()
      for (const tm of ent.times) {
        const list = timeIdx.get(tm) || []
        const w = 1.65 + idf(list.length) * 0.95
        for (const id of list) {
          if (id === item.id) continue
          matchedTime.add(id)
          scores.set(id, (scores.get(id) || 0) + w)
        }
      }
      for (const dec of itemDecades.get(item.id) || []) {
        const list = [...(timeIdx.get(dec) || []), ...(decadeIdx.get(dec) || [])]
        const w = 1.15 + idf(list.length) * 0.45
        for (const id of list) {
          if (id === item.id || matchedTime.has(id)) continue
          matchedTime.add(id)
          scores.set(id, (scores.get(id) || 0) + w)
        }
      }

      // 4) 核心名词
      for (const nn of ent.nouns) {
        const list = nounIdx.get(nn) || []
        const base = 1.45 + idf(list.length) * 0.92
        for (const id of list) {
          if (id === item.id) continue
          const h = nounHits.get(id) || 0
          nounHits.set(id, h + 1)
          scores.set(id, (scores.get(id) || 0) + base * (h === 0 ? 1 : h === 1 ? 0.8 : 0.6))
        }
      }

      // 4b) 发布平台（单独维度，权重约为名词的 1.1 倍）
      for (const pf of ent.platforms) {
        const list = platformIdx.get(pf) || []
        const base = 1.6 + idf(list.length) * 1.0
        for (const id of list) {
          if (id === item.id) continue
          scores.set(id, (scores.get(id) || 0) + base)
        }
      }

      // 5) 标签
      for (const t of item.tags || []) {
        const list = tagIdx.get(t) || []
        const w = 2.0 + idf(list.length) * 0.75
        for (const id of list) {
          if (id !== item.id) scores.set(id, (scores.get(id) || 0) + w)
        }
      }

      // 6) 标题 bigram（过滤高频泛词）
      const cleanTitle = item.title.replace(/[\s·・「」『』“”"'()（）【】\[\]，,。.!！?？:：;；\-—…~]/g, '')
      for (let i = 0; i < cleanTitle.length - 1; i++) {
        const list = bgIdx.get(cleanTitle.slice(i, i + 2)) || []
        if (list.length > maxBgDf) continue
        for (const id of list) {
          if (id !== item.id) bgN.set(id, (bgN.get(id) || 0) + 1)
        }
      }
      for (const [id, hits] of bgN) {
        scores.set(id, (scores.get(id) || 0) + Math.min(hits, 3) * 0.95)
      }

      // 7) 文本互涉
      if (item.desc && item.desc.length >= 6) {
        for (const other of allItems) {
          if (other.id === item.id) continue
          const t = other.title.trim()
          if (t.length >= 3 && t.length <= 18 && item.desc.includes(t)) {
            scores.set(other.id, (scores.get(other.id) || 0) + 5.2)
          }
        }
      }

      // 8) 层级贴近加权
      const ta = tierNum(item.tier)
      for (const [id, sc] of scores) {
        const diff = Math.abs(ta - tierNum(itemMap.get(id)?.tier))
        if (diff === 0) scores.set(id, sc + 0.45)
        else if (diff === 1) scores.set(id, sc + 0.25)
      }

      const sorted = [...scores.entries()]
        .filter(([, s]) => s >= 2.4)
        .sort((a, b) => b[1] - a[1])
      _relMap.set(item.id, sorted.slice(0, 10).map(([id]) => id))
    }
  }

  function getRelMap(): Map<string, string[]> {
    if (_relMap) return _relMap
    buildRelMap()
    return _relMap!
  }

  // 空闲预建（F18：调度 id 由 onScopeDispose 清理）
  let relMapTask = 0
  if (typeof requestIdleCallback === 'function') {
    relMapTask = requestIdleCallback(() => { if (!_relMap) buildRelMap() }, { timeout: 5000 })
  } else {
    relMapTask = window.setTimeout(() => { if (!_relMap) buildRelMap() }, 1000)
  }

  /** 关联词条：1. 副表手动精选优先；2. 高分语义相似词条推荐（取前 2 个最强推荐） */
  function pickRelated(item: RenderItem) {
    const explicitIds = relatedMap.get(item.id) || (item.related?.length ? item.related : [])
    const explicit = explicitIds
      .map(id => itemMap.get(id)).filter((r): r is RenderItem => Boolean(r))
      .filter(r => r.id !== item.id)
    const usedIds = new Set(explicit.map(r => r.id))

    const pool = (getRelMap().get(item.id) || []).filter(id => !usedIds.has(id))
    const recommended = pool
      .slice(0, 2)
      .map(id => itemMap.get(id))
      .filter((r): r is RenderItem => Boolean(r))

    return { explicit, recommended }
  }

  onScopeDispose(() => {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(relMapTask)
    else window.clearTimeout(relMapTask)
  })
  return { pickRelated }
}
