// Nano Stores — 跨 Vue island 共享筛选状态
import { atom } from 'nanostores';

export const activeCategories = atom<string[]>([]);
export const activeTags = atom<string[]>([]);
export const searchQuery = atom('');
export const tagFilterMode = atom('OR');
export const searchMode = atom('全文');
export const hiddenCategories = atom<string[]>([]);
export const hiddenTags = atom<string[]>([]);
export const specialFilter = atom('all');

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
