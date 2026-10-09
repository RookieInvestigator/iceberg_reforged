<script setup lang="ts">
// FeedbackReviewView：反馈审核工作台（DEV 专用，路由只在 import.meta.env.DEV 注册）。
//
// 为什么有它：entry_feedback 的审阅原本写在 docs/FEEDBACK_WORKFLOW.md 里 —— 在 Supabase 后台
// 逐条改 status。反馈量一上来就不可行（当前积压 189 条）。工作台把「看当前值 vs 建议值 →
// 决定采纳/驳回/待定」搬进本地页面：
//   · 数据源：Supabase REST（anon 只读，RLS 允许 SELECT）或离线导入 Supabase 导出的 CSV
//   · 决定：localStorage + data/feedback/decisions.json（dev 中间件，data/ 不入库）
//   · 落盘：**页面不写副表**，只导出决定 + 给出 CLI 命令，写副表由 apply_feedback.py 做（可 dry-run）
// 键盘：J/K 或 ↑↓ 翻条 · A 采纳 · R 驳回 · S 待定 · Enter 下一条 · Backspace 撤销
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import raw from '../data/iceberg.json'
import { normalizeData, type IcebergItem } from '../lib/data'
import { parseCSV } from '../lib/csv'
import ReviewList from '../components/review/ReviewList.vue'
import ReviewDetail from '../components/review/ReviewDetail.vue'
import {
  acceptedIds, filterReviewRows, hasEdits, itemIdsOf, kindOf, loadDecisions, loadDecisionsFromDisk,
  mergeEdits, normalizeRows, readJsonResponse, saveDecisions, saveDecisionsToDisk, stats as calcStats,
  type Decision, type DecisionMap, type DecisionRecord, type FeedbackRow, type FieldEdits,
  type ReviewKind, type ReviewScope,
} from '../lib/feedbackReview'

// 当前词条数据（与 AppendixEditView 同法：DEV 视图可吃完整主数据）
type ReviewItem = IcebergItem & { tier: string }
const data = normalizeData(raw)
const items: ReviewItem[] = Object.entries(data.tiers).flatMap(([tier, list]) =>
  list.map((i) => ({ ...i, tier })))
const itemMap = new Map<string, ReviewItem>(items.map((i) => [i.id, i]))
const titles: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, i.title]))
// 分类下拉与标签多选的选项（来自主数据的两张表：categoryColors 的键 / tagMap 的值）
const categoryOptions = Object.keys(data.categoryColors || {})
const tagOptions = Object.values(data.tagMap || {})
const tagEmoji: Record<string, string> = Object.fromEntries(
  Object.entries(data.tagMap || {}).map(([emoji, name]) => [name, emoji]))

const rows = ref<FeedbackRow[]>([])
/** 原始行（REST 对象 / CSV 行）—— 落盘时原样交给中间件，避免再拉一次 Supabase */
const rawRows = ref<Array<Record<string, unknown>>>([])
const applying = ref(false)
const loading = ref(false)
/** 落盘中间件是否就绪（GET 探测）——未就绪时按钮禁用并给出「重启 dev server」的明确指引 */
const applyReady = ref<boolean | null>(null)
/** 是否配了 service key（配了则落盘同时自动回填 Supabase 的 status/applied） */
const canBackfill = ref(false)
const applyReport = ref('')
const applyError = ref('')
const applyPaths = ref<string[]>([])
const decisions = ref<DecisionMap>({})
const names = ref<Record<string, string>>({})
const nameState = ref<'pending' | 'ok' | 'offline'>('pending')
const activeIndex = ref(0)
/** 拉取范围：直接作为 Supabase 查询的 status 过滤（回填之后 open 里就查不到已审条目了，需要能切过去回看） */
const fetchScope = ref<ReviewScope>('open')
const kindFilter = ref<ReviewKind>('all')
// 默认只看未决：已决定的（含待定）不再混在列表里 —— 否则「审过的还在」会让人以为决定没保存。
// 真正的持久化在 localStorage + data/feedback/decisions.json（刷新即恢复），这里只是显示口径。
const undecidedOnly = ref(true)
const query = ref('')
const source = ref<'supabase' | 'csv' | ''>('')
const error = ref('')
const notice = ref('')
const diskSaved = ref(false)

