// 转载模板（CC BY-SA 4.0 署名要求落地）：
// 名单：meta.json 的 contributors（管线与 introText 同源解析，数据更新自动同步），
// 本模块只引用轻量 meta.json，禁止引用 iceberg.json（见 CLAUDE.md 分层导入）。
import meta from '../data/meta.json'

export const REPRINT_SITE = '中文兔子洞冰山图'
export const REPRINT_URL = 'https://iceberg-reforged.pages.dev'
export const REPRINT_LICENSE = 'CC BY-SA 4.0'

// 与 scripts/build_data_api.py 第 3 步同正则：兼容「参与创作者：」与「参与创作者（按首字母排序）：」
const CONTRIBUTOR_MARKER = /参与创作者(?:（[^）]*）)?：/

export function parseContributors(introText: string): string[] {
  const m = introText.match(CONTRIBUTOR_MARKER)
  if (!m || m.index == null) return []
  let tail = introText.slice(m.index + m[0].length)
  if (tail.includes('。')) tail = tail.split('。')[0]
  return tail
    .split('、')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function getContributors(): string[] {
  const c: unknown = (meta as { contributors?: unknown }).contributors
  if (!Array.isArray(c)) return []
  return c.filter((n): n is string => typeof n === 'string' && n.length > 0)
}

export function buildReprintText(title: string, url: string): string {
  // 四行：站名/原文/链接/授权。来源站 URL 与协作者名单不在复制文本里：
  // 名单另起独立段展示（文字或截图，二者必居其一，见 CopyrightModal）。
  return [
    `【转载自「${REPRINT_SITE}」】`,
    `原文：${title}`,
    `链接：${url}`,
    `授权：${REPRINT_LICENSE}（署名—相同方式共享）`,
  ].join('\n')
}
