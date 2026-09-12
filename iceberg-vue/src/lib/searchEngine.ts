// 外部搜索：词条弹窗标题旁的搜索按钮 + 设置里的默认搜索引擎。
// 纯函数，与存储/视图解耦（settingsStore 只存字符串，拼接规则收敛在这里）。
export type SearchEngine = 'baidu' | 'google' | 'bing';

export const SEARCH_ENGINES: readonly SearchEngine[] = ['baidu', 'google', 'bing'];

/** 归一化存量值：未知字符串回退百度（防旧数据/手改 localStorage 污染） */
export function normalizeSearchEngine(v: unknown): SearchEngine {
  return v === 'google' || v === 'bing' ? v : 'baidu';
}

/** 按引擎拼站外搜索 URL（query 统一 trim + encodeURIComponent，CJK/空格安全） */
export function buildSearchUrl(engine: SearchEngine, query: string): string {
  const q = encodeURIComponent(query.trim());
  switch (engine) {
    case 'google':
      return `https://www.google.com/search?q=${q}`;
    case 'bing':
      return `https://www.bing.com/search?q=${q}`;
    case 'baidu':
    default:
      return `https://www.baidu.com/s?wd=${q}`;
  }
}
