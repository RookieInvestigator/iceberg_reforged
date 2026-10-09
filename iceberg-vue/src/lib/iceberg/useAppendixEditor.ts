/**
 * 副表编辑器的**编辑模型**（2026-10-09 从 AppendixEditView.vue 抽出来）。
 *
 * 视图只负责画，这里负责「数据长什么样、改一下落到哪张表」：
 *   · 载入五张副表（列名/键/越界判定都来自 lib/iceberg/appendix.ts，一处定义）；
 *   · 行级读写（增删改）与 dirty / 保存 / 越界上报；
 *   · 按区域分派的「所见即所得」写入口：标量字段 → overrides，分类 → categories，
 *     链接 → references，关联 → related，署名 → contributors。
 *
 * 之所以抽成 composable 而不是塞在组件里：这份状态要被「所见即所得」「原始行」「左栏列表」
 * 三块 UI 共用，塞在视图里就只能靠 props/emit 层层透传，正是上一版越写越乱的原因。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import raw from '../../data/iceberg.json'
import { normalizeData } from '../data'
import { parseCSV } from '../csv'
import { normalizeTags } from '../tags'
import { linkDisplay, SOURCE_LABELS } from '../sourceLabel'
import { gradientStops } from './extraCategories'
import {
  APPENDIX_TABLES,
  EXTRA_FLAGS,
  OVERRIDE_FIELDS,
  appendixViolation,
  detectEol,
  hasBom,
  readAppendixRaw,
  serializeAppendixTable,
  shouldDropOnSave,
  type AppendixKey,
  type AppendixTableDef,
  type ExtraFlag,
} from './appendix'

export type Row = Record<string, string>
type Store = Map<string, Row[]>

/** 表格数据（iceberg.json）——**不做任何副表叠加**，所以「原值」就是站点原始值 */
const data = normalizeData(raw)
const allItems = Object.entries(data.tiers).flatMap(([tierName, items]) =>
  (items as any[]).map(item => ({ ...item, tier: tierName })),
)
const itemMap = new Map(allItems.map(i => [i.id, i]))
const TIERS = data.tierOrder.filter(t => t !== '说明')
const CATEGORIES = Object.keys(data.categoryColors)
const TAG_NAMES = Object.values(data.tagMap || {}) as string[]
const TAG_EMOJI: Record<string, string> = {}
for (const [emoji, name] of Object.entries(data.tagMap || {})) TAG_EMOJI[name as string] = emoji as string
/** 「显示名」输入框的候选：sourceLabel 的站点名（去重） */
const SOURCE_NAMES = [...new Set(Object.values(SOURCE_LABELS))].sort((a, b) => a.localeCompare(b, 'zh-CN'))

/** 各表 role 列的可选项（空值 = 该表缺省语义） */
const ROLE_OPTIONS: Partial<Record<AppendixKey, Array<{ value: string; label: string }>>> = {
  categories: [
    { value: '', label: 'extra（缺省 · 追加副分类）' },
    { value: 'main', label: 'main（覆盖主分类）' },
    { value: 'extra', label: 'extra（追加副分类）' },
  ],
  references: [
    { value: '', label: 'ref（缺省 · 附加参考）' },
    { value: 'main', label: 'main（覆盖主链接）' },
    { value: 'ref', label: 'ref（附加参考）' },
  ],
}

export interface UpstreamValues {
  title: string
  desc: string
  tags: string[]
  category: string
  link: string
  related: string[]
  tier: string
}

