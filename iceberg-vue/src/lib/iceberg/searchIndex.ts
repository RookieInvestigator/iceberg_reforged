import Fuse from 'fuse.js'
import PinyinMatch from 'pinyin-match'
import { getInitial } from '../pinyin'

/**
 * 站内搜索的唯一实现（Worker 与测试共用）。两层，前一层有结果就不跑后一层：
 *
 * 1. **精确/子串层**：Fuse（标题 / 标签 / 分类 / 正文）。默认打分含「匹配起点」罚分
 *    （score = 错误数/查询长度 + |命中起点|/distance，distance 100、threshold 0.3），
 *    等于只搜每段文本的前 30 字。中文正文没有空格，整段 desc 是一个 token，
 *    于是第 30 字之后的正文永远搜不到（实测 78% 的正文字符在第 30 字之后，
 *    尾部取样 444 条词条旧配置只命中 2 条）—— 所以必须 `ignoreLocation: true`。
 * 2. **模糊层**（「模糊」模式下始终与精确层合并，精确在前）：
 *    - **中文标题的覆盖匹配**（覆盖层，主力）：查询的字不要求连续、不要求顺序，
 *      每个字都得有着落 —— 标题里有这个字，或有同声母的字顶替（同音错字）。
 *      例：`景人` / `景人国` / `精国人` 都能找到「景国人粥」。
 *      两字词不做同音顶替（「任一 J 声母字 + 人」会一发一大片），三字以上最多顶 1 个字。
 *    - **拼音/缩写**（`pinyin-match`，MIT / 零依赖 / 自带类型）：纯字母查询按拼音全拼、
 *      首字母缩写、中英混合匹配。例：`shz` / `shuihouzi` 都能找到「水猴子」。
 *
 * 多关键词：空格分隔按 AND 合并（`水猴子 传说` = 两词都命中）。
 * 归一化：索引侧与查询侧都过 `normalizeSearchText`（全角→半角、空白折叠、间隔号统一、
 * 小写），否则「用户输 375·330、数据写 375・330」这种肉眼一样的串会搜不到。
 */

export const FUSE_THRESHOLD = 0.3

/** 精确层选项（keys 由索引装配时补） */
export const FUSE_BASE_OPTIONS = {
  threshold: FUSE_THRESHOLD,
  minMatchCharLength: 1,
  // 关键一行：默认规则对中文正文等于禁用全文搜索（见文件头第 1 条）
  ignoreLocation: true,
  // 多关键词合并与建议下拉都要按相关度排序，必须拿到分数
  includeScore: true,
}

/** 词条上会被索引的字段（Worker 初始化载荷） */
export interface SearchableItem {
  id: string
  title: string
  desc?: string
  category?: string
  tags?: string[]
}

export interface SearchOutcome {
  /** 命中 id（相关度序，精确命中在前）；null = 查询为空（= 无搜索） */
  ids: string[] | null
  /** true = 结果里含模糊层（拼音/缩写）命中 */
  fuzzy: boolean
  /** 精确层命中数；0 且 fuzzy=true 表示整批结果都是拼音近似 */
  exactCount: number
}

export interface SearchOptions {
  /** 精确层零命中时是否允许回落到拼音/缩写模糊层（默认 true；顶栏「精确」开关关掉它） */
  allowFuzzy?: boolean
}

export interface SearchIndex {
  search(query: string, mode?: 'full' | 'title', opts?: SearchOptions): SearchOutcome
}

/** 间隔号/中点的各种写法统一成数据里的 `・`（标题与分类名大量使用它） */
const SEPARATORS = /[·・•‧∙⋅]/g

/**
 * 搜索用文本归一化：全角→半角（NFKC）、空白折叠、间隔号统一、小写。
 * 索引侧与查询侧都要过这一道。
 */
export function normalizeSearchText(input: string | undefined | null): string {
  if (!input) return ''
  return input
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, ' ')
    .replace(SEPARATORS, '・')
    .trim()
    .toLowerCase()
}

/** 查询拆词：归一化后按空白切开、去重（多关键词 AND 的最小单位） */
export function searchTerms(query: string): string[] {
  const q = normalizeSearchText(query)
  if (!q) return []
  return [...new Set(q.split(' ').filter(Boolean))]
}

