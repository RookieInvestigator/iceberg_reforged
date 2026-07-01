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

// 归一化：解析颜色、emoji 标签
export function normalizeData(raw: any): IcebergData {
  const { categoryColors, tagMap, tiers, introText, defaultColor } = raw;

  const nameToEmoji: Record<string, string> = {};
  for (const [emoji, name] of Object.entries(tagMap)) {
    nameToEmoji[name as string] = emoji;
  }

  const normalizedTiers: Record<string, IcebergItem[]> = {};
  for (const [tierName, items] of Object.entries(tiers)) {
    normalizedTiers[tierNameZh(tierName)] = (items as any[]).map((item: any) => {
      const categoryColor = categoryColors[item.category] || defaultColor || '#FFFFFF';
      const emojis = (item.tags || []).map((tagName: string) => nameToEmoji[tagName] || tagName).filter(Boolean);

      return {
        ...item,
        title: replaceQuotes(item.title),
        desc: item.desc ? replaceQuotes(item.desc) : item.desc,
        categoryColor,
        emojis,
      };
    });
  }

  return {
    ...raw,
    introText: introText ? replaceQuotes(introText) : introText,
    tierOrder: (raw.tierOrder || []).map(tierNameZh),
    tiers: normalizedTiers,
  };
}
