import { atom } from 'nanostores';

export function storedAtom<T>(key: string, fallback: T) {
  let val = fallback;
  try {
    const v = localStorage.getItem(key);
    if (v != null) {
      const parsed = JSON.parse(v);
      // 校验解析值类型与 fallback 一致，防止错误形状（如 {} 代替 []）导致运行时崩溃
      const ok =
        (typeof fallback === 'string' && typeof parsed === 'string') ||
        (typeof fallback === 'boolean' && typeof parsed === 'boolean') ||
        (typeof fallback === 'number' && typeof parsed === 'number') ||
        (Array.isArray(fallback) && Array.isArray(parsed)) ||
        (fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback) &&
         typeof parsed === 'object' && !Array.isArray(parsed));
      if (ok) val = parsed as T;
      // 类型不匹配 → 保持 fallback，静默修复损坏数据
    }
  } catch {}
  const a = atom<T>(val);
  a.listen((v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} });
  return a;
}

export const fontSize = storedAtom('iceberg-font-size', 'md');
export const floatMode = storedAtom('iceberg-float-mode', 'static');
export const detailMode = storedAtom('iceberg-detail-mode', 'modal');
export const filterMode = storedAtom('iceberg-filter-mode', 'hide');
export const immersiveMode = storedAtom('iceberg-immersive-mode', true);
export const showRandomBtn = storedAtom('iceberg-show-random-btn', true);
export const showLinkEmoji = storedAtom('iceberg-show-link-emoji', false);
export const showDescEmoji = storedAtom('iceberg-show-desc-emoji', false);
export const sortMode = storedAtom('iceberg-sort-mode', 'default');
export const bgMode = storedAtom('iceberg-bg-mode', 'static');
export const favorites = storedAtom('iceberg-favorites', [] as string[]);
export const readItems = storedAtom('iceberg-read-items', [] as string[]);
export const showReadMark = storedAtom('iceberg-show-read-mark', true);
export const showNewMark = storedAtom('iceberg-show-new-mark', true);
export const noItemShadow = storedAtom('iceberg-no-item-shadow', false);

export function applySimpleMode() {
  detailMode.set('tooltip'); filterMode.set('dim'); immersiveMode.set(false);
  bgMode.set('black'); showReadMark.set(false); showNewMark.set(false); showRandomBtn.set(false); floatMode.set('none'); noItemShadow.set(true);
}
export function applyStandardMode() {
  detailMode.set('modal'); filterMode.set('hide'); immersiveMode.set(true);
  showRandomBtn.set(true); showReadMark.set(true); showNewMark.set(true); bgMode.set('static'); floatMode.set('static'); noItemShadow.set(false);
}

export const FONT_SIZE_MAP: Record<string, number> = { xs: 0.75, sm: 0.875, md: 1.0, lg: 1.125, xl: 1.25 };
export const FONT_LABELS: Record<string, string> = { xs: '极小', sm: '小', md: '中', lg: '大', xl: '特大' };