const filtered = computed(() => filterReviewRows(rows.value, decisions.value, {
  scope: fetchScope.value,
  kind: kindFilter.value,
  undecidedOnly: undecidedOnly.value,
  query: query.value,
  titles,
}))

const activeRow = computed(() => filtered.value[activeIndex.value] || null)
const activeItem = computed(() => (activeRow.value ? itemMap.get(activeRow.value.itemId) || null : null))
const activeDecision = computed(() => (activeRow.value ? decisions.value[activeRow.value.id] : undefined))
const activeByName = computed(() => (activeRow.value ? names.value[activeRow.value.userId] || '' : ''))
const stat = computed(() => calcStats(rows.value, decisions.value))
const accepted = computed(() => acceptedIds(rows.value, decisions.value).length)
const editedCount = computed(() => rows.value.filter((r) => hasEdits(decisions.value[r.id]?.edits)).length)
/** 筛选后涉及多少个词条（去重）：一个词条可能有多条反馈，条数≠词条数 */
const filteredItems = computed(() => itemIdsOf(filtered.value).length)
/** 已决定（本地）涉及多少个词条 */
const decidedItems = computed(() => itemIdsOf(rows.value.filter((r) => decisions.value[r.id])).length)

// 提交者概览：本轮反馈基本来自同一人，直接显示昵称比显示「1 位」有用
const submitterLabel = computed(() => {
  const uids = [...new Set(rows.value.map((r) => r.userId).filter(Boolean))]
  if (!uids.length) return '—'
  const named = uids.map((u) => names.value[u]).filter(Boolean)
  if (uids.length === 1) {
    if (named.length === 1) return named[0]
    if (nameState.value === 'pending') return '解析中…'
    return nameState.value === 'ok' ? '未设昵称' : '离线未解析'
  }
  return `${uids.length} 位提交者（已解出 ${named.length} 个昵称）`
})

// 过滤条件变化后索引可能越界
watch(filtered, (l) => { if (activeIndex.value >= l.length) activeIndex.value = Math.max(0, l.length - 1) })

function move(delta: number) {
  const n = filtered.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

let diskTimer = 0
function persist() {
  saveDecisions(decisions.value)
  window.clearTimeout(diskTimer)
  diskTimer = window.setTimeout(async () => {
    diskSaved.value = await saveDecisionsToDisk(decisions.value)
  }, 600)
}

function decide(d: Decision, reason?: string) {
  const r = activeRow.value
  if (!r) return
  const prev = decisions.value[r.id]
  decisions.value = {
    ...decisions.value,
    [r.id]: {
      ...prev, // 保留就地编辑（edits）—— 决定不该把它冲掉
      decision: d,
      reason: d === 'reject' ? (reason || '') : undefined,
      at: new Date().toISOString(),
    },
  }
  persist()
  move(1) // 决定后自动前进：审阅效率的关键
}

/** 就地改建议值：只写本地 decisions.json（edits），绝不回写 Supabase */
function onEdit(patch: FieldEdits) {
  const r = activeRow.value
  if (!r) return
  const prev: DecisionRecord = decisions.value[r.id] || { at: new Date().toISOString() }
  const edits = mergeEdits(prev.edits, patch)
  const rec: DecisionRecord = { ...prev, at: prev.at || new Date().toISOString() }
  if (hasEdits(edits)) rec.edits = edits
  else delete rec.edits
  decisions.value = { ...decisions.value, [r.id]: rec }
  persist()
}

function undo() {
  const r = activeRow.value
  if (!r || !decisions.value[r.id]) return
  const next = { ...decisions.value }
  delete next[r.id]
  decisions.value = next
  persist()
}

function clearAll() {
  if (!window.confirm('清空本机全部审核决定？（磁盘副本也会被覆盖为空）')) return
  decisions.value = {}
  persist()
}

function onKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const el = document.activeElement
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
    if (e.key === 'Enter') (el as HTMLElement).blur()
    return
  }
  if (e.key === 'j' || e.key === 'ArrowDown') { move(1); e.preventDefault() }
  else if (e.key === 'k' || e.key === 'ArrowUp') { move(-1); e.preventDefault() }
  else if (e.key === 'a' || e.key === 'A') { decide('accept'); e.preventDefault() }
  else if (e.key === 'r' || e.key === 'R') { decide('reject', ''); e.preventDefault() }
  else if (e.key === 's' || e.key === 'S') { decide('later'); e.preventDefault() }
  else if (e.key === 'Backspace') { undo(); e.preventDefault() }
  else if (e.key === 'Enter') { move(1); e.preventDefault() }
}

