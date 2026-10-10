/**
 * 公告（src/data/bulletins/*.md）单一入口：frontmatter 解析 + schema 校验 + 排序 + 已读状态。
 *
 * 解析、排序、排序后的「最新一条」、以及「是否未读 / 是否已被关闭」全部只此一处，
 * 公告板弹窗与公告条共用同一数据源。
 *
 * 存储：两个单指针（非 id 集合）——
 *   `iceberg-bulletin-seen`             已读到哪一条（打开公告板即前移）
 *   `iceberg-bulletin-banner-dismissed` 手动关掉了哪一条的顶部条幅
 * 关闭条幅 ≠ 读过：用户关掉条幅只是不想看那条横幅，不应因此跳过自动弹窗，
 * 但也不该再被同一条公告的弹窗打扰 —— 所以两个指针都参与「要不要自动弹」的判定。
 * 两者都以 `iceberg-` 开头，因此自动进入设置面板的导出 / 导入 / 清空范围（SettingsPanel 按前缀枚举）。
 */

export interface Bulletin {
  /** 文件名去扩展名（如 `001-dev-status`），稳定标识，用于已读 / 关闭记忆 */
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  author: string
  /** frontmatter 之后的正文（已 trim），当前按纯文本渲染 */
  content: string
}

export type BulletinParse =
  | { ok: true; bulletin: Bulletin; hidden: boolean }
  | { ok: false; error: string }

export interface BulletinState {
  seenId: string | null
  dismissedId: string | null
}

/** frontmatter 与正文的切分：允许文件在 frontmatter 后直接结束（无正文） */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const SEEN_KEY = 'iceberg-bulletin-seen'
const DISMISSED_KEY = 'iceberg-bulletin-banner-dismissed'

/** 去成对引号：`title: "站点更新"` 与 `title: 站点更新` 等价 */
function stripQuotes(v: string): string {
  const s = v.trim()
  const q = s[0]
  if (s.length >= 2 && (q === '"' || q === "'") && s.endsWith(q)) return s.slice(1, -1)
  return s
}

/**
 * 解析单条公告。不合法返回 `{ ok: false, error }` 而不是 null —— 调用方（构建期载入 /
 * 单测）需要知道**为什么**被跳过，静默丢弃会让「公告没显示」无从排查。
 *
 * 规则：必须有 frontmatter；`title` / `date` 必填；`date` 必须是 YYYY-MM-DD；
 * `author` 可选（缺失为空串）；值内允许冒号（按首个冒号切分，其余归值）；
 * `hidden` 可选（只接受 true / false）—— 为 true 时**保留文件但从站内公告列表隐藏**，
 * 用于下线过时公告而不丢历史（删文件会连带丢掉 git 之外的归档语境）。
 */
export function parseBulletin(id: string, raw: string): BulletinParse {
  if (typeof raw !== 'string') return { ok: false, error: '内容不是字符串' }
  // BOM 防御：CI 有 BOM 守卫，这里双保险（带 BOM 时 frontmatter 正则的首个 --- 匹配不上）
  const text = raw.replace(/^\uFEFF/, '')
  const m = text.match(FRONTMATTER_RE)
  if (!m) return { ok: false, error: '缺少 frontmatter（--- … ---）' }

  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i < 0) return { ok: false, error: `frontmatter 行无法解析：${trimmed}` }
    fm[line.slice(0, i).trim()] = stripQuotes(line.slice(i + 1))
  }

  const title = fm.title || ''
  const date = fm.date || ''
  if (!title) return { ok: false, error: '缺少 title' }
  if (!date) return { ok: false, error: '缺少 date' }
  if (!DATE_RE.test(date)) return { ok: false, error: `date 需为 YYYY-MM-DD：${date}` }

  const hiddenRaw = (fm.hidden || '').toLowerCase()
  if (hiddenRaw && hiddenRaw !== 'true' && hiddenRaw !== 'false') {
    return { ok: false, error: `hidden 只接受 true / false：${fm.hidden}` }
  }

  return {
    ok: true,
    hidden: hiddenRaw === 'true',
    bulletin: { id, title, date, author: fm.author || '', content: m[2].trim() },
  }
}

/** import.meta.glob 的路径 → 公告 id */
export function bulletinIdFromPath(path: string): string {
  const base = path.split('/').pop() || path
  return base.replace(/\.md$/i, '')
}

/**
 * 批量解析 → 按日期倒序（同日按 id 倒序，保证确定性，不依赖 glob 键序）。
 * `hidden: true` 的公告保留在磁盘但不上列表（静默，属于有意下线而非错误）；
 * 非法文件跳过并回报给 onError，不阻断其余公告。
 */
export function collectBulletins(
  modules: Record<string, string>,
  onError?: (id: string, error: string) => void,
): Bulletin[] {
  const out: Bulletin[] = []
  for (const [path, raw] of Object.entries(modules)) {
    const id = bulletinIdFromPath(path)
    const parsed = parseBulletin(id, raw)
    if (!parsed.ok) { onError?.(id, parsed.error); continue }
    if (parsed.hidden) continue
    out.push(parsed.bulletin)
  }
  return out.sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)))
}

// 构建期 eager 载入（公告改文案需重新构建，与其他 data/ 静态数据一致）
const bulletinModules = import.meta.glob('../data/bulletins/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

let cached: Bulletin[] | null = null

/** 站内全部公告（日期倒序）；非法文件跳过并在开发控制台可见原因 */
export function loadBulletins(): Bulletin[] {
  if (!cached) {
    cached = collectBulletins(bulletinModules, (id, error) => {
      console.warn(`[bulletins] 跳过 ${id}.md：${error}`)
    })
  }
  return cached
}

/** 存储读取：隐私模式 / 预渲染（Node 无 localStorage）下静默返回 null，不抛 */
function readKey(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

function writeKey(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    /* 配额 / 隐私模式：静默 */
  }
}

export function readBulletinState(): BulletinState {
  return { seenId: readKey(SEEN_KEY), dismissedId: readKey(DISMISSED_KEY) }
}

/** 已读指针前移至该条（打开公告板 / 自动弹窗展示时调用） */
export function markBulletinSeen(id: string): void {
  writeKey(SEEN_KEY, id)
}

/** 关闭顶部条幅：只记这一条已被用户关掉 */
export function dismissBulletinBanner(id: string): void {
  writeKey(DISMISSED_KEY, id)
}

/**
 * 顶部条幅是否显示：只要最新一条没被手动关闭就显示 —— **不因「已读」而隐藏**
 * （看过也仍然看得见入口，用户主动关掉才让位）。
 */
export function shouldShowBanner(list: Bulletin[], state: BulletinState): boolean {
  const latest = list[0]
  return !!latest && latest.id !== state.dismissedId
}

/**
 * 是否需要在进站时自动弹一次：最新一条既未读过、也没被关掉条幅。
 * 只对「最新一条」判定 —— 一次弹一条，不补弹历史公告。
 */
export function pendingBulletin(list: Bulletin[], state: BulletinState): Bulletin | null {
  const latest = list[0]
  if (!latest) return null
  if (latest.id === state.seenId || latest.id === state.dismissedId) return null
  return latest
}
