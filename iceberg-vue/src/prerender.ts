/**
 * 构建期预渲染脚本（vite-prerender-plugin 的 renderToString 模式）。
 *
 * 在 Node 中运行：为每个路由生成静态内容快照，注入产物 HTML 的 #app ——
 * 爬虫/无 JS 用户可以直接看到真实内容，Vue 启动后接管为交互式 SPA。
 * 不引入 Puppeteer/浏览器依赖，数据全部来自构建期静态导入。
 */
import raw from './data/iceberg.json'
import handbookRaw from './data/handbook.md?raw'
import onThisDayRaw from './data/on-this-day.csv?raw'
import { parseCSV } from './lib/csv'

interface IcebergItem {
  id: string
  title: string
  category: string
  tags?: string[]
  desc?: string
  link?: string
}
interface IcebergData {
  introText?: string
  tierOrder: string[]
  tiers: Record<string, IcebergItem[]>
  categoryColors?: Record<string, string>
  tagMap?: Record<string, string>
}

const data = raw as IcebergData
const base = import.meta.env.BASE_URL
const SITE = '中文兔子洞冰山图'
const ORIGIN = 'https://RookieInvestigator.github.io/iceberg_reforged'

const featureModules = import.meta.glob('./data/features/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function headFor(path: string, title: string) {
  const canonical = ORIGIN + (path === '/' ? '/' : path)
  return {
    lang: 'zh-CN',
    title,
    elements: new Set([
      { type: 'link', props: { rel: 'canonical', href: canonical } },
      { type: 'meta', props: { property: 'og:url', content: canonical } },
    ]),
  }
}

function nav(): string {
  return `<nav class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
    <a href="${base}" class="text-sky-300 hover:text-sky-200">冰山图</a>
    <a href="${base}home" class="text-sky-300 hover:text-sky-200">首页</a>
    <a href="${base}handbook" class="text-sky-300 hover:text-sky-200">术语表</a>
    <a href="${base}features" class="text-sky-300 hover:text-sky-200">专题</a>
    <a href="${base}on-this-day" class="text-sky-300 hover:text-sky-200">历史上的今天</a>
  </nav>`
}

function parseFrontmatter(src: string): Record<string, string> {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i <= 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    if (k) out[k] = v
  }
  return out
}

function stripFrontmatter(src: string): string {
  return src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').replace(/\[item:[^\]]+\]/g, '').trim()
}

function homeHtml(): string {
  const total = Object.values(data.tiers).reduce((n, t) => n + (t?.length || 0), 0)
  const sections = (data.tierOrder || [])
    .map((tierName) => {
      const items = data.tiers[tierName] || []
      const links = items
        .slice(0, 8)
        .map((it) => `<a href="#${esc(it.id)}" class="text-gray-300 hover:text-white">${esc(it.title)}</a>`)
        .join('<span class="text-gray-600"> · </span>')
      return `<section class="py-4 border-t border-white/5">
        <h2 class="text-sm font-bold tracking-[0.2em] text-gray-100">${esc(tierName)} <span class="font-normal text-gray-500">${items.length} 条</span></h2>
        <p class="mt-2 text-xs leading-7 text-gray-400">${links}${items.length > 8 ? '<span class="text-gray-600"> 等</span>' : ''}</p>
      </section>`
    })
    .join('')

  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">${SITE}</h1>
    <p class="mt-4 text-sm leading-7 text-gray-400 whitespace-pre-wrap">${esc(data.introText || '')}</p>
    <p class="mt-3 text-xs text-gray-500">${total} 词条 · ${data.tierOrder.length} 层级 · ${Object.keys(data.categoryColors || {}).length} 分类</p>
    ${nav()}
    ${sections}
  </div>`
}

function homeNavHtml(): string {
  const total = Object.values(data.tiers).reduce((n, t) => n + (t?.length || 0), 0)
  const cards = [
    ['古籍', `${base}ancient-book`, '线装书阅读'],
    ['3D 冰山', `${base}3d`, '全新体验'],
    ['历史上的今天', `${base}on-this-day`, '每天一段档案'],
  ]
    .map(
      ([t, href, d]) =>
        `<a href="${href}" class="block rounded-lg border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06]"><span class="text-base font-bold">${t}</span><span class="mt-1 block text-xs text-gray-400">${d}</span></a>`,
    )
    .join('')
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">${SITE}</h1>
    <p class="mt-3 text-sm text-gray-400">社区共建 · ${total} 词条 · ${data.tierOrder.length} 层级</p>
    <div class="mt-8 grid gap-4 sm:grid-cols-3">${cards}</div>
    ${nav()}
  </div>`
}

