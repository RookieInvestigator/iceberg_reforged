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
import { canonicalUrl, SITE_ORIGIN } from './lib/site'
import { normalizeData } from './lib/data'
import { loadAppendix } from './lib/iceberg/appendix'
import { applyOverrides } from './lib/iceberg/overrides'
import { applyCategories, itemCategories } from './lib/iceberg/extraCategories'
import { categorySlug } from './lib/iceberg/categorySlug'
import { toPlainText } from './lib/richText'

interface IcebergItem {
  id: string
  title: string
  category: string
  categories?: string[]
  tags?: string[]
  desc?: string
  link?: string
  emojis?: string[]
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
// canonical / og:url 一律指向 site.config.json 里的域名（无论从哪个部署访问）。

/**
 * 与浏览器端**同一条装配链**：normalizeData → 副表解析 → 标量订正 → 分类装配。
 *
 * 分类聚合页要直出「被副表订正过的」标题和正文：只读原始 iceberg.json 会漏掉
 * `overrides.csv` 的覆盖值与 `categories.csv` 的副分类（挂了副分类的词条在原始
 * 数据里只有主分类，用它筛选就会漏词条）。因此这里复刻 `useIcebergDataSource`
 * 的装配顺序，而不是另写一份数据读取 —— 抽两份必然漂移。
 */
const assembledItems: Array<IcebergItem & { tier: string }> = (() => {
  const normalized = normalizeData(raw)
  const appendix = loadAppendix()
  const nameToEmoji: Record<string, string> = {}
  for (const [emoji, name] of Object.entries(normalized.tagMap || {})) nameToEmoji[name] = emoji
  applyOverrides(Object.values(normalized.tiers).flat(), appendix.overrides, { nameToEmoji })
  applyCategories(normalized, appendix.categories)
  const out: Array<IcebergItem & { tier: string }> = []
  for (const [tierName, items] of Object.entries(normalized.tiers)) {
    for (const batch of items || []) out.push({ ...batch, tier: tierName })
  }
  return out
})()

/** 分类名 → 该分类下词条（按 `categories` 判，含副表追加的副分类），按标题排序 */
function itemsOfCategory(category: string) {
  return assembledItems
    .filter((it) => itemCategories(it as never).includes(category))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
}

const CATEGORY_NAMES = Object.keys((data.categoryColors as Record<string, string>) || {})


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

function headFor(path: string, title: string, jsonLd?: unknown) {
  const canonical = canonicalUrl(path)
  const elements: unknown[] = [
    { type: 'link', props: { rel: 'canonical', href: canonical } },
    { type: 'meta', props: { property: 'og:url', content: canonical } },
  ]
  // JSON-LD：走 head.elements 由插件序列化成 <script type="application/ld+json">。
  // 这是静态标记不是可执行脚本，CSP 的 script-src 不拦 ld+json（浏览器不会执行它）。
  if (jsonLd) {
    elements.push({
      type: 'script',
      props: { type: 'application/ld+json' },
      children: JSON.stringify(jsonLd),
    })
  }
  return {
    lang: 'zh-CN',
    title,
    elements: new Set(elements),
  }
}

/** 姊妹站（三站互链）：绝对地址，爬虫从静态壳就能顺着走出去 */
const SISTER_LINKS: Array<[string, string]> = [
  ['https://hezihezi.com', 'hezihezi.com'],
  ['https://blog.hezihezi.com', 'blog.hezihezi.com'],
]

function nav(): string {
  const sisters = SISTER_LINKS.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('')
  return `<nav class="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
    <a href="${base}" class="text-sky-300 hover:text-sky-200">冰山图</a>
    <a href="${base}home/" class="text-sky-300 hover:text-sky-200">首页</a>
    <a href="${base}handbook/" class="text-sky-300 hover:text-sky-200">手册</a>
    <a href="${base}features/" class="text-sky-300 hover:text-sky-200">专题</a>
    <a href="${base}on-this-day/" class="text-sky-300 hover:text-sky-200">历史上的今天</a>
    <a href="${base}ancient-book/" class="text-sky-300 hover:text-sky-200">古籍</a>
    <a href="${base}3d/" class="text-sky-300 hover:text-sky-200">3D 冰山</a>
  </nav>
  <nav class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">${sisters}</nav>`
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
  const total = assembledItems.length
  // 全量标题直出：每层只放前 8 条会让全站 HTML 只覆盖 68/1461（4.7%）词条标题，
  // 首页对内链毫无贡献。12909 字符标题全进 HTML 后，首页才是真正的内链枢纽。
  //
  // ① 一行一条：单行挤 1461 个元素时 deflate 的历史窗口（32KB）会在一条超长行里
  //    不停滚动而错开同位置结构；换行后每行的重复前缀落在窗口内的同一偏移上。
  // ② 这里刻意**不用链接**。词条没有独立 URL（深链是 #id），`href="#id"` 原本指向
  //    本页并不存在的 id，是 1461 个死锚点；补 id 能修好，但同一串十六进制会在一个
  //    词条里出现两次，而随机十六进制几乎压不动 —— 实测 gzip 从 42.2KB 涨到 45.6KB。
  //    这些锚点在客户端接管时会被整块替换掉，本来也不承担导航，故直接输出纯文本。
  //    真正的内链交给上方 15 条分类导航（那是可查可跳的真 URL）。
  const sections = (data.tierOrder || [])
    .map((tierName) => {
      const items = data.tiers[tierName] || []
      // 样式挂在容器上：1461 条标题若各带 class，光是重复的属性就多出 150KB
      const links = items.map((it) => esc(it.title)).join('\n')
      return `<section class="py-4 border-t border-white/5">
        <h2 class="text-sm font-bold tracking-[0.2em] text-gray-100">${esc(tierName)} <span class="font-normal text-gray-500">${items.length} 条</span></h2>
        <p class="mt-2 text-xs leading-7 text-gray-400">
${links}
        </p>
      </section>`
    })
    .join('')

  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">${SITE}</h1>
    <p class="mt-4 text-sm leading-7 text-gray-400 whitespace-pre-wrap">${esc(data.introText || '')}</p>
    <p class="mt-3 text-xs text-gray-500">${total} 词条 · ${data.tierOrder.length} 层级 · ${CATEGORY_NAMES.length} 分类</p>
    ${nav()}
    ${categoryNavHtml()}
    ${sections}
  </div>`
}

/**
 * 静态壳的极简样式表（内联 `<style>`）。
 *
 * 这些页面是给爬虫与无 JS 访客看的第一眼，样式只需可读；把 Tailwind 类名逐个写到
 * 1461 条锚点上会让 HTML 凭空多出一两百 KB（类名重复的字节并不是内容）。
 * `style-src 'unsafe-inline'` 已在 CSP 里放行，内联样式表不受影响。
 */
const SHELL_CSS = `
body{background:#08080a;color:#e8e8ea;font:400 15px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0}
.wrap{max-width:720px;margin:0 auto;padding:40px 24px}
h1{font-size:24px;font-weight:900;letter-spacing:.04em;margin:0 0 4px}
h2{font-size:16px;font-weight:700;margin:0}
a{color:#cfd3d8;text-decoration:none}
a:hover{color:#fff;text-decoration:underline}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin:18px 0;font-size:14px}
nav .n{color:#8a8f96}
.meta{font-size:12px;color:#7a7f86}
.tier{margin-top:22px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
.tier p{margin:6px 0 0;font-size:13px;line-height:1.9;color:#a9aeb5}
.cat{margin-top:26px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
.cat h2{font-size:15px;margin-bottom:2px}
.cat .desc{margin:6px 0 0;font-size:14px;line-height:1.85;color:#b6bbc2;white-space:pre-line}
.cat .tags{margin:2px 0 0;font-size:12px;color:#7a7f86}
.intro{white-space:pre-wrap;color:#a9aeb5;font-size:14px}
`

/** 分类导航：15 条内链，让聚合页从首页一跳可达（爬虫靠内链发现，外链才有分权意义） */
function categoryNavHtml(current?: string): string {
  const links = CATEGORY_NAMES.map((name) => {
    const label = current === name ? `<strong>${esc(name)}</strong>` : esc(name)
    return `  <a href="${base}category/${categorySlug(name)}/">${label}</a> <span class="n">${itemsOfCategory(name).length}</span>`
  }).join('\n')
  return `<nav>
${links}
</nav>`
}

/**
 * 分类聚合页静态壳：该分类下**全部词条**的标题 + 层级 + 标签 + 正文。
 *
 * 这是全站可索引正文的主力（15 页 ≈ 1.4MB，比逐条预渲染省二十多倍体积）。
 * 正文走 toPlainText：静态壳不需要富文本标记，只要可读的纯文本（爬虫与无 JS 用户）。
 * 词条标题链回 `/#<id>`：hash 不是独立 URL，但它能真的打开词条 —— 静态壳只负责
 * 「正文有真实 URL」，不假装每个词条也有。
 */
function categoryHtml(name: string): string {
  const items = itemsOfCategory(name)
  // 标题链回 `/#<id>`：这是站内唯一能定位到单个词条的地址（客户端接管后按 hash 打开详情）。
  // 链接跨文档，所以本页不需要对应的 `id` —— 也就不存在「href 找不到目标」的死锚点。
  const articles = items
    .map((it) => {
      const tags = (it.tags || []).map((tag) => esc(tag)).join(' · ')
      const body = toPlainText(it.desc || '').trim()
      return `<article class="cat">
        <h2><a href="${base}#${esc(it.id)}">${esc(it.title)}</a></h2>
        <p class="tags">${esc(it.tier)}${tags ? ' · ' + tags : ''}</p>
        <p class="desc">${body ? esc(body) : '此词条尚待补充描述'}</p>
      </article>`
    })
    .join('\n')

  return `<style>${SHELL_CSS}</style><div class="wrap">
    <p class="meta"><a href="${base}">← 冰山图</a></p>
    <h1>${esc(name)}</h1>
    <p class="meta">此分类共 ${items.length} 条词条，按标题排序。</p>
    ${categoryNavHtml(name)}
    ${articles || '<p class="meta">这个分类暂无词条。</p>'}
    ${nav()}
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
    .map((e) => `<article class="rounded-lg border border-white/10 bg-white/[0.03] p-5"><h2 class="text-base font-bold">${esc(e.name)}</h2><p class="mt-2 text-xs leading-6 text-gray-400" style="white-space:pre-line">${esc((e.desc || '').replace(/==/g, ''))}</p></article>`)
    .join('')
  const tabs = sections
    .map((s, i) => {
      const count = s.title === '划定标准' ? categoryCount + tagCount : s.entries.length
      return `<span class="rounded-full px-3 py-1 text-xs ${i === 0 ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-500'}">${esc(s.title)} · ${count}</span>`
    })
    .join('')
  return `<div class="max-w-4xl mx-auto px-6 py-10 text-white">
    <a href="${base}home/" class="text-sm text-sky-300 hover:text-sky-200">← 返回首页</a>
    <h1 class="mt-4 text-2xl font-black tracking-wider">手册</h1>
    <p class="mt-3 text-sm leading-7 text-gray-400">冰山图所用的划定标准、各类概念与人物作品索引。解释由社区手工整理，随数据同步更新。</p>
    <div class="mt-6 flex flex-wrap gap-2">${tabs}</div>
    <div class="mt-8 grid gap-4 sm:grid-cols-2">${cards || '<p class="text-sm text-gray-500">这个板块还没有内容，待后续补充。</p>'}</div>
    ${nav()}
  </div>`
}

/**
 * 占位专题不产出可索引页面。
 *
 * `000-placeholder.md` 只是演示专题系统用法的样例（标题写着「示例专题」），
 * 一旦预渲染就成了一个真实 URL：被爬虫抓到 → 收录一个「示例专题 · 待完善」的空壳，
 * 拉低整站质量信号。它以 `000-` 前缀标记，这里统一过滤掉：
 * 不参与列表渲染、不预渲染、不进 sitemap。写真实专题时用正常 slug 即可。
 */
const PLACEHOLDER_SLUG = /^000-/

function featureEntries(): Array<{ slug: string; fm: Record<string, string> }> {
  return Object.entries(featureModules)
    .map(([path, src]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '')
      return { slug, fm: parseFrontmatter(src) }
    })
    .filter((f) => !PLACEHOLDER_SLUG.test(f.slug))
    .sort((a, b) => (b.fm.date || '').localeCompare(a.fm.date || ''))
}

function featuresHtml(): string {
  const cards = featureEntries()
    .map(
      (f) => `<a href="${base}features/${esc(f.slug)}/" class="block rounded-lg border border-white/10 bg-white/[0.03] p-5 hover:bg-white/[0.06]">
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
    <p><a href="${base}features/" class="text-xs text-sky-300">← 专题列表</a></p>
    <time class="mt-6 block text-xs text-gray-500">${esc(fm.date || '')}</time>
    <h1 class="mt-1 text-2xl font-black tracking-wider">${esc(fm.title || slug)}</h1>
    <p class="mt-3 text-sm text-gray-400">${esc(fm.description || '')}</p>
    <div class="mt-8 text-sm leading-7 text-gray-300 whitespace-pre-wrap">${esc(src ? stripFrontmatter(src) : '')}</div>
    ${nav()}
  </div>`
}

/**
 * 静态壳渲染**全年档案**（按 MM-DD 分组的全部记录），而不是「今天」的记录。
 *
 * 静态内容**不得依赖构建期时间**（用构建期 `new Date()` 取 MM-DD 会把「今天」冻结在
 * 构建日，非每日部署即长期错误，且与客户端 hydrate 结果不一致）。渲染全量档案后：
 * 内容永不过期、205 条记录全部可被索引，无 JS 用户也能查阅任意日期。
 * 客户端接管后仍是「日历 + 默认选中今天」的交互，语义不受影响。
 */
function onThisDayHtml(): string {
  const rows = parseCSV(onThisDayRaw)
  // 按 MM-DD 分组，日期升序；同一天内按年份倒序（未知年份排最后）
  const byDate = new Map<string, typeof rows>()
  for (const r of rows) {
    const key = r.date || ''
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(r)
  }
  const body = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mmdd, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.year === b.year) return 0
        if (!a.year) return 1
        if (!b.year) return -1
        return Number(b.year) - Number(a.year)
      })
      return `<section class="py-4 border-t border-white/5">
        <h2 class="text-sm font-bold text-gray-100">${esc(mmdd)}</h2>
        ${sorted
          .map(
            (r) => `<article class="mt-2">
              <h3 class="text-sm text-gray-200">${esc(r.year || '未知')} · ${esc(r.title || '')}</h3>
              <p class="mt-1 text-xs leading-6 text-gray-400">${esc(r.desc || '')}</p>
            </article>`,
          )
          .join('')}
      </section>`
    })
    .join('')
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">历史上的今天</h1>
    <p class="mt-3 text-sm leading-7 text-gray-400">共 ${rows.length} 条档案，覆盖 ${byDate.size} 个日期。启用 JavaScript 后可用日历选择任意日期查看。</p>
    <div class="mt-6">${body || '<p class="text-sm text-gray-500">暂无记录。</p>'}</div>
    ${nav()}
  </div>`
}

/**
 * 古籍模式静态壳：构建期无浏览器排版能力（列数/展页依赖容器尺寸），
 * 因此只输出可索引的目录级摘要（分卷 + 每卷条目数 + 卷首词条），不模拟竖排版式。
 * 客户端接管后才是完整线装书阅读器（分类/层级两种分卷，可翻页）。
 */
function ancientBookHtml(): string {
  const total = Object.values(data.tiers).reduce((n, t) => n + (t?.length || 0), 0)
  const byCat = new Map<string, number>()
  for (const items of Object.values(data.tiers)) {
    for (const it of items || []) byCat.set(it.category, (byCat.get(it.category) || 0) + 1)
  }
  const vols = Object.keys(data.categoryColors || {})
    .map(
      (cat) =>
        `<li class="text-xs leading-6 text-gray-400">${esc(cat)} · ${byCat.get(cat) || 0} 条</li>`,
    )
    .join('')
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">古籍线装书</h1>
    <p class="mt-3 text-sm leading-7 text-gray-400">竖排右起的线装书阅读模式，共 ${total} 词条，支持按类别 / 层级两种分卷。启用 JavaScript 后可翻页阅读全文。</p>
    <ul class="mt-6 grid gap-x-8 sm:grid-cols-2">${vols || '<li class="text-sm text-gray-500">暂无分卷。</li>'}</ul>
    ${nav()}
  </div>`
}

/**
 * 3D 冰山静态壳：WebGL 场景无法在 Node 内渲染，输出占位说明保证
 * sitemap 承诺的 URL 对爬虫/无 JS 用户非空。客户端接管后加载完整 Three.js 场景。
 */
function threeDHtml(): string {
  const total = Object.values(data.tiers).reduce((n, t) => n + (t?.length || 0), 0)
  return `<div class="max-w-3xl mx-auto px-6 py-10 text-white">
    <h1 class="text-2xl font-black tracking-wider">3D 冰山</h1>
    <p class="mt-3 text-sm leading-7 text-gray-400">Three.js 驱动的 3D 冰山场景，共 ${total} 词条，以类别着色的词条钻石呈现。需要启用 JavaScript 且浏览器支持 WebGL 才能进入完整场景。</p>
    <p class="mt-4 text-sm"><a href="${base}" class="text-sky-300 hover:text-sky-200">← 返回 2D 冰山图（无需 WebGL）</a></p>
    ${nav()}
  </div>`
}

export async function prerender({ url }: { url: string }) {
  // /dive 是 DEV 专用实验页，不参与预渲染与 sitemap
  const categoryRoutes = CATEGORY_NAMES.map((name) => `/category/${categorySlug(name)}`)
  const baseLinks = new Set(['/home', '/handbook', '/features', '/on-this-day', '/ancient-book', '/3d', ...categoryRoutes])

  if (url === '/') {
    return { html: homeHtml(), links: baseLinks, head: headFor('/', SITE) }
  }
  if (url === '/home') {
    return { html: homeNavHtml(), links: baseLinks, head: headFor('/home', `首页 · ${SITE}`) }
  }
  if (url === '/handbook') {
    return { html: handbookHtml(), links: baseLinks, head: headFor('/handbook', `手册 · ${SITE}`) }
  }
  if (url === '/features') {
    const links = new Set([...baseLinks, ...featureEntries().map((f) => `/features/${f.slug}`)])
    return { html: featuresHtml(), links, head: headFor('/features', `专题 · ${SITE}`) }
  }
  if (url.startsWith('/features/')) {
    const slug = url.slice('/features/'.length)
    return { html: featureDetailHtml(slug), links: baseLinks, head: headFor(url, `${featureEntries().find((f) => f.slug === slug)?.fm.title || '专题'} · ${SITE}`) }
  }
  if (url.startsWith('/category/')) {
    const slug = url.slice('/category/'.length).replace(/\/$/, '')
    const name = CATEGORY_NAMES.find((n) => categorySlug(n) === slug)
    if (!name) return notFoundShell(url, baseLinks)
    const items = itemsOfCategory(name)
    const canonical = canonicalUrl(url)
    return {
      html: categoryHtml(name),
      links: baseLinks,
      head: headFor(url, `${name} · ${SITE}`, {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name,
        url: canonical,
        inLanguage: 'zh-CN',
        isPartOf: { '@type': 'WebSite', name: SITE, url: SITE_ORIGIN + '/' },
        // 词条没有独立 URL，ItemList 只声明标题与顺序 —— 不编造不存在的地址
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: items.length,
          itemListElement: items.slice(0, 30).map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.title,
          })),
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '冰山图', item: SITE_ORIGIN + '/' },
            { '@type': 'ListItem', position: 2, name, item: canonical },
          ],
        },
      }),
    }
  }
  if (url === '/on-this-day') {
    return { html: onThisDayHtml(), links: baseLinks, head: headFor('/on-this-day', `历史上的今天 · ${SITE}`) }
  }
  if (url === '/ancient-book') {
    return { html: ancientBookHtml(), links: baseLinks, head: headFor('/ancient-book', `古籍线装书 · ${SITE}`) }
  }
  if (url === '/3d') {
    return { html: threeDHtml(), links: baseLinks, head: headFor('/3d', `3D 冰山 · ${SITE}`) }
  }
  return notFoundShell(url, baseLinks)
}

/** 未知路由（如 404）：渲染最小占位壳，但 canonical/标题跟随请求 URL，
 *  避免误用首页 canonical 造成搜索引擎去重误判。 */
function notFoundShell(url: string, links: Set<string>) {
  return {
    html: `<div class="max-w-3xl mx-auto px-6 py-10 text-white"><h1 class="text-2xl font-black tracking-wider">页面不存在</h1><p class="mt-3 text-sm text-gray-400">你试图进入的页面不存在。</p>${nav()}</div>`,
    links,
    head: headFor(url, `页面不存在 · ${SITE}`),
  }
}
