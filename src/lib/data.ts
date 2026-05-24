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

// 中文排版规范化
function replaceQuotes(s: string): string {
  if (!s) return s;

  // 引号 → 直角引号「」『』
  s = s.replace(/"([^"]*)"/g, '「$1」');
  s = s.replace(/“([^”]*)”/g, '「$1」');
  s = s.replace(/'([^']*)'/g, '『$1』');
  s = s.replace(/‘([^’]*)’/g, '『$1』');

  // 书名号 << >> → 《》
  s = s.replace(/<<\s*(.+?)\s*>>/g, '《$1》');
  s = s.replace(/<([^>]*?)>/g, '〈$1〉');

  // 破折号/连字符 → —
  s = s.replace(/[‐‑‒–—―]/g, '—');
  s = s.replace(/--+/g, '—');

  // 省略号 → ……
  s = s.replace(/\.{3,}|…\.{0,}/g, '……');

  // 间隔号统一
  s = s.replace(/[·・]/g, '·');

  // 波浪号 → ～
  s = s.replace(/[~˜]/g, '～');

  // 中文后英文标点 → 中文标点
  const CJK = /([^\x00-\x7f])/g;
  s = s.replace(CJK, '$1'); // no-op, used for following replacements
  s = s.replace(/(\p{Script=Han}),/gu, '$1，');
  s = s.replace(/(\p{Script=Han})\./gu, '$1。');
  s = s.replace(/(\p{Script=Han})!/gu, '$1！');
  s = s.replace(/(\p{Script=Han})\?/gu, '$1？');
  s = s.replace(/(\p{Script=Han});/gu, '$1；');
  s = s.replace(/(\p{Script=Han}):/gu, '$1：');

  // 半角括号含中文 → 全角
  s = s.replace(/\(([^)]*[一-鿿][^)]*)\)/g, '（$1）');

  // 中文间多余空格去除
  s = s.replace(/(\p{Script=Han})\s+(\p{Script=Han})/gu, '$1$2');

  return s;
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
    normalizedTiers[tierName] = (items as any[]).map((item: any) => {
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
    tiers: normalizedTiers,
  };
}