function handbookSections(): Array<{ title: string; entries: { name: string; desc: string }[] }> {
  const out: Array<{ title: string; entries: { name: string; desc: string }[] }> = []
  const parts = handbookRaw.split(/\r?\n## /)
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const entries: { name: string; desc: string }[] = []
    for (const block of body.split(/\r?\n### /)) {
      const sn = block.indexOf('\n')
      if (sn === -1) continue
      const name = block.slice(0, sn).trim()
      const rest = block.slice(sn + 1)
      const end = rest.search(/\n(?:### |## )/)
      const desc = end === -1 ? rest.trim() : rest.slice(0, end).trim()
      if (name && desc) entries.push({ name, desc })
    }
    out.push({ title, entries })
  }
  return out
}

function handbookHtml(): string {
  const sections = handbookSections()
  const first = sections[0]
  // 分类 / 标签的条目数与动态页面保持一致：以当前数据集为准，md 只补描述
  const categoryCount = Object.keys(data.categoryColors || {}).length
  const tagCount = Object.keys(data.tagMap || {}).length
  const firstMdByName = new Map((first?.entries || []).map((e) => [e.name, e.desc]))
  const firstEntries = first?.title === '划定标准'
    ? [...Object.keys(data.categoryColors || {}).map((name) => ({ name, desc: firstMdByName.get(name) || '待补充' })),
       ...Object.keys(data.tagMap || {}).map((name) => ({ name, desc: firstMdByName.get(name) || '待补充' }))]
    : first?.entries || []
  const cards = firstEntries
    .map((e) => `<article class="rounded-lg border border-white/10 bg-white/[0.03] p-5"><h2 class="text-base font-bold">${esc(e.name)}</h2><p class="mt-2 text-xs leading-6 text-gray-400" style="white-space:pre-line">${esc(e.desc)}</p></article>`)
    .join('')
  const tabs = sections
    .map((s, i) => {
      const count = s.title === '划定标准' ? categoryCount + tagCount : s.entries.length
      return `<span class="rounded-full px-3 py-1 text-xs ${i === 0 ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-500'}">${esc(s.title)} · ${count}</span>`
    })
    .join('')
  return `<div class="max-w-4xl mx-auto px-6 py-10 text-white">
    <a href="${base}home" class="text-sm text-sky-300 hover:text-sky-200">← 返回首页</a>
    <h1 class="mt-4 text-2xl font-black tracking-wider">术语表</h1>
    <p class="mt-3 text-sm leading-7 text-gray-400">冰山图所用的划定标准、各类概念与人物作品索引。解释由社区手工整理，随数据同步更新。</p>
    <div class="mt-6 flex flex-wrap gap-2">${tabs}</div>
    <div class="mt-8 grid gap-4 sm:grid-cols-2">${cards || '<p class="text-sm text-gray-500">这个板块还没有内容，待后续补充。</p>'}</div>
    ${nav()}
  </div>`
}

function featureEntries(): Array<{ slug: string; fm: Record<string, string> }> {
  return Object.entries(featureModules)
    .map(([path, src]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '')
      return { slug, fm: parseFrontmatter(src) }
    })
    .sort((a, b) => (b.fm.date || '').localeCompare(a.fm.date || ''))
}

function featuresHtml(): string {
  const cards = featureEntries()
    .map(
      (f) => `<a href="${base}features/${esc(f.slug)}" class="block rounded-lg border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06]">
        <time class="text-xs text-gray-500">${esc(f.fm.date || '')}</time>
        <h2 class="mt-1 text-base font-bold">${esc(f.fm.title || f.slug)}</h2>
        <p class="mt-2 text-xs leading-6 text-gray-400">${esc(f.fm.description || '')}</p>
      </a>`,
    )
    .join('')
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">专题</h1>
    <p class="mt-3 text-sm text-gray-400">编辑精选，串联词条，深入探索中文互联网怪谈的隐秘脉络。</p>
    <div class="mt-8 grid gap-4">${cards || '<p class="text-sm text-gray-500">暂无专题文章。</p>'}</div>
    ${nav()}
  </div>`
}

function featureDetailHtml(slug: string): string {
  const entry = featureEntries().find((f) => f.slug === slug)
  const fm = entry?.fm || {}
  const src = featureModules[Object.keys(featureModules).find((p) => p.endsWith(`/${slug}.md`)) || '']
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <p><a href="${base}features" class="text-xs text-sky-300">← 专题列表</a></p>
    <time class="mt-6 block text-xs text-gray-500">${esc(fm.date || '')}</time>
    <h1 class="mt-1 text-2xl font-black tracking-wider">${esc(fm.title || slug)}</h1>
    <p class="mt-3 text-sm text-gray-400">${esc(fm.description || '')}</p>
    <div class="mt-8 text-sm leading-7 text-gray-300 whitespace-pre-wrap">${esc(src ? stripFrontmatter(src) : '')}</div>
    ${nav()}
  </div>`
}

function onThisDayHtml(): string {
  const mmdd = `${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  const rows = parseCSV(onThisDayRaw).filter((r) => r.date === mmdd)
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const y = r.year || '未知'
    if (!groups.has(y)) groups.set(y, [])
    groups.get(y)!.push(r)
  }
  const body = [...groups.entries()]
    .sort((a, b) => (b[0] === '未知' ? -1 : a[0] === '未知' ? 1 : Number(b[0]) - Number(a[0])))
    .map(
      ([year, list]) => `<section class="py-4 border-t border-white/5">
        <h2 class="text-sm font-bold text-gray-100">${esc(year)}</h2>
        ${list
          .map(
            (r) => `<article class="mt-2">
              <h3 class="text-sm text-gray-200">${esc(r.title || '')}</h3>
              <p class="mt-1 text-xs leading-6 text-gray-400">${esc(r.desc || '')}</p>
            </article>`,
          )
          .join('')}
      </section>`,
    )
    .join('')
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">历史上的今天 · ${mmdd}</h1>
    <div class="mt-6">${body || '<p class="text-sm text-gray-500">这一天暂无记录。</p>'}</div>
    ${nav()}
  </div>`
}

export async function prerender({ url }: { url: string }) {
  const baseLinks = new Set(['/home', '/handbook', '/features', '/on-this-day'])

  if (url === '/') {
    return { html: homeHtml(), links: baseLinks, head: headFor('/', SITE) }
  }
  if (url === '/home') {
    return { html: homeNavHtml(), links: baseLinks, head: headFor('/home', `首页 · ${SITE}`) }
  }
  if (url === '/handbook') {
    return { html: handbookHtml(), links: baseLinks, head: headFor('/handbook', `术语表 · ${SITE}`) }
  }
  if (url === '/features') {
    const links = new Set([...baseLinks, ...featureEntries().map((f) => `/features/${f.slug}`)])
    return { html: featuresHtml(), links, head: headFor('/features', `专题 · ${SITE}`) }
  }
  if (url.startsWith('/features/')) {
    const slug = url.slice('/features/'.length)
    return { html: featureDetailHtml(slug), links: baseLinks, head: headFor(url, `${featureEntries().find((f) => f.slug === slug)?.fm.title || '专题'} · ${SITE}`) }
  }
  if (url === '/on-this-day') {
    return { html: onThisDayHtml(), links: baseLinks, head: headFor('/on-this-day', `历史上的今天 · ${SITE}`) }
  }

  return { html: homeHtml(), links: baseLinks, head: headFor('/', SITE) }
}