function env() {
  return import.meta.env as unknown as Record<string, string | undefined>
}

async function resolveNames() {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env()
  const uids = [...new Set(rows.value.map((r) => r.userId).filter(Boolean))]
  if (!url || !key || !uids.length) { nameState.value = 'offline'; return }
  nameState.value = 'pending'
  try {
    const resp = await fetch(`${url}/rest/v1/rpc/batch_user_display`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids }),
    })
    if (!resp.ok) { nameState.value = 'offline'; return }
    const list = await resp.json() as Array<{ user_id: string; display_name: string }>
    names.value = Object.fromEntries(list.map((r) => [r.user_id, r.display_name || '']))
    nameState.value = 'ok'
  } catch {
    nameState.value = 'offline' // 离线：署名留空，脚本落盘时再解
  }
}

async function loadFromSupabase() {
  error.value = ''
  notice.value = ''
  loading.value = true
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env()
  if (!url || !key) {
    loading.value = false
    error.value = '未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY —— 请用「导入 CSV」离线模式'
    return
  }
  try {
    const cols = 'id,item_id,changes,note,user_id,status,applied,created_at'
    // 拉取范围 → 查询过滤（open / accepted / rejected / 全部）
    const scopeFilter = fetchScope.value === 'all' ? '' : `&status=eq.${fetchScope.value}`
    const resp = await fetch(`${url}/rest/v1/entry_feedback?select=${cols}${scopeFilter}&order=id.asc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    rawRows.value = await resp.json() as Array<Record<string, unknown>>
    rows.value = normalizeRows(rawRows.value)
    source.value = 'supabase'
    activeIndex.value = 0
    const label = { open: '待审 open', accepted: '已采纳', rejected: '已驳回', all: '全部状态' }[fetchScope.value]
    notice.value = `已从 Supabase 载入 ${rows.value.length} 条（${label}）`
    await resolveNames()
  } catch (e) {
    error.value = `Supabase 读取失败：${(e as Error).message} —— 改用「导入 CSV」`
  } finally {
    loading.value = false
  }
}

async function onPickCsv(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  try {
    const parsed = parseCSV(await file.text()) as unknown as Array<Record<string, unknown>>
    rawRows.value = parsed
    rows.value = normalizeRows(parsed)
    source.value = 'csv'
    activeIndex.value = 0
    notice.value = `已从 CSV 载入 ${rows.value.length} 条（离线模式，署名需落盘时再解）`
    await resolveNames()
  } catch (err) {
    error.value = `CSV 解析失败：${(err as Error).message}`
  }
  input.value = ''
}

/**
 * 一键落盘：先把决定 flush 到 data/feedback/decisions.json，再把「刚审的这批行」交给
 * dev 中间件 /__feedback-apply —— 中间件调 scripts/apply_feedback.py（同一实现），
 * write=false 即纯预演。副表的去重 / F34 归一 / 孤儿门 / .bak 备份都在脚本里，前端不重复实现。
 */
async function runApply(write: boolean) {
  if (!rawRows.value.length) { applyError.value = '没有已载入的反馈行（先刷新或导入 CSV）'; return }
  if (write && !accepted.value) { applyError.value = '还没有「采纳」的条目 —— 先在工作台里做决定'; return }
  applying.value = true
  applyReport.value = ''
  applyError.value = ''
  applyPaths.value = []
  try {
    await saveDecisionsToDisk(decisions.value) // 脚本读的是磁盘副本
    const resp = await fetch('/__feedback-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rawRows.value, write }),
    })
    const body = await readJsonResponse<{
      ok?: boolean; stdout?: string; stderr?: string; error?: string
      reviewMd?: string; backfillSql?: string; canBackfill?: boolean
    }>(resp)
    if (!body.ok || !body.data) { applyError.value = body.error || '未知错误'; return }
    const d = body.data
    canBackfill.value = !!d.canBackfill
    if (d.error) { applyError.value = d.error; return }
    applyReport.value = (d.stdout || '') + (d.stderr ? '\n[stderr]\n' + d.stderr : '')
    applyPaths.value = [d.reviewMd, d.backfillSql].filter(Boolean) as string[]
    notice.value = d.ok
      ? (write ? '副表已生成（原文件已备份为 .bak）—— 主图页刷新后即按新副表渲染' : '预演完成，未落盘')
      : '脚本返回非零，见下方输出'
  } catch (e) {
    applyError.value = (e as Error).message
  } finally {
    applying.value = false
  }
}

// 切换拉取范围：Supabase 模式重新查询（回看已审条目就靠这个）；CSV 离线模式只做客户端过滤。
// 「只看未决」的策略随范围变：看待审时默认只看未决，回看已审时必须全部显示（那些行本地多半已有决定）。
watch(fetchScope, (scope) => {
  undecidedOnly.value = scope === 'open'
  if (source.value === 'supabase') loadFromSupabase()
})

onMounted(async () => {
  decisions.value = loadDecisions()
  const disk = await loadDecisionsFromDisk()
  if (disk && Object.keys(disk).length) decisions.value = { ...disk, ...decisions.value }
  window.addEventListener('keydown', onKey)
  // 探测落盘中间件：vite.config.ts 变更后 dev server 会重启，存在「重启竞态读到旧配置」的情况，
  // 此时 /__feedback-apply 不存在 —— 提前问一次，别等用户点了才报一句 404
  try {
    const probe = await fetch('/__feedback-apply')
    const info = await readJsonResponse<{ ready?: boolean; canBackfill?: boolean }>(probe)
    applyReady.value = probe.ok && !!info.data?.ready
    canBackfill.value = !!info.data?.canBackfill
  } catch {
    applyReady.value = false
  }
  await loadFromSupabase()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(diskTimer)
})
</script>

<template>
  <div class="fr">
    <header class="fr-bar">
      <h1 class="fr-title">反馈审核工作台 <span class="fr-dev">DEV</span></h1>
      <span class="fr-src">{{ source === 'supabase' ? 'Supabase 实时' : source === 'csv' ? 'CSV 离线' : '未载入' }}</span>
      <span class="fr-src">提交者 {{ submitterLabel }}</span>
      <div class="fr-stats">
        <span>共 {{ stat.total }}</span>
        <span class="ok">采纳 {{ stat.accept }}</span>
        <span class="no">驳回 {{ stat.reject }}</span>
        <span>待定 {{ stat.later }}</span>
        <span class="dim">未决 {{ stat.undecided }}</span>
      </div>
      <div class="fr-progress" :title="`已决 ${stat.total - stat.undecided} / ${stat.total}`">
        <span :style="{ width: stat.total ? ((stat.total - stat.undecided) / stat.total * 100) + '%' : '0%' }" />
      </div>
      <div class="fr-actions">
        <button type="button" class="fr-btn" @click="loadFromSupabase">刷新</button>
        <label class="fr-btn">
          导入 CSV
          <input type="file" accept=".csv,text/csv" hidden @change="onPickCsv" />
        </label>
        <button type="button" class="fr-btn" @click="clearAll">清空决定</button>
        <span class="fr-save" :class="{ on: diskSaved }">{{ diskSaved ? '决定已写入 data/feedback' : '本地已存' }}</span>
      </div>
    </header>

    <div class="fr-filters">
      <select v-model="fetchScope" class="fr-input" title="拉取范围：直接作为 Supabase 查询的 status 过滤">
        <option value="open">状态：待审 open</option>
        <option value="accepted">状态：已采纳</option>
        <option value="rejected">状态：已驳回</option>
        <option value="all">状态：全部</option>
      </select>
      <span v-if="loading" class="fr-src">载入中…</span>
      <select v-model="kindFilter" class="fr-input">
        <option value="all">全部类型</option><option value="link">含链接</option><option value="desc">含描述</option>
        <option value="title">含标题</option><option value="meta">含分类/标签</option><option value="unsupported">未知字段</option>
      </select>
      <label class="fr-check"><input v-model="undecidedOnly" type="checkbox" /> 只看未决（隐藏已决定）</label>
      <input v-model="query" class="fr-input fr-search" type="search" placeholder="搜词条名 / id / 说明" />
      <span class="fr-filtered">
        已决 {{ stat.total - stat.undecided }} / {{ stat.total }}
        <template v-if="undecidedOnly && stat.total - stat.undecided">（隐藏 {{ stat.total - stat.undecided }} 条已决定）</template>
        · 筛选后 {{ filtered.length }} 条 · 涉及 {{ filteredItems }} 个词条 · 已采纳可落盘 {{ accepted }} 条<template v-if="editedCount"> · 就地改过 {{ editedCount }} 条</template>
        <template v-if="decidedItems"> · 已决涉及 {{ decidedItems }} 个词条</template>
      </span>
    </div>

    <p v-if="error" class="fr-msg err">{{ error }}</p>
    <p v-else-if="notice" class="fr-msg">{{ notice }}</p>

    <main class="fr-main">
      <ReviewList :rows="filtered" :titles="titles" :decisions="decisions" :active-index="activeIndex" @pick="(i) => (activeIndex = i)" />
      <ReviewDetail :row="activeRow" :item="activeItem" :decision="activeDecision" :edits="activeDecision?.edits"
        :by-name="activeByName" :name-state="nameState"
        :category-options="categoryOptions" :tag-options="tagOptions" :tag-emoji="tagEmoji"
        @decide="(d, reason) => decide(d, reason)" @edit="onEdit" />
    </main>

    <section v-if="applyError || applyReport" class="fr-report">
      <div class="fr-report-head">
        <span v-if="applyError" class="fr-report-err">{{ applyError }}</span>
        <template v-else>
          <span class="fr-report-ok">脚本输出</span>
          <span v-for="p in applyPaths" :key="p" class="fr-report-path">{{ p }}</span>
        </template>
      </div>
      <pre v-if="applyReport" class="fr-report-body no-scrollbar">{{ applyReport }}</pre>
    </section>

    <footer class="fr-foot">
      <button type="button" class="fr-btn" :disabled="applying || applyReady === false" @click="runApply(false)">预演（不落盘）</button>
      <button type="button" class="fr-btn primary" :disabled="applying || !accepted || applyReady === false" @click="runApply(true)">
        {{ applying ? '正在生成…' : `生成副表（采纳 ${accepted} 条）` }}
      </button>
      <span v-if="applyReady === false" class="fr-hint err">
        落盘服务未就绪：dev server 需要重启一次（<code>vite.config.ts</code> 改动后偶发「重启读到旧配置」）——
        在你那个终端里 Ctrl+C 后重新 <code>npm run dev</code>，再刷新本页
      </span>
      <span v-else class="fr-hint">
        写入 <code>appendix/references.csv</code> 与 <code>overrides.csv</code>（原文件另存 .bak），
        并输出合入清单到 <code>outputs/</code>；决定与驳回理由留在 <code>data/feedback/decisions.json</code>。
        <template v-if="canBackfill">采纳的行会自动回填 Supabase（status=accepted / applied=true），驳回的置为 rejected。</template>
        <template v-else>
          Supabase 状态<b>不会</b>回填（未配置 service key）—— 见下方脚本输出里的说明，或用输出的 SQL 在 Supabase 执行。
        </template>
      </span>
    </footer>
  </div>
</template>

<style scoped>
/* 整屏固定层：DEV 工作台要独占视口 —— 100vh 会被顶部的公告条顶下去约 50px，
   导致底部命令栏落到折叠线以下；fixed 之后顶部/底部工具条各自 flex:none，只有两栏内部滚动 */
.fr { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; overflow: hidden; background: #0a0c10; color: var(--white-70); }
.fr-bar, .fr-filters, .fr-foot, .fr-msg { flex: none; }
.fr-bar { display: flex; align-items: center; gap: 0.9rem; padding: 0.7rem 1.1rem; border-bottom: 1px solid var(--white-08); }
.fr-title { margin: 0; font-size: var(--font-sm); font-weight: 700; color: var(--white-90); letter-spacing: 0.06em; }
.fr-dev { font-size: var(--font-micro); color: #0a0c10; background: var(--color-accent-soft); border-radius: 3px; padding: 0 0.3rem; }
.fr-src { font-size: var(--font-micro); color: var(--white-30); }
.fr-stats { display: flex; gap: 0.7rem; font-size: var(--font-tiny); color: var(--white-45); }
.fr-stats .ok { color: #43c96a; }
.fr-stats .no { color: #e2564b; }
.fr-stats .dim { color: var(--white-25); }
.fr-progress { flex: 1; height: 3px; min-width: 60px; background: var(--white-08); border-radius: 999px; overflow: hidden; }
.fr-progress span { display: block; height: 100%; background: var(--color-accent); transition: width 0.2s; }
.fr-actions { display: flex; align-items: center; gap: 0.4rem; }
.fr-btn { padding: 0.35rem 0.7rem; background: var(--white-04); border: 1px solid var(--white-12); border-radius: var(--v2-r-sm); color: var(--white-70); font-size: var(--font-tiny); cursor: pointer; }
.fr-btn:hover { color: var(--white-90); border-color: var(--white-25); }
.fr-save { font-size: var(--font-micro); color: var(--white-25); }
.fr-save.on { color: #43c96a; }
.fr-filters { display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 1.1rem; border-bottom: 1px solid var(--white-05); }
.fr-input { padding: 0.3rem 0.5rem; background: var(--white-04); border: 1px solid var(--white-10); border-radius: var(--v2-r-sm); color: var(--white-80); font-size: var(--font-tiny); }
.fr-search { flex: 0 1 260px; }
.fr-check { display: flex; align-items: center; gap: 0.3rem; font-size: var(--font-tiny); color: var(--white-45); }
.fr-filtered { margin-left: auto; font-size: var(--font-micro); color: var(--white-30); }
.fr-msg { margin: 0; padding: 0.4rem 1.1rem; font-size: var(--font-tiny); color: var(--white-45); background: var(--white-02); }
.fr-msg.err { color: #e2564b; }
/* 两栏各自滚动的前提：grid 行必须是「可用高度」而不是按内容撑高（minmax(0,1fr)），
   且两个 grid item 允许收缩（min-height: 0）—— 否则内容一长就把行顶高、整页溢出而非内部滚动 */
.fr-main { flex: 1; display: grid; grid-template-columns: 360px 1fr; grid-template-rows: minmax(0, 1fr); min-height: 0; }
.fr-main > * { min-height: 0; }
.fr-main > :first-child { border-right: 1px solid var(--white-08); }
@media (max-width: 1080px) { .fr-main { grid-template-columns: 280px 1fr; } }
.fr-foot { display: flex; align-items: center; gap: 0.8rem; padding: 0.6rem 1.1rem; border-top: 1px solid var(--white-08); }
.fr-btn.primary { color: #0a0c10; background: var(--color-accent-soft); border-color: var(--color-accent-soft); font-weight: 700; }
.fr-btn.primary:disabled, .fr-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.fr-report { flex: none; max-height: 34vh; display: flex; flex-direction: column; border-top: 1px solid var(--white-08); background: #070910; }
.fr-report-head { display: flex; flex-wrap: wrap; gap: 0.8rem; padding: 0.4rem 1.1rem; font-size: var(--font-micro); }
.fr-report-ok { color: #43c96a; }
.fr-report-err { color: #e2564b; }
.fr-report-path { color: var(--white-30); }
.fr-report-body { margin: 0; padding: 0 1.1rem 0.6rem; overflow: auto; font-size: var(--font-micro); line-height: 1.7; color: var(--white-55); white-space: pre-wrap; }
.fr-hint code { color: var(--color-accent-soft); }
.fr-hint.err { color: #e2564b; }
.fr-hint { font-size: var(--font-micro); color: var(--white-25); }
</style>
