import { atom, computed } from 'nanostores'
import {
  fontSize, floatMode, detailMode, filterMode, immersiveMode, showRandomBtn,
  sortMode, bgMode, favorites, readItems, showReadMark, showTrail, showNewMark,
  scatterMode, v2DetailSurface, quoteStyle, searchEngine,
  applySimpleMode as baseApplySimpleMode, applyStandardMode as baseApplyStandardMode,
  flushPersistedWrites, cancelPersistedWrites, storedAtom,
} from '../settingsStore'
import {
  activeCategories, activeTags, searchQuery, tagFilterMode, searchMode,
  searchFuzzyMode, hiddenCategories, hiddenTags, specialFilter, favFilter,
  toggleCategory, toggleTag, hideCategory, hideTag, hasActiveFilter,
  NEW_MARK_WINDOW_DAYS,
} from '../filterStore'
import { lang } from '../i18nStore'

export {
  fontSize, floatMode, detailMode, filterMode, immersiveMode, showRandomBtn,
  sortMode, bgMode, favorites, readItems, showReadMark, showTrail, showNewMark,
  scatterMode, v2DetailSurface, quoteStyle, searchEngine,
  flushPersistedWrites, cancelPersistedWrites,
  activeCategories, activeTags, searchQuery, tagFilterMode, searchMode,
  searchFuzzyMode, hiddenCategories, hiddenTags, specialFilter, favFilter,
  toggleCategory, toggleTag, hideCategory, hideTag, hasActiveFilter,
  NEW_MARK_WINDOW_DAYS, lang,
}

export const READ_CAP = 2000

/** V3 专属细节微调：留白密度、对齐方式与可见性 / 无障碍设置 */
export const v3Density = storedAtom<'airy' | 'compact'>('iceberg-v3-density', 'airy')
export const v3Align = storedAtom<'center' | 'left'>('iceberg-v3-align', 'center')
export const colorblindMode = storedAtom<boolean>('iceberg-colorblind-mode', false)
export const showFavMark = storedAtom<boolean>('iceberg-v3-fav-mark', true)
export const showEntryTags = storedAtom<boolean>('iceberg-v3-entry-tags', true)
export const showScrollProgress = storedAtom<boolean>('iceberg-v3-scroll-progress', true)
export const reducedMotion = storedAtom<boolean>('iceberg-reduced-motion', false)

export function applySimpleMode() {
  baseApplySimpleMode()
  showScrollProgress.set(false)
}

export function applyStandardMode() {
  baseApplyStandardMode()
  v3Density.set('airy')
  v3Align.set('center')
  showFavMark.set(true)
  showEntryTags.set(true)
  showScrollProgress.set(true)
}

/** 重置所有显示与交互偏好为默认（保留收藏、已读记录与界面语言） */
export function resetV3Settings() {
  applyStandardMode()
  fontSize.set('md')
  sortMode.set('default')
  scatterMode.set(false)
  v2DetailSurface.set('dark')
  quoteStyle.set('corner')
  searchEngine.set('baidu')
  searchMode.set('full')
  searchFuzzyMode.set('fuzzy')
  colorblindMode.set(false)
  reducedMotion.set(false)
}

/** V2 规范 5 档词条字号映射（与 IndexNextView 一致） */
export const FONT_SCALE_MAP: Record<string, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
}

/** O(1) Set 缓存：直接由共享 readItems / favorites 派生，跨页/跨弹窗改动实时同步 */
export const readSet = computed(readItems, (list) => new Set(list))
export const favSet = computed(favorites, (list) => new Set(list))
export const favCount = computed(favorites, (list) => list.length)
export const readCount = computed(readItems, (list) => list.length)
export const hasActiveFilterAtom = computed(
  [searchQuery, activeCategories, activeTags, hiddenCategories, hiddenTags, specialFilter, favFilter],
  (query, cats, tags, hCats, hTags, spl, favF) => hasActiveFilter({ query, cats, tags, hCats, hTags, spl, favF }),
)

/** O(1) 标记已读（持久化上限 2000） */
export function markRead(id: string) {
  if (!id) return
  const cur = readItems.get()
  if (cur.includes(id)) return
  readItems.set([...cur, id].slice(-READ_CAP))
}

/** 清除全部筛选条件 */
export function resetFilters() {
  searchQuery.set('')
  activeCategories.set([])
  activeTags.set([])
  hiddenCategories.set([])
  hiddenTags.set([])
  specialFilter.set('all')
  favFilter.set(false)
}

/** 构造站外搜索 URL */
export function externalSearchUrl(engine: string, title: string): string {
  const q = encodeURIComponent(title)
  if (engine === 'google') return `https://www.google.com/search?q=${q}`
  if (engine === 'bing') return `https://www.bing.com/search?q=${q}`
  return `https://www.baidu.com/s?wd=${q}`
}