export interface AppendixEditor {
  // ── 表与行 ──
  tables: readonly AppendixTableDef[]
  defOf: (key: AppendixKey) => AppendixTableDef
  allItems: typeof allItems
  itemMap: typeof itemMap
  tiers: string[]
  categories: string[]
  tagNames: string[]
  tagEmoji: Record<string, string>
  sourceNames: string[]
  roleOptions: typeof ROLE_OPTIONS
  fieldOptions: (row: Row) => string[]
  violationOf: typeof appendixViolation
  // ── 状态 ──
  selectedId: Ref<string | null>
  tick: Ref<number>
  dirtyCount: ComputedRef<number>
  saving: Ref<boolean>
  saveError: Ref<string>
  violations: ComputedRef<string[]>
  selectedItem: ComputedRef<any | null>
  upstream: ComputedRef<UpstreamValues>
  totalChanges: ComputedRef<number>
  changeCount: (id: string) => number
  // ── 行读写 ──
  getRows: (def: AppendixTableDef) => Row[]
  rowsOf: (key: AppendixKey) => Row[]
  addRow: (def: AppendixTableDef) => void
  removeRow: (def: AppendixTableDef, idx: number) => void
  setCell: (def: AppendixTableDef, idx: number, col: string, val: string) => void
  // ── 标量字段 ──
  overrideRow: (field: string) => Row | undefined
  overrideValue: (field: string) => string
  setOverride: (field: string, value: string) => void
  clearOverride: (field: string) => void
  effTitle: ComputedRef<string>
  effDesc: ComputedRef<string>
  effTags: ComputedRef<string[]>
  setTags: (list: string[]) => void
  // ── 分类 ──
  catColor: (c: string) => string
  mainCatRow: ComputedRef<Row | undefined>
  effMainCat: ComputedRef<string>
  effExtraCats: ComputedRef<string[]>
  effGradient: ComputedRef<string>
  addableCats: ComputedRef<string[]>
  setMainCategory: (cat: string) => void
  toggleExtraCategory: (cat: string) => void
  // ── 链接 ──
  mainLinkRow: ComputedRef<Row | undefined>
  effMainUrl: ComputedRef<string>
  effMainLabel: ComputedRef<string>
  effMainDisp: ComputedRef<ReturnType<typeof linkDisplay> | null>
  refLinks: ComputedRef<Array<{ i: number; url: string; label: string; d: ReturnType<typeof linkDisplay> }>>
  setMainLink: (url: string, label: string) => void
  addRefLink: (url: string, label: string) => void
  setRefField: (idx: number, col: 'url' | 'label', val: string) => void
  removeRefLink: (idx: number) => void
  // ── 关联 ──
  relatedList: ComputedRef<Array<{ i: number; id: string; title: string; color: string }>>
  addRelated: (id: string) => void
  removeRelated: (i: number) => void
  /** 反向关联：哪些词条在 related.csv 里指向了本词条（只读，需整表扫描） */
  reverseRelatedOf: (id: string) => Array<{ sourceId: string }>
  // ── 署名 ──
  contributorRows: ComputedRef<Row[]>
  addContributor: (by: string, at: string) => void
  removeContributor: (i: number) => void
  // ── 标记（警示 / 需补充）──
  extraFlags: readonly ExtraFlag[]
  extraRows: ComputedRef<Row[]>
  extraOf: (flag: ExtraFlag) => { on: boolean; note: string }
  toggleExtraFlag: (flag: ExtraFlag) => void
  setExtraNote: (flag: ExtraFlag, note: string) => void
  // ── 保存 ──
  saveAll: () => Promise<void>
}

