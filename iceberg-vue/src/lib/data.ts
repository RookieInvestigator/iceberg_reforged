// 数据加载与归一化
export interface IcebergItem {
  id: string;
  title: string;
  category: string;
  tags: string[];
  desc: string;
  link: string;
  modifiedAt: number;
  related: string[];
  categoryColor: string;
  emojis: string[];
}

export interface IcebergData {
  generatedAt: number;
  tierOrder: string[];
  tiers: Record<string, IcebergItem[]>;
  categoryColors: Record<string, string>;
  tagMap: Record<string, string>;
  introText: string;
  defaultColor: string;
  /** F30：旧 ID → 新 ID 重定向表（标题/层级修订后旧链接仍可解析） */
  idAliases?: Record<string, string>;
}

/**
 * 轻量元数据（meta.json，约 3.5KB）—— 由 build_data_api.py 与 iceberg.json 同批产出。
 *
 * 只需统计口径的视图（首页 / 术语表）导入它即可，不要导入 iceberg.json：
 * 后者会被打包成 ~800KB 的 chunk 并进入首屏关键路径，而这几个视图实际只用到
 * 词条总数、层级数、分类色、标签表这几个字段。
 */
export interface IcebergMeta {
  generatedAt: number;
  tierOrder: string[];
  categoryColors: Record<string, string>;
  tagMap: Record<string, string>;
  /** 层级名 → 该层词条数（与 tierOrder 同序） */
  tierCounts: Record<string, number>;
  total: number;
}

// 中文排版规范化（合并正则减少扫描遍数）
const DASH_RE = /[‐‑‒–—―]|--+/g;
const ELLIPSIS_RE = /\.{3,}|…\.{0,}/g;
const SIMPLE_MAP: Record<string, string> = { '·': '·', '・': '·', '~': '～', '˜': '～' };
const SIMPLE_RE = /[·・~˜]/g;
// 合并：中文后跟英文标点 → 中文标点
const CN_PUNCT: Record<string, string> = { ',': '，', '.': '。', '!': '！', '?': '？', ';': '；', ':': '：' };
const CN_PUNCT_RE = /(\p{Script=Han})([,\.!\?;:])/gu;

function replaceQuotes(s: string): string {
  if (!s) return s;

  // 引号 → 直角引号「」『』（匹配 ASCII 直引号 + Unicode 弯引号）
  s = s.replace(/["“”]([^"“”]*)["“”]/g, '「$1」');
  s = s.replace(/['‘’]([^'‘’]*)['‘’]/g, '『$1』');

  // 书名号
  s = s.replace(/<<\s*(.+?)\s*>>/g, '《$1》');
  s = s.replace(/<([^>]*?)>/g, '〈$1〉');

  // 破折号/连字符 → —
  s = s.replace(DASH_RE, '—');

  // 省略号 → ……
  s = s.replace(ELLIPSIS_RE, '……');

  // 间隔号/波浪号统一（单次扫描）
  s = s.replace(SIMPLE_RE, m => SIMPLE_MAP[m]);

  // 中文后英文标点 → 中文标点（单次扫描替代 6 次）
  s = s.replace(CN_PUNCT_RE, (_, han, punct) => han + (CN_PUNCT[punct] || punct));

  // 半角括号含中文 → 全角
  s = s.replace(/\(([^)]*[一-鿿][^)]*)\)/g, '（$1）');

  // 中文间多余空格去除
  s = s.replace(/(\p{Script=Han})\s+(\p{Script=Han})/gu, '$1$2');

  // 间隔号 · 前后加空格（放最后，避免被中文去空格步骤删除）
  s = s.replace(/(\S)·(\S)/g, '$1 · $2');

  return s;
}

// Tier 名称中文化
function tierNameZh(tier: string): string {
  const m = tier.match(/^Tier\s*(\d+)$/i);
  if (!m) return tier;
  return `层级 ${m[1]}`;
}

/** F34：渲染端 URL 校验 —— 非 http(s) 的链接（站内相对路径/危险协议）一律拒绝 */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 秒级 Unix 时间戳 → 本地日期字符串。
 *
 * 管线输出的 `generatedAt` / `createdAt` / `modifiedAt` 均为秒（见 build_data_api.py），
 * 此前各视图手写 `new Date(x * 1000)`，毫秒/秒极易混淆，收敛为唯一入口。
 */
export function formatUnixDate(sec: number | undefined | null): string {
  if (!sec) return ''
  return new Date(sec * 1000).toLocaleDateString('zh-CN')
}

// 归一化：解析颜色、emoji 标签
// perf：同一静态 JSON 在多个路由入口（IndexView/3D/副表等）重复 normalize —— 模块级 WeakMap 缓存
const normalizeCache = new WeakMap<object, IcebergData>()
export function normalizeData(raw: any): IcebergData {
  const hit = normalizeCache.get(raw)
  if (hit) return hit
  const { categoryColors, tagMap, tiers, introText, defaultColor } = raw;

  const nameToEmoji: Record<string, string> = {};
  for (const [emoji, name] of Object.entries(tagMap)) {
    nameToEmoji[name as string] = emoji;
  }

  const normalizedTiers: Record<string, IcebergItem[]> = {};
  for (const [tierName, items] of Object.entries(tiers)) {
    normalizedTiers[tierNameZh(tierName)] = (items as any[]).map((item: any) => {
      const categoryColor = categoryColors[item.category] || defaultColor || '#FFFFFF';
      // emoji 映射：tag 有 emoji → 用 emoji；缺失（如「母题」上游被删）→ 回退显示 tag 名文字
      const emojis = (item.tags || []).map((tagName: string) => nameToEmoji[tagName] || tagName).filter(Boolean);

      return {
        ...item,
        title: replaceQuotes(item.title),
        desc: item.desc ? replaceQuotes(item.desc) : item.desc,
        link: item.link && isSafeHttpUrl(item.link) ? item.link : '', // F34：渲染端再次校验
        categoryColor,
        emojis,
      };
    });
  }

  const result: IcebergData = {
    ...raw,
    introText: introText ? replaceQuotes(introText) : introText,
    tierOrder: (raw.tierOrder || []).map(tierNameZh),
    tiers: normalizedTiers,
  };
  normalizeCache.set(raw, result)
  return result;
}
