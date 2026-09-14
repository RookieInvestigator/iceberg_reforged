/**
 * tierDisplay —— 层级名展示文案（导航指示器 / 下拉列表用）。
 * 数据层 tierOrder 是 `层级 N`（见 lib/data.ts tierNameZh），展示层改序数词：
 * `层级 3` → `第三层`；顶部（第一层上方）显示 `共八层`。
 * 非标准名原样返回，不抛错。
 */
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1–99 转中文小写数字（超出回退阿拉伯数字字符串） */
export function cnNum(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n < 10) return DIGITS[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  const tenPart = ten === 1 ? '十' : `${DIGITS[ten]}十`;
  return one === 0 ? tenPart : `${tenPart}${DIGITS[one]}`;
}

/** `层级 N` → `第N层`（中文数字）；解析失败原样返回 */
export function tierDisplayName(name: string): string {
  const m = /^层级\s*(\d+)$/.exec((name || '').trim());
  if (!m) return name;
  return `第${cnNum(parseInt(m[1], 10))}层`;
}

/** `共N层`（顶部总数指示） */
export function totalTiersText(total: number): string {
  return `共${cnNum(total)}层`;
}
