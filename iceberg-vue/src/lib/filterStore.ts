// Nano Stores — 跨 Vue island 共享筛选状态
import { atom } from 'nanostores';

export const activeCategories = atom<string[]>([]);
export const activeTags = atom<string[]>([]);
export const searchQuery = atom('');
export const tagFilterMode = atom('OR');
export const searchMode = atom('full');
export const hiddenCategories = atom<string[]>([]);
export const hiddenTags = atom<string[]>([]);
export const specialFilter = atom('all');
export const favFilter = atom(false);

export function toggleCategory(cat: string) {
  const current = activeCategories.get();
  if (current.includes(cat)) {
    activeCategories.set(current.filter(c => c !== cat));
  } else {
    activeCategories.set([...current, cat]);
  }
}

export function toggleTag(tag: string) {
  const current = activeTags.get();
  if (current.includes(tag)) {
    activeTags.set(current.filter(t => t !== tag));
  } else {
    activeTags.set([...current, tag]);
  }
}

export function hideCategory(cat: string) {
  const cur = hiddenCategories.get();
  hiddenCategories.set(cur.includes(cat) ? cur.filter(c => c !== cat) : [...cur, cat]);
}

export function hideTag(tag: string) {
  const cur = hiddenTags.get();
  hiddenTags.set(cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]);
}

// NEW 标记窗口（天）— 主表 modifiedAt 距当前时间在此窗口内视为「最近更新」
export const NEW_MARK_WINDOW_DAYS = 30;