export function useAppendixEditor(): AppendixEditor {
  const tables = APPENDIX_TABLES
  const defOf = (key: AppendixKey): AppendixTableDef => tables.find(t => t.key === key)!

  // ── 载入五张副表（各文件原有的 BOM / 行尾在保存时沿用） ──
  // 读文件走 lib/iceberg/appendix.ts 的 readAppendixRaw —— 它就在同一个目录，
  // glob 路径已经是对的。**不要在这里再写一份 import.meta.glob**：相对路径是相对
  // 「本文件」解析的，从 views/ 搬过来时路径没跟着改，glob 匹配到 0 个文件，
  // 编辑器就显示成「所有副表都是空的」（更危险的是此时保存会把副表清空）。
  const rawTables = readAppendixRaw()
  const stores = new Map<string, Store>()
  const fileBom = new Map<string, boolean>()
  const fileEol = new Map<string, '\n' | '\r\n'>()
  for (const def of tables) {
    const rawCsv = rawTables[def.key] || ''
    fileBom.set(def.key, hasBom(rawCsv))
    fileEol.set(def.key, detectEol(rawCsv))
    const store: Store = new Map()
    for (const row of parseCSV(rawCsv)) {
      const id = (row[def.idColumn] || '').trim()
      if (!id) continue
      if (!store.has(id)) store.set(id, [])
      store.get(id)!.push(row)
    }
    stores.set(def.key, store)
  }

  const selectedId = ref<string | null>(null)
  const tick = ref(0)
  const dirtySet = ref(new Set<string>())
  const saving = ref(false)
  const saveError = ref('')
  /**
   * 本次会话里「点了＋添加」新建的行。保存时只丢这些且仍空白的行；
   * 历史副表里的空值行（如 related.csv 里 source_id 有、target_id 空的 4 行）必须原样保留 ——
   * 按「空不空」判会误删真实数据（2026-10-09 踩过）。
   */
  const freshRows = new WeakSet<Row>()

  function bump(def: AppendixTableDef) { tick.value++; dirtySet.value.add(def.key); saveError.value = '' }
  function bumpKey(key: AppendixKey) { bump(defOf(key)) }
  const dirtyCount = computed(() => dirtySet.value.size)

  const violations = computed(() => {
    void tick.value
    const out: string[] = []
    for (const def of tables) {
      for (const [id, rows] of stores.get(def.key) ?? []) {
        for (const row of rows) {
          const v = appendixViolation(def, row)
          if (v) out.push(`${id} → ${v}`)
        }
      }
    }
    return out
  })

  // ── 行读写 ──
  function getRows(def: AppendixTableDef): Row[] {
    tick.value
    return stores.get(def.key)?.get(selectedId.value!) || []
  }
  function rowsOf(key: AppendixKey): Row[] {
    if (!selectedId.value) return []
    const store = stores.get(key)!
    if (!store.has(selectedId.value)) store.set(selectedId.value, [])
    return store.get(selectedId.value)!
  }
  function dropIfEmpty(key: AppendixKey, rows: Row[]) {
    if (rows.length === 0) stores.get(key)!.delete(selectedId.value!)
  }
  function addRow(def: AppendixTableDef) {
    const rows = rowsOf(def.key)
    const row: Row = {}
    for (const h of def.headers) row[h] = ''
    row[def.idColumn] = selectedId.value!
    freshRows.add(row)
    rows.push(row)
    bump(def)
  }
  function removeRow(def: AppendixTableDef, idx: number) {
    const rows = getRows(def)
    rows.splice(idx, 1)
    dropIfEmpty(def.key, rows)
    bump(def)
  }
  function setCell(def: AppendixTableDef, idx: number, col: string, val: string) {
    const rows = getRows(def)
    if (!rows[idx]) return
    rows[idx][col] = val
    bump(def)
  }
  function changeCount(id: string): number {
    void tick.value
    let n = 0
    for (const [, store] of stores) n += (store.get(id) || []).length
    return n
  }

  const selectedItem = computed(() => (selectedId.value ? itemMap.get(selectedId.value) ?? null : null))
  const upstream = computed<UpstreamValues>(() => {
    const it = selectedItem.value as any
    return {
      title: it?.title || '',
      desc: it?.desc || '',
      tags: (Array.isArray(it?.tags) ? it.tags : []) as string[],
      category: it?.category || '',
      link: it?.link || '',
      related: (Array.isArray(it?.related) ? it.related : []) as string[],
      tier: it?.tier || '',
    }
  })

  // ── 标量字段（overrides.csv）──
  function overrideRow(field: string): Row | undefined {
    return getRows(defOf('overrides')).find(r => (r.field || '').trim().toLowerCase() === field)
  }
  function overrideValue(field: string): string {
    return (overrideRow(field)?.value || '').trim()
  }
  /** 写入/覆盖；空值 = 删行（还原）。同键 upsert，与 apply_feedback 同约定 */
  function setOverride(field: string, value: string) {
    const rows = rowsOf('overrides')
    const idx = rows.findIndex(r => (r.field || '').trim().toLowerCase() === field)
    if (!value.trim()) {
      if (idx >= 0) rows.splice(idx, 1)
    } else if (idx >= 0) {
      rows[idx].value = value
    } else {
      rows.push({ item_id: selectedId.value!, field, value })
    }
    dropIfEmpty('overrides', rows)
    bumpKey('overrides')
  }
  function clearOverride(field: string) { setOverride(field, '') }
  const effTitle = computed(() => overrideValue('title') || upstream.value.title)
  const effDesc = computed(() => overrideValue('desc') || upstream.value.desc)
  const effTags = computed(() => {
    const v = overrideValue('tags')
    return v ? normalizeTags(v) : upstream.value.tags
  })
  function setTags(list: string[]) { setOverride('tags', list.length ? JSON.stringify(list) : '') }

  // ── 分类（categories.csv）──
  const catRows = computed(() => { void tick.value; return getRows(defOf('categories')) })
  const mainCatRow = computed(() => [...catRows.value].reverse().find(r => (r.role || '').trim().toLowerCase() === 'main'))
  const effMainCat = computed(() => (mainCatRow.value?.category || '').trim() || upstream.value.category)
  const effExtraCats = computed(() => {
    const known = new Set(CATEGORIES)
    const out: string[] = []
    for (const r of catRows.value) {
      if ((r.role || '').trim().toLowerCase() === 'main') continue
      const c = (r.category || '').trim()
      if (c && known.has(c) && c !== effMainCat.value && !out.includes(c)) out.push(c)
    }
    return out
  })
  const effCategories = computed(() => [effMainCat.value, ...effExtraCats.value].filter(Boolean))
  const effGradient = computed(() => {
    const cats = effCategories.value
    if (cats.length < 2) return ''
    const stops = gradientStops(cats, data.categoryColors, data.defaultColor)
    return stops ? `linear-gradient(90deg, ${stops})` : ''
  })
  const catColor = (c: string): string => data.categoryColors[c] || data.defaultColor
  const addableCats = computed(() => CATEGORIES.filter(c => c !== effMainCat.value && !effExtraCats.value.includes(c)))

  function setMainCategory(cat: string) {
    const rows = rowsOf('categories')
    const c = cat.trim()
    const i = rows.findIndex(r => (r.role || '').trim().toLowerCase() === 'main')
    if (!c || c === upstream.value.category) {
      if (i >= 0) rows.splice(i, 1)
    } else {
      if (i >= 0) rows[i].category = c
      else rows.push({ item_id: selectedId.value!, category: c, role: 'main' })
      // 与新的主分类重合的 extra 行要删掉：留着会被构建门判「extra 与主分类重复」
      for (let k = rows.length - 1; k >= 0; k--) {
        const r = rows[k]
        if ((r.role || '').trim().toLowerCase() === 'main') continue
        if ((r.category || '').trim() === c) rows.splice(k, 1)
      }
    }
    dropIfEmpty('categories', rows)
    bumpKey('categories')
  }
  function toggleExtraCategory(cat: string) {
    const rows = rowsOf('categories')
    const i = rows.findIndex(r => (r.role || '').trim().toLowerCase() !== 'main' && (r.category || '').trim() === cat)
    if (i >= 0) rows.splice(i, 1)
    else rows.push({ item_id: selectedId.value!, category: cat, role: 'extra' })
    dropIfEmpty('categories', rows)
    bumpKey('categories')
  }

  // ── 链接（references.csv）──
  const refRows = computed(() => { void tick.value; return getRows(defOf('references')) })
  const mainLinkRow = computed(() => [...refRows.value].reverse().find(r => (r.role || '').trim().toLowerCase() === 'main'))
  const effMainUrl = computed(() => (mainLinkRow.value?.url || '').trim() || upstream.value.link)
  const effMainLabel = computed(() => (mainLinkRow.value?.label || '').trim())
  const effMainDisp = computed(() => (effMainUrl.value ? linkDisplay(effMainLabel.value, effMainUrl.value) : null))
  const refLinks = computed(() => refRows.value
    .map((r, i) => ({ i, role: (r.role || '').trim().toLowerCase() === 'main' ? 'main' as const : 'ref' as const, r }))
    .filter(x => x.role === 'ref' && (x.r.url || '').trim())
    .map(x => ({
      i: x.i,
      url: (x.r.url || '').trim(),
      label: (x.r.label || '').trim(),
      d: linkDisplay(x.r.label, x.r.url),
    })))

  /** 主链接覆盖（role=main）；url 为空 = 删行（还原为上游） */
  function setMainLink(url: string, label: string) {
    const rows = rowsOf('references')
    const i = rows.findIndex(r => (r.role || '').trim().toLowerCase() === 'main')
    const u = url.trim()
    if (!u) { if (i >= 0) rows.splice(i, 1) }
    else if (i >= 0) { rows[i].url = u; rows[i].label = label.trim() }
    else rows.push({ source_id: selectedId.value!, label: label.trim(), url: u, role: 'main' })
    dropIfEmpty('references', rows)
    bumpKey('references')
  }
  function addRefLink(url: string, label: string) {
    if (!url.trim()) return
    rowsOf('references').push({ source_id: selectedId.value!, label: label.trim(), url: url.trim(), role: 'ref' })
    bumpKey('references')
  }
  function setRefField(idx: number, col: 'url' | 'label', val: string) {
    const rows = getRows(defOf('references'))
    if (!rows[idx]) return
    rows[idx][col] = val
    bumpKey('references')
  }
  function removeRefLink(idx: number) { removeRow(defOf('references'), idx) }

  // ── 关联词条（related.csv）──
  const relatedRows = computed(() => { void tick.value; return getRows(defOf('related')) })
  const relatedList = computed(() => relatedRows.value.map((r, i) => {
    const hit = itemMap.get((r.target_id || '').trim()) as any
    return { i, id: (r.target_id || '').trim(), title: hit ? hit.title : (r.target_id || '（未找到）'), color: hit ? hit.categoryColor : '' }
  }))
  function addRelated(id: string) {
    const v = id.trim()
    if (!v || relatedRows.value.some(r => (r.target_id || '').trim() === v)) return
    rowsOf('related').push({ source_id: selectedId.value!, target_id: v })
    bumpKey('related')
  }
  function removeRelated(i: number) { removeRow(defOf('related'), i) }
  /** 反向关联：related.csv 是双向索引，谁指向本词条要整表扫一遍（几十行，代价可忽略） */
  function reverseRelatedOf(id: string): Array<{ sourceId: string }> {
    void tick.value
    const out: Array<{ sourceId: string }> = []
    for (const [srcId, rows] of stores.get('related') ?? []) {
      if (rows.some(r => (r.target_id || '').trim() === id)) out.push({ sourceId: srcId })
    }
    return out
  }

  // ── 署名（contributors.csv）──
  const contributorRows = computed(() => { void tick.value; return getRows(defOf('contributors')) })

  function addContributor(by: string, at: string) {
    const name = by.trim()
    if (!name) return
    const rows = rowsOf('contributors')
    const i = rows.findIndex(r => (r.by || '').trim() === name)
    if (i >= 0) rows[i].at = at.trim()
    else rows.push({ item_id: selectedId.value!, by: name, at: at.trim() })
    bumpKey('contributors')
  }
  function removeContributor(i: number) { removeRow(defOf('contributors'), i) }

  // ── 标记（extra.csv）：警示 / 需补充，行的存在即标记为真 ──
  const extraRows = computed(() => { void tick.value; return getRows(defOf('extra')) })
  /** 某标记是否已开 + 它的 note */
  function extraOf(flag: ExtraFlag): { on: boolean; note: string } {
    const row = extraRows.value.find(r => (r.flag || '').trim().toLowerCase() === flag)
    return { on: !!row, note: (row?.note || '').trim() }
  }
  function toggleExtraFlag(flag: ExtraFlag) {
    const rows = rowsOf('extra')
    const i = rows.findIndex(r => (r.flag || '').trim().toLowerCase() === flag)
    if (i >= 0) rows.splice(i, 1)
    else rows.push({ item_id: selectedId.value!, flag, note: '' })
    dropIfEmpty('extra', rows)
    bumpKey('extra')
  }
  function setExtraNote(flag: ExtraFlag, note: string) {
    const rows = rowsOf('extra')
    const i = rows.findIndex(r => (r.flag || '').trim().toLowerCase() === flag)
    if (i < 0) return
    rows[i].note = note
    bumpKey('extra')
  }

  const totalChanges = computed(() => tables.reduce((n, def) => n + getRows(def).length, 0))

  // ── 保存 ──
  async function saveAll() {
    if (violations.value.length) {
      saveError.value = `保存被拒绝 —— 副表越界：${violations.value.join('；')}`
      return
    }
    saving.value = true
    saveError.value = ''
    let ok = 0
    const failed: string[] = []
    for (const def of tables) {
      const store = stores.get(def.key)!
      const rows: Row[] = []
      for (const [, list] of store) {
        // 只丢「本次新建且仍空白」的行；历史空值行原样保留（见 freshRows 注释）
        for (const r of list) if (!shouldDropOnSave(def, r, freshRows.has(r))) rows.push(r)
      }
      const content = (fileBom.get(def.key) ? '\ufeff' : '')
        + serializeAppendixTable(def, rows, fileEol.get(def.key) || '\n')
      try {
        const resp = await fetch('/__appendix-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: def.file, content }),
        })
        if (resp.ok) ok++
        else {
          const body = await resp.json().catch(() => ({})) as { error?: string }
          failed.push(`${def.file}: ${body.error || `HTTP ${resp.status}`}`)
        }
      } catch (e) {
        failed.push(`${def.file}: ${(e as Error).message}`)
      }
    }
    if (ok === tables.length) dirtySet.value.clear()
    else saveError.value = `保存失败：${failed.join('；')}。修改已保留，请重试。`
    saving.value = false
  }

  function fieldOptions(row: Row): string[] {
    const cur = (row.field || '').trim()
    const base: string[] = [...OVERRIDE_FIELDS]
    return cur && !base.includes(cur) ? [...base, cur] : base
  }

  return {
    tables, defOf, allItems, itemMap, tiers: TIERS, categories: CATEGORIES, tagNames: TAG_NAMES, tagEmoji: TAG_EMOJI,
    sourceNames: SOURCE_NAMES, roleOptions: ROLE_OPTIONS, fieldOptions, violationOf: appendixViolation,
    selectedId, tick, dirtyCount, saving, saveError, violations, selectedItem, upstream, totalChanges,
    changeCount, getRows, rowsOf, addRow, removeRow, setCell,
    overrideRow, overrideValue, setOverride, clearOverride, effTitle, effDesc, effTags, setTags,
    catColor, mainCatRow, effMainCat, effExtraCats, effGradient, addableCats, setMainCategory, toggleExtraCategory,
    mainLinkRow, effMainUrl, effMainLabel, effMainDisp, refLinks, setMainLink, addRefLink, setRefField, removeRefLink,
    relatedList, addRelated, removeRelated, reverseRelatedOf,
    contributorRows, addContributor, removeContributor,
    extraFlags: EXTRA_FLAGS, extraRows, extraOf, toggleExtraFlag, setExtraNote,
    saveAll,
  }
}
