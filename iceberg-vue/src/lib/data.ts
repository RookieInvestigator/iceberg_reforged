// 数据加载与归一化
export interface IcebergItem {
  id: string;
  title: string;
  category: string;
  /** 多分类副表挂载：主分类 + 副分类（去重，主分类打头）；无副表时数据源回退为 [category] */
  categories?: string[];
  /** 多分类墙渐变：OKLCH 预插色标逗号列表（仅多分类词条由数据源预计算挂载） */
  gradStops?: string;
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
  /** 参与创作者名单（与 introText 同源，转载模板完整展示用） */
  contributors?: string[];
}

// 中文排版规范化（合并正则减少扫描遍数）
const DASH_RE = /[‐‑‒–—―]|--+/g;
// 省略号：clreq §5.4.1 规定中文省略号为「六个点 / 两个汉字宽」，即两个 U+2026（……）。
// 原式 /\.{3,}|…\.{0,}/g 中 `\.{0,}` 可匹配空串，会把已成型的 `……` 逐字替换成
// `…………`（十二点）——实测 `他说……然后` → `他说…………然后`。改为把任意个连续 `…`
// 或 3 个以上 ASCII 点统一收敛为一次 `……`。
const ELLIPSIS_RE = /\.{3,}|…+/g;
const SIMPLE_MAP: Record<string, string> = { '·': '·', '・': '·', '~': '～', '˜': '～' };
const SIMPLE_RE = /[·・~˜]/g;
// 合并：中文后跟英文标点 → 中文标点
const CN_PUNCT: Record<string, string> = { ',': '，', '.': '。', '!': '！', '?': '？', ';': '；', ':': '：' };
const CN_PUNCT_RE = /(\p{Script=Han})([,\.!\?;:])/gu;

/**
 * 引号风格（clreq §2.1.2 的地区差异；实验开关，见 settingsStore.quoteStyle）：
 * - `corner`：直角引号「」『』（港台横排惯例，本站原有视觉）
 * - `curly`：弯引号 “”‘’（大陆 GB/T 15834—2011 横排写法）
 * 只影响渲染文本，不动源数据。
 */
export type QuoteStyle = 'corner' | 'curly'

const QUOTE_PAIRS: Record<QuoteStyle, { double: [string, string]; single: [string, string] }> = {
  corner: { double: ['「', '」'], single: ['『', '』'] },
  curly: { double: ['“', '”'], single: ['‘', '’'] },
}

/**
 * 引号统一：把 ASCII 直引号 / 弯引号 / 直角引号统一收成目标风格。
 *
 * 为什么用状态机而不是正则：数据里的引号**不成对**（奇数个、嵌套、被反斜杠转义），
 * 正则 `["“”]([^"“”]*)["“”]` 要求成对且内容不含引号，遇到
 * `如\"马车故事\"` 或 `“说给树洞”…“另一处` 就会漏配/错配，
 * 结果正文里残留半角引号（实测 292 条词条受影响）。
 *
 * 关键：ASCII `"` 与 `'` **既是开也是关**，必须按「切换」处理；
 * 弯引号 `“”` 与直角引号 `「」` 有方向，按方向处理。
 */
function unifyQuotes(
  s: string,
  open: string,
  close: string,
  ambiguous: string,
  openers: string,
  closers: string,
): string {
  let out = ''
  let inside = false
  for (const ch of s) {
    if (ambiguous.includes(ch)) {
      // ASCII 直引号：切换开/关
      out += inside ? close : open
      inside = !inside
      continue
    }
    if (openers.includes(ch)) {
      // 已在引号内又遇到开引号 → 前一个引号落单，先补关引号再开新的
      if (inside) out += close
      out += open
      inside = true
      continue
    }
    if (closers.includes(ch)) {
      // 不在引号内却遇到关引号 → 落单，按开引号处理
      out += inside ? close : open
      inside = !inside
      continue
    }
    out += ch
  }
  // 结尾仍在引号内：补一个关引号，避免整段被吞
  if (inside) out += close
  return out
}

function replaceQuotes(s: string, style: QuoteStyle = 'corner'): string {
  if (!s) return s;
  const pair = QUOTE_PAIRS[style]

  // 先去掉 JSON 转义残留的反斜杠（`\"` → `"`），否则引号识别不到
  s = s.replace(/\\(["'“”‘’「」『』])/g, '$1')

  // 双引号：ASCII " 切换；弯 “” / 直角 「」 按方向
  s = unifyQuotes(s, pair.double[0], pair.double[1], '"', '“「', '”」')
  // 单引号：ASCII ' 切换；弯 ‘’ / 直角 『』 按方向
  s = unifyQuotes(s, pair.single[0], pair.single[1], "'", '‘『', '’』')

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

  // clreq §6.3.1「密排」：汉字与标点外框彼此紧贴，字间不留空白。
  // 旧实现在这里给间隔号两侧插入了西文空格（`鲁迅·朝花夕拾` → `鲁迅 · 朝花夕拾`），
  // 与密排原则相悖，且会与 text-autospace 的自动间距叠加成双倍空隙，故撤销。
  // 同时把上游数据里已有的 ` · ` 空格收掉（SIMPLE_MAP 已把间隔号统一为 U+00B7）。
  s = s.replace(/\s*·\s*/g, '·');
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
 * 管线输出的 `generatedAt` / `createdAt` / `modifiedAt` 均为秒（见 build_data_api.py）：
 * 这是唯一入口，各视图不要手写 `new Date(x * 1000)`（毫秒/秒极易混淆）。
 * 语言默认跟随页面 `lang`（i18n 切换时同步写入），保证构建日期与界面语言一致。
 */
export function formatUnixDate(sec: number | undefined | null, locale?: string): string {
  if (!sec) return ''
  const loc = locale || (typeof document !== 'undefined' ? document.documentElement.lang || 'zh-CN' : 'zh-CN')
  return new Date(sec * 1000).toLocaleDateString(loc)
}

// 归一化：解析颜色、emoji 标签
// perf：同一静态 JSON 在多个路由入口（IndexView/3D/副表等）重复 normalize —— 模块级 WeakMap 缓存。
// 缓存按 (raw, 引号风格) 分键：切换引号风格要拿到新对象，否则主站会继续显示旧风格。
const normalizeCache = new WeakMap<object, Map<QuoteStyle, IcebergData>>()
export function normalizeData(raw: any, quoteStyle: QuoteStyle = 'corner'): IcebergData {
  const byStyle = normalizeCache.get(raw)
  const hit = byStyle?.get(quoteStyle)
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
        title: replaceQuotes(item.title, quoteStyle),
        desc: item.desc ? replaceQuotes(item.desc, quoteStyle) : item.desc,
        link: item.link && isSafeHttpUrl(item.link) ? item.link : '', // F34：渲染端再次校验
        categoryColor,
        emojis,
      };
    });
  }

  const result: IcebergData = {
    ...raw,
    introText: introText ? replaceQuotes(introText, quoteStyle) : introText,
    tierOrder: (raw.tierOrder || []).map(tierNameZh),
    tiers: normalizedTiers,
  };
  if (!byStyle) normalizeCache.set(raw, new Map([[quoteStyle, result]]))
  else byStyle.set(quoteStyle, result)
  return result;
}
