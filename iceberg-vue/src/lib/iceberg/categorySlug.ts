/**
 * 分类 ↔ URL slug 的唯一映射。
 *
 * 为什么手写表而不用拼音/编码转换：分类名带全角「・」，直接塞进 URL 会变成
 * 一长串 %E9%83%BD 之类的百分号编码，既是糟糕的对外地址，也让目录名难读。
 * 15 个分类是人订的、变动极少，手写一份英文 slug 比自动转换可靠。
 *
 * 新增分类时**必须**在这里补一行：`categorySlug.test.ts` 会拿 meta.json 的
 * categoryColors 逐条比对，漏了就报错（而不是悄悄回退到 c-xxxx 这种难读地址）。
 * 回退分支只兜底「数据里出现了表里没有的分类」这种临时状态，保证页面不 404。
 */

/** 分类名 → slug（slug 必须全局唯一，小写字母/数字/连字符） */
export const CATEGORY_SLUGS: Record<string, string> = {
  '都市传说・超自然事件・超常经历': 'urban-legend',
  '鬼宅・异常地点': 'haunted-place',
  '真实犯罪・事故': 'true-crime',
  '未确认生物': 'cryptid',
  '民俗・信仰・方术': 'folklore',
  '边缘科学・伪科学': 'fringe-science',
  '网络怪谈・奇闻': 'internet-oddity',
  '骗局・营销・谣言': 'hoax',
  '神话・志怪・传奇': 'mythology',
  '预言・谶纬': 'prophecy',
  '历史疑案・假说': 'historical-mystery',
  '心理・社会现象': 'psycho-social',
  '神秘内容・物件・现象': 'mystic-object',
  '阴谋论・边缘理论': 'conspiracy',
  '艺术・创作物': 'art-creation',
}

const SLUG_TO_NAME = new Map(Object.entries(CATEGORY_SLUGS).map(([name, slug]) => [slug, name]))

/** FNV-1a（32 位）：回退 slug 用，纯确定性，不需要密码学强度 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** 分类名 → slug（表里没有时回退为 c-<hash>，页面仍可访问且地址稳定） */
export function categorySlug(name: string): string {
  return CATEGORY_SLUGS[name] || `c-${fnv1a(name)}`
}

/** slug → 分类名（未知名返回 null，调用方自行 404） */
export function categoryFromSlug(slug: string): string | null {
  return SLUG_TO_NAME.get(slug) || null
}