/** 全文索引字段权重：标题优先于标签/分类，正文最后（只影响排序，不影响命中） */
const FULL_KEYS = [
  { name: 'title', weight: 3 },
  { name: 'tags', weight: 1.5 },
  { name: 'category', weight: 1 },
  { name: 'desc', weight: 1 },
]

const TITLE_KEYS = [{ name: 'title', weight: 1 }]

/** 模糊层最多返回多少条（拼音/缩写匹配容易一发一大片，UI 只需要“够用”的量） */
const FUZZY_LIMIT = 60

interface NormalizedDoc {
  id: string
  /** 归一化后的标题（进 Fuse 索引） */
  title: string
  /** 原始标题（交给 pinyin-match：它自己处理空格/装饰符与多音字） */
  titleRaw: string
  desc: string
  category: string
  tags: string[]
  /** 标题「字袋」：字 → 出现次数（去间隔号与空白，供乱序/缺字匹配） */
  chars: Map<string, number>
  /** 标题「声母袋」：拼音首字母 → 出现次数（供同音字顶替） */
  initials: Map<string, number>
  /** 标题字数（字袋总量，用于「越短越具体」的排序） */
  charCount: number
}

/** 单关键词精确搜索 → id→分数；多关键词逐词搜索取交集（AND），分数相加 */
function searchTermsAgainst(fuse: Fuse<NormalizedDoc>, terms: string[]): Map<string, number> {
  let acc: Map<string, number> | null = null
  for (const term of terms) {
    const hits = new Map<string, number>()
    for (const r of fuse.search(term)) hits.set(r.item.id, r.score ?? 0)
    if (!acc) {
      acc = hits
    } else {
      const next = new Map<string, number>()
      for (const [id, score] of acc) {
        const s = hits.get(id)
        if (s !== undefined) next.set(id, score + s)
      }
      acc = next
    }
    if (acc.size === 0) break
  }
  return acc ?? new Map()
}

/** 标题里出现任意汉字即视为中文查询（走覆盖层而不是拼音层） */
const HAS_CJK = /[\u3400-\u9fff]/

/** 单个字的拼音首字母（A–Z）；非汉字或表里没有 → 空串 */
function initialKey(ch: string): string {
  if (!HAS_CJK.test(ch)) return ''
  const v = getInitial(ch)
  return v === '#' ? '' : v
}

interface TermCoverage {
  /** 同音顶替之后仍然缺的字数（0 = 全部对上） */
  miss: number
  /** 被同声母字顶替的字数（同音错字） */
  homo: number
  /** 直接对上的字数 */
  matched: number
}

/** 一个字袋：term 的每个字在 title 里是否出现（不要求顺序，按出现次数扣减） */
function coverageOf(doc: NormalizedDoc, term: string): TermCoverage {
  const chars = new Map(doc.chars)
  const initials = new Map(doc.initials)
  const missing: string[] = []
  let matched = 0
  for (const ch of term) {
    const n = chars.get(ch) || 0
    if (n > 0) {
      chars.set(ch, n - 1)
      const ini = initialKey(ch)
      if (ini) initials.set(ini, (initials.get(ini) || 0) - 1)
      matched++
    } else {
      missing.push(ch)
    }
  }
  // 缺的字先看能不能用标题里「同声母」的剩余字顶替（精 → 景 这类同音错字）
  let homo = 0
  for (const ch of missing) {
    const ini = initialKey(ch)
    if (!ini) continue
    const n = initials.get(ini) || 0
    if (n > 0) {
      initials.set(ini, n - 1)
      homo++
    }
  }
  return { miss: missing.length - homo, homo, matched }
}

