import { atom } from 'nanostores';

// ── 持久化写入节流（2026-08-21）──
// 热路径写入（已读 / 收藏 / 设置切换）合并为防抖写盘（500ms）：每次 markRead / 收藏切换
// 不再同步 JSON.stringify + 写盘；页面隐藏 / 卸载时统一 flush，丢失上限 = 最后一批
// （本应用无跨标签同步语义，可接受）。直读 localStorage 的外部方须先 flushPersistedWrites()。
const PERSIST_DEBOUNCE_MS = 500;
interface PendingWrite { key: string; timer: number; value: unknown }
const pendingWrites: PendingWrite[] = [];
let flushBound = false;

function storageSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐私模式/配额：静默 */ }
}

/** 立即落盘所有待写入（导出 / 直读 localStorage 前调用） */
export function flushPersistedWrites() {
  for (const p of pendingWrites) {
    window.clearTimeout(p.timer);
    storageSet(p.key, p.value);
  }
  pendingWrites.length = 0;
}

/** 丢弃所有待写入（数据清除前调用，防防抖定时器把旧值写回） */
export function cancelPersistedWrites() {
  for (const p of pendingWrites) window.clearTimeout(p.timer);
  pendingWrites.length = 0;
}

function bindPageFlush() {
  if (flushBound || typeof window === 'undefined') return;
  flushBound = true;
  window.addEventListener('pagehide', flushPersistedWrites);
  window.addEventListener('visibilitychange', flushPersistedWrites);
  window.addEventListener('beforeunload', flushPersistedWrites);
}

function schedulePersist(key: string, value: unknown) {
  bindPageFlush();
  let p = pendingWrites.find((x) => x.key === key);
  if (!p) {
    p = { key, timer: 0, value };
    pendingWrites.push(p);
  } else {
    window.clearTimeout(p.timer);
    p.value = value; // latest-wins
  }
  p.timer = window.setTimeout(() => {
    storageSet(key, p.value);
    const i = pendingWrites.indexOf(p);
    if (i > -1) pendingWrites.splice(i, 1);
  }, PERSIST_DEBOUNCE_MS);
}

export function storedAtom<T>(key: string, fallback: T) {
  let val = fallback;
  try {
    const v = localStorage.getItem(key);
    if (v != null) {
      const parsed = JSON.parse(v);
      // 校验解析值类型与 fallback 一致，防止错误形状（如 {} 代替 []）导致运行时崩溃
      // P1-21: ① typeof null === 'object'，对象分支必须显式排除 parsed === null；
      //        ② 数组分支校验元素类型与 fallback 首元素一致（不一致回退 fallback），
      //           防止 "null" / 错误形状存入后数组方法崩溃。
      const arrOk =
        Array.isArray(fallback) && Array.isArray(parsed) &&
        (fallback.length === 0 || parsed.length === 0 || typeof parsed[0] === typeof fallback[0]);
      const objOk =
        fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback) &&
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
      const ok =
        (typeof fallback === 'string' && typeof parsed === 'string') ||
        (typeof fallback === 'boolean' && typeof parsed === 'boolean') ||
        (typeof fallback === 'number' && typeof parsed === 'number') ||
        arrOk || objOk;
      if (ok) val = parsed as T;
      // 类型不匹配 → 保持 fallback，静默修复损坏数据
    }
  } catch {}
  const a = atom<T>(val);
  a.listen((v) => schedulePersist(key, v));
  return a;
}

export const fontSize = storedAtom('iceberg-font-size', 'md');
export const floatMode = storedAtom('iceberg-float-mode', 'static');
export const detailMode = storedAtom('iceberg-detail-mode', 'modal');
export const filterMode = storedAtom('iceberg-filter-mode', 'hide');
export const immersiveMode = storedAtom('iceberg-immersive-mode', true);
export const showRandomBtn = storedAtom('iceberg-show-random-btn', true);
export const sortMode = storedAtom('iceberg-sort-mode', 'default');
export const bgMode = storedAtom('iceberg-bg-mode', 'liquid'); // 'liquid'(标准/液态) | 'static'(冰山) | 'black'(纯黑)（legacy 'dynamic' 在设置面板打开时归一为 liquid）
export const favorites = storedAtom('iceberg-favorites', [] as string[]);
export const readItems = storedAtom('iceberg-read-items', [] as string[]);
export const showReadMark = storedAtom('iceberg-show-read-mark', true);
export const showNewMark = storedAtom('iceberg-show-new-mark', true);
/** 实验功能：非冰山图模式 —— 无层级，全部词条随机散落 */
export const scatterMode = storedAtom('iceberg-scatter-mode', false);

export function applySimpleMode() {
  detailMode.set('tooltip'); filterMode.set('dim'); immersiveMode.set(false);
  bgMode.set('black'); showReadMark.set(false); showNewMark.set(false); showRandomBtn.set(false); floatMode.set('none');
}
export function applyStandardMode() {
  detailMode.set('modal'); filterMode.set('hide'); immersiveMode.set(true);
  showRandomBtn.set(true); showReadMark.set(true); showNewMark.set(true); bgMode.set('liquid'); floatMode.set('static');
}

