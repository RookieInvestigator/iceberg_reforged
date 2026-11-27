import {
  activeCategories, activeTags, hiddenCategories, hiddenTags,
  searchQuery, tagFilterMode, searchMode, searchFuzzyMode,
  specialFilter, favFilter, sortMode, scatterMode,
} from './store'
import type { V3Dataset } from './keys'

export interface V3UrlState {
  q: string
  cats: string[]
  tags: string[]
  hCats: string[]
  hTags: string[]
  sp: string
  fav: boolean
  tm: 'OR' | 'AND'
  sm: 'full' | 'title'
  fm: 'fuzzy' | 'exact'
  sort: string
  scatter: boolean
}

const VALID_SPECIAL = new Set(['all', 'hasLink', 'hasDesc', 'isNew', 'noLinkNoDesc'])
const VALID_SORT = new Set(['default', 'title-asc', 'title-desc', 'category'])

export const V3_URL_PARAM_KEYS = [
  'q', 'cat', 'tag', 'hcat', 'htag', 'sp', 'fav', 'tm', 'sm', 'fm', 'sort', 'scat',
] as const

export function hasV3UrlState(search: string): boolean {
  const qs = new URLSearchParams(search)
  return V3_URL_PARAM_KEYS.some((k) => qs.has(k))
}

export function readV3UrlState(
  search: string,
  validCats?: Set<string>,
  validTags?: Set<string>,
): Partial<V3UrlState> {
  const qs = new URLSearchParams(search)
  const out: Partial<V3UrlState> = {}

  const parseList = (key: string, allow?: Set<string>): string[] => {
    const raw = qs.get(key)
    if (!raw) return []
    const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return allow ? items.filter((s) => allow.has(s)) : items
  }

  if (qs.has('q')) out.q = qs.get('q') || ''
  if (qs.has('cat')) out.cats = parseList('cat', validCats)
  if (qs.has('tag')) out.tags = parseList('tag', validTags)
  if (qs.has('hcat')) out.hCats = parseList('hcat', validCats)
  if (qs.has('htag')) out.hTags = parseList('htag', validTags)

  const sp = qs.get('sp')
  if (sp && VALID_SPECIAL.has(sp)) out.sp = sp
  if (qs.get('fav') === '1') out.fav = true

  const tm = qs.get('tm')
  if (tm === 'AND' || tm === 'OR') out.tm = tm
  const sm = qs.get('sm')
  if (sm === 'title' || sm === 'full') out.sm = sm
  const fm = qs.get('fm')
  if (fm === 'exact' || fm === 'fuzzy') out.fm = fm
  const sort = qs.get('sort')
  if (sort && VALID_SORT.has(sort)) out.sort = sort
  if (qs.get('scat') === '1') out.scatter = true

  return out
}

export function applyV3UrlState(search: string, ds: V3Dataset): boolean {
  if (!hasV3UrlState(search)) return false
  const validCats = new Set(Object.keys(ds.categoryColors || {}))
  const validTags = new Set(Object.keys(ds.tagMap || {}))
  const s = readV3UrlState(search, validCats, validTags)

  if (s.q !== undefined) searchQuery.set(s.q)
  if (s.cats !== undefined) activeCategories.set(s.cats)
  if (s.tags !== undefined) activeTags.set(s.tags)
  if (s.hCats !== undefined) hiddenCategories.set(s.hCats)
  if (s.hTags !== undefined) hiddenTags.set(s.hTags)
  if (s.sp !== undefined) specialFilter.set(s.sp)
  if (s.fav !== undefined) favFilter.set(s.fav)
  if (s.tm !== undefined) tagFilterMode.set(s.tm)
  if (s.sm !== undefined) searchMode.set(s.sm)
  if (s.fm !== undefined) searchFuzzyMode.set(s.fm)
  if (s.sort !== undefined) sortMode.set(s.sort)
  if (s.scatter !== undefined) scatterMode.set(s.scatter)
  return true
}

export function writeV3UrlParams(qs: URLSearchParams, s: V3UrlState): void {
  for (const k of V3_URL_PARAM_KEYS) qs.delete(k)

  if (s.q.trim()) qs.set('q', s.q)
  if (s.cats.length) qs.set('cat', s.cats.join(','))
  if (s.tags.length) qs.set('tag', s.tags.join(','))
  if (s.hCats.length) qs.set('hcat', s.hCats.join(','))
  if (s.hTags.length) qs.set('htag', s.hTags.join(','))
  if (s.sp && s.sp !== 'all') qs.set('sp', s.sp)
  if (s.fav) qs.set('fav', '1')
  if (s.tm === 'AND') qs.set('tm', 'AND')
  if (s.sm === 'title') qs.set('sm', 'title')
  if (s.fm === 'exact') qs.set('fm', 'exact')
  if (s.sort && s.sort !== 'default') qs.set('sort', s.sort)
  if (s.scatter) qs.set('scat', '1')
}

export function snapshotV3UrlState(): V3UrlState {
  return {
    q: searchQuery.get(),
    cats: activeCategories.get(),
    tags: activeTags.get(),
    hCats: hiddenCategories.get(),
    hTags: hiddenTags.get(),
    sp: specialFilter.get(),
    fav: favFilter.get(),
    tm: tagFilterMode.get() === 'AND' ? 'AND' : 'OR',
    sm: searchMode.get() === 'title' ? 'title' : 'full',
    fm: searchFuzzyMode.get(),
    sort: sortMode.get(),
    scatter: scatterMode.get(),
  }
}