export function createSearchIndex(items: SearchableItem[]): SearchIndex {
  const docs: NormalizedDoc[] = items.map((it) => {
    const title = normalizeSearchText(it.title)
    const chars = new Map<string, number>()
    const initials = new Map<string, number>()
    let charCount = 0
    for (const ch of title) {
      if (ch === '・' || ch === ' ') continue   // 间隔号/空白不进字袋
      chars.set(ch, (chars.get(ch) || 0) + 1)
      const ini = initialKey(ch)
      if (ini) initials.set(ini, (initials.get(ini) || 0) + 1)
      charCount++
    }
    return {
      id: it.id,
      title,
      titleRaw: it.title || '',
      desc: normalizeSearchText(it.desc),
      category: normalizeSearchText(it.category),
      tags: (it.tags || []).map((t) => normalizeSearchText(t)).filter(Boolean),
      chars,
      initials,
      charCount,
    }
  })

  const fullIndex = new Fuse(docs, { ...FUSE_BASE_OPTIONS, keys: FULL_KEYS })
  const titleIndex = new Fuse(docs, { ...FUSE_BASE_OPTIONS, keys: TITLE_KEYS })

  function exactIds(terms: string[], mode: 'full' | 'title'): string[] {
    const scores = searchTermsAgainst(mode === 'title' ? titleIndex : fullIndex, terms)
    // 分数升序（越小越相关）；同分保持索引内顺序，结果稳定可复现
    return [...scores.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)
  }

  /**
   * 拼音层：标题的拼音/缩写/混合输入匹配（pinyin-match），多关键词 AND。
   * 排序按「命中起点之和」升序：越靠标题开头越相关，同分保持数据顺序（可复现）。
   */
  function pinyinIds(terms: string[]): string[] {
    const hits: { id: string; at: number; order: number }[] = []
    docs.forEach((doc, order) => {
      let at = 0
      for (const term of terms) {
        const range = PinyinMatch.match(doc.titleRaw, term)
        if (range === false) return
        at += range[0]
      }
      hits.push({ id: doc.id, at, order })
    })
    hits.sort((a, b) => a.at - b.at || a.order - b.order)
    return hits.slice(0, FUZZY_LIMIT).map((h) => h.id)
  }

  /**
   * 覆盖层（中文标题模糊搜索的主力）：查询的字**不要求连续、不要求顺序**，
   * 每个字都得有着落 —— 要么标题里就有这个字，要么有**同声母**的字顶替
   * （精 → 景、候 → 猴 这类同音错字）；且至少一半的字要直接命中，
   * 防止「全靠同音凑」的纯噪音。
   * 例：`景人` / `景人国` / `精国人` 都能找到「景国人粥」。
   * 字母/数字查询交给拼音层，单字查询交给精确层（覆盖单字噪音太大）。
   */
  function coverageIds(terms: string[]): string[] {
    const hits: { id: string; miss: number; homo: number; extra: number; order: number }[] = []
    docs.forEach((doc, order) => {
      let miss = 0
      let homo = 0
      let matched = 0
      for (const term of terms) {
        if (term.length < 2 || !HAS_CJK.test(term)) return
        const c = coverageOf(doc, term)
        // 每个字都必须有着落（缺字 = 不接受）；同音顶替最多一个字，
        // 而且两字词不允许顶替 —— 「任一 J 声母字 + 人」这种组合会一发一大片。
        if (c.miss > 0) return
        if (c.homo > (term.length >= 3 ? 1 : 0)) return
        miss += c.miss
        homo += c.homo
        matched += c.matched
      }
      hits.push({ id: doc.id, miss, homo, extra: doc.charCount - matched, order })
    })
    hits.sort((a, b) => a.miss - b.miss || a.homo - b.homo || a.extra - b.extra || a.order - b.order)
    return hits.slice(0, FUZZY_LIMIT).map((h) => h.id)
  }

  /** 纯字母/数字查询（拼音、缩写、英文名）走拼音层；含汉字的查询走覆盖层 */
  function fuzzyIds(terms: string[]): string[] {
    const latinOnly = terms.every((t) => !HAS_CJK.test(t))
    return latinOnly ? pinyinIds(terms) : coverageIds(terms)
  }

  return {
    search(query, mode = 'full', opts = {}) {
      const terms = searchTerms(query)
      if (!terms.length) return { ids: null, fuzzy: false, exactCount: 0 }
      const exact = exactIds(terms, mode)
      // 「精确」开关：只认精确层（零命中就是零命中，由 UI 提示切到模糊）
      if (opts.allowFuzzy === false) return { ids: exact, fuzzy: false, exactCount: exact.length }
      // 模糊 = 精确命中 + 拼音/缩写命中（精确在前、按 id 去重）。
      // 不是「精确没命中才补」——用户明确选了模糊，就应该两种结果都看到。
      const fuzzyHits = fuzzyIds(terms)
      const seen = new Set(exact)
      const extra = fuzzyHits.filter((id) => !seen.has(id))
      return { ids: [...exact, ...extra], fuzzy: extra.length > 0, exactCount: exact.length }
    },
  }
}
