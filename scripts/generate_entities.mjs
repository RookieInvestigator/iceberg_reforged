/**
 * 生成实体抽取副表 `iceberg-vue/src/data/appendix/entities.csv`：
 * 从 `iceberg.json`（叠加 `overrides.csv` 的 title/desc 订正）中抽取地名、时间/年代与核心名词，
 * 辅以全语料共现统计发现的专有复合词，写出 RFC-4180 兼容 CSV。
 *
 * 运行：`bun run scripts/generate_entities.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'
import { canonicalizeNoun, extractEntryEntities, formatEntityList } from '../iceberg-vue/src/lib/iceberg/entityExtract.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_PATH = path.join(ROOT, 'iceberg-vue/src/data/iceberg.json')
const OVERRIDES_PATH = path.join(ROOT, 'iceberg-vue/src/data/appendix/overrides.csv')
const OUT_PATH = path.join(ROOT, 'iceberg-vue/src/data/appendix/entities.csv')

function parseSimpleCsv(rawText) {
  const clean = rawText.replace(/^\uFEFF/, '')
  const rows = []
  let i = 0
  let cur = ''
  let row = []
  let inQ = false
  while (i < clean.length) {
    const ch = clean[i]
    if (inQ) {
      if (ch === '"' && clean[i + 1] === '"') {
        cur += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        inQ = false
        i++
        continue
      }
      cur += ch
      i++
      continue
    }
    if (ch === '"') {
      inQ = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(cur)
      cur = ''
      i++
      continue
    }
    if (ch === '\r' && clean[i + 1] === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      i += 2
      continue
    }
    if (ch === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      i++
      continue
    }
    cur += ch
    i++
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((cols) => {
    const rec = {}
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? ''
    })
    return rec
  })
}

function escapeCsvCell(val) {
  const s = (val || '').trim()
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const rawJson = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
const overridesRaw = fs.existsSync(OVERRIDES_PATH) ? fs.readFileSync(OVERRIDES_PATH, 'utf8') : ''
const overrideMap = new Map()
for (const row of parseSimpleCsv(overridesRaw)) {
  const id = (row.item_id || '').trim()
  const field = (row.field || '').trim().toLowerCase()
  if (!id || (field !== 'title' && field !== 'desc')) continue
  if (!overrideMap.has(id)) overrideMap.set(id, {})
  overrideMap.get(id)[field] = row.value || ''
}

const items = Object.values(rawJson.tiers || {})
  .flat()
  .map((it) => {
    const ov = overrideMap.get(it.id)
    return {
      id: it.id,
      title: (ov?.title || it.title || '').trim(),
      desc: (ov?.desc || it.desc || '').trim(),
    }
  })

// 发现全语料中被引号/专名频繁提及的实体与高内聚复合词，过滤含虚词/指示代词的句子碎片
const GRAMMAR_FRAGMENT_RE = /[的了着过在为与和跟及个名则该这一那各某类条些种于从对向以]/
const STOP_FRAGMENT = /(?:一个|一种|这些|那些|这一|那一|这类|此类|其中|因为|所以|但是|然而|虽然|如果|不过|因此|而且|此外|以及|关于|认为|可能|出现|发生|时候|表示|流传|据说|称为|所谓|成为|造成|导致|引起|开始|已经|仍然|至今|其实|主要|通常|一般|部分|甚至|几乎|后来|之后|此前|目前|当时|如今|现在|任何|所有|很多|不少|许多|非常|特别|某种|某个|各种|各类|这种|那种|我们|他们|自己|别人|有人|人们|大家|一直|曾经|没有|不是|可以|需要|进行|通过|利用|使用|具有|存在|属于|来自|位于|相关|类似|不同|相同|神秘|诡异|恐怖|奇怪|离奇|著名|重要|经典|独特|常见|广泛|历史|时期|时代|世纪|年代|地区民间传说|民间故事|古代传说|传统传说|特定|恶性|奇特|视为|系列|都市传说|民间传说|灵异事件)/
const QUOTED_ENTITY_RE = /「([\u4e00-\u9fa5A-Za-z0-9·]{2,10})」/g
const DOMAIN_COMPOUND_RE = /([\u4e00-\u9fa5]{2,4}(?:效应|综合征|综合症|悖论|假说|学说|理论|实验|计划|工程|事件|案件|惨案|空难|海难|病毒|细菌|真菌|协议|法则|定理|现象|传说|秘境|怪谈|组织|教派|学派|游戏|软件|网站|系统|主义|文化|心理|机制|遗址|遗迹|仪式|习俗|禁忌|图腾|法术|疗法|针法|文字|符号|玉器))/g

const df = new Map()
for (const it of items) {
  const text = `${it.title} ${it.desc}`
  const seen = new Set()
  for (const m of text.matchAll(QUOTED_ENTITY_RE)) {
    const raw = m[1].trim()
    if (raw.length < 2 || STOP_FRAGMENT.test(raw)) continue
    seen.add(canonicalizeNoun(raw))
  }
  for (const m of text.matchAll(DOMAIN_COMPOUND_RE)) {
    const raw = m[1].trim()
    if (raw.length < 2 || GRAMMAR_FRAGMENT_RE.test(raw) || STOP_FRAGMENT.test(raw)) continue
    seen.add(canonicalizeNoun(raw))
  }
  for (const t of seen) df.set(t, (df.get(t) || 0) + 1)
}

const extraCorpusNouns = new Set(
  [...df.entries()]
    .filter(([, count]) => count >= 2 && count <= 45)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t),
)

const lines = ['item_id,places,times,nouns,platforms']
let withPlaces = 0
let withTimes = 0
let withNouns = 0
let withPlatforms = 0
let withAny = 0

for (const it of items) {
  const ent = extractEntryEntities(it.title, it.desc, extraCorpusNouns)
  if (ent.places.length) withPlaces++
  if (ent.times.length) withTimes++
  if (ent.nouns.length) withNouns++
  if (ent.platforms.length) withPlatforms++
  if (ent.places.length || ent.times.length || ent.nouns.length || ent.platforms.length) withAny++
  lines.push(
    [
      escapeCsvCell(it.id),
      escapeCsvCell(formatEntityList(ent.places)),
      escapeCsvCell(formatEntityList(ent.times)),
      escapeCsvCell(formatEntityList(ent.nouns)),
      escapeCsvCell(formatEntityList(ent.platforms)),
    ].join(','),
  )
}

fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8')
console.log(
  `[generate_entities] items=${items.length} any=${withAny} places=${withPlaces} times=${withTimes} nouns=${withNouns} platforms=${withPlatforms} extraCorpusNouns=${extraCorpusNouns.size}`,
)
