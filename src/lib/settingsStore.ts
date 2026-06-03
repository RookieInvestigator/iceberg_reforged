import { atom } from 'nanostores';

export function storedAtom<T>(key: string, fallback: T) {
  let val = fallback;
  try { const v = localStorage.getItem(key); if (v != null) val = JSON.parse(v); } catch {}
  const a = atom<T>(val);
  a.listen((v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} });
  return a;
}

export const fontSize = storedAtom('iceberg-font-size', 'md');
export const floatMode = storedAtom('iceberg-float-mode', 'none');
export const detailMode = storedAtom('iceberg-detail-mode', 'tooltip');
export const filterMode = storedAtom('iceberg-filter-mode', 'dim');
export const immersiveMode = storedAtom('iceberg-immersive-mode', false);
export const showRandomBtn = storedAtom('iceberg-show-random-btn', false);
export const showLinkEmoji = storedAtom('iceberg-show-link-emoji', false);
export const showDescEmoji = storedAtom('iceberg-show-desc-emoji', false);
export const sortMode = storedAtom('iceberg-sort-mode', 'default');
export const bgMode = storedAtom('iceberg-bg-mode', 'static'); // 'black' | 'static' | 'dynamic'
export const favorites = storedAtom('iceberg-favorites', [] as string[]);

export const FONT_SIZE_MAP: Record<string, number> = { xs: 0.75, sm: 0.875, md: 1.0, lg: 1.125, xl: 1.25 };
export const FONT_LABELS: Record<string, string> = { xs: '极小', sm: '小', md: '中', lg: '大', xl: '特大' };
