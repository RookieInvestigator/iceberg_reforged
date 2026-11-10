<script setup lang="ts">
// 开发模式专用：词条数据总览（分布 / 质量 / 手册覆盖 / 互动数据）。
// 只在 DEV 路由里注册，生产构建不会产出这个 chunk。
// 视觉语言与其它 DEV 页共用：DevShell 提供页头与底色，类名走 styles/dev.css。
// 数据直接读原始 iceberg.json / meta.json，不经 normalizeData —— 这里要看的是「数据本身」。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Copy } from '@lucide/vue'
import DevShell from '../components/dev/DevShell.vue'
import raw from '../data/iceberg.json'
import meta from '../data/meta.json'
import handbookRaw from '../data/handbook.md?raw'
import { getCriteriaDescMap } from '../lib/handbook'
import { fetchInteractionStats, fetchUserTotal, type InteractionStats } from '../lib/dev/interactionStats'

interface RawItem {
  id: string
  title: string
  category: string
  tags?: string[]
  desc?: string
  link?: string
  createdAt?: number
  modifiedAt?: number
}

const router = useRouter()

const tiers = raw.tiers as Record<string, RawItem[]>
const tierOrder = raw.tierOrder as string[]
const categoryColors = raw.categoryColors as Record<string, string>
const allItems = computed<RawItem[]>(() => tierOrder.flatMap((t) => tiers[t] || []))
const total = computed(() => allItems.value.length)

const descOf = (it: RawItem) => (it.desc || '').trim()

/** id → 层级（互动表里显示，不必逐条 indexOf 扫 8 层） */
const tierOfMap = new Map<string, string>()
for (const tier of tierOrder) for (const it of tiers[tier] || []) tierOfMap.set(it.id, tier)
const tierOf = (id: string) => tierOfMap.get(id) || '—'

// ── 总览指标 ──
const kpi = computed(() => {
  const chars = allItems.value.reduce((s, it) => s + descOf(it).length, 0)
  const withLink = allItems.value.filter((it) => it.link).length
  return {
    total: total.value,
    tiers: tierOrder.length,
    categories: Object.keys(categoryColors).length,
    tags: Object.keys(meta.tagMap).length,
    chars,
    avgChars: total.value ? Math.round(chars / total.value) : 0,
    linkRate: total.value ? Math.round((withLink / total.value) * 100) : 0,
    generatedAt: new Date(meta.generatedAt * 1000).toISOString().slice(0, 10),
  }
})

// ── 分布：层级 / 分类 / 标签 / 描述长度 ──
const tierBars = computed(() => tierOrder.map((t) => ({ label: t, count: (tiers[t] || []).length })))

const catBars = computed(() => {
  const map = new Map<string, number>()
  for (const it of allItems.value) map.set(it.category, (map.get(it.category) || 0) + 1)
  return [...map.entries()]
    .map(([label, count]) => ({ label, count, color: categoryColors[label] || raw.defaultColor }))
    .sort((a, b) => b.count - a.count)
})

const tagBars = computed(() => {
  const map = new Map<string, number>()
  for (const it of allItems.value) for (const tag of it.tags || []) map.set(tag, (map.get(tag) || 0) + 1)
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
})
const maxTagCount = computed(() => tagBars.value[0]?.count || 1)

const descBuckets = computed(() => {
  const buckets = [
    { label: '空描述', count: 0 },
    { label: '≤50 字', count: 0 },
    { label: '51–150 字', count: 0 },
    { label: '151–400 字', count: 0 },
    { label: '>400 字', count: 0 },
  ]
  for (const it of allItems.value) {
    const n = descOf(it).length
    if (n === 0) buckets[0].count++
    else if (n <= 50) buckets[1].count++
    else if (n <= 150) buckets[2].count++
    else if (n <= 400) buckets[3].count++
    else buckets[4].count++
  }
  return buckets
})

// ── 每层画像 ──
const tierProfiles = computed(() =>
  tierOrder.map((t) => {
    const items = tiers[t] || []
    const n = items.length || 1
    const chars = items.reduce((s, it) => s + descOf(it).length, 0)
    const withLink = items.filter((it) => it.link).length
    const noTags = items.filter((it) => !(it.tags || []).length).length
    return {
      tier: t,
      count: items.length,
      avgChars: Math.round(chars / n),
      linkRate: Math.round((withLink / n) * 100),
      noTags: Math.round((noTags / n) * 100),
    }
  }),
)

// ── 质量问题（可展开全部，样本可点开词条）──
const NEW_WINDOW = 30 * 24 * 3600
const nowSec = Math.max(...allItems.value.map((it) => it.modifiedAt || 0))

const issues = computed(() => {
  const items = allItems.value
  const byTitle = new Map<string, RawItem[]>()
  for (const it of items) {
    const key = it.title.trim()
    byTitle.set(key, [...(byTitle.get(key) || []), it])
  }
  const dupes = [...byTitle.values()].filter((g) => g.length > 1)
  return [
    { key: '空描述', items: items.filter((it) => !descOf(it)) },
    { key: '短描述（<20 字）', items: items.filter((it) => descOf(it) && descOf(it).length < 20) },
    { key: '缺外链', items: items.filter((it) => !it.link) },
    { key: '缺标签', items: items.filter((it) => !(it.tags || []).length) },
    { key: '标题重复', items: dupes.flat() },
    {
      key: '近 30 天更新',
      items: items.filter((it) => (it.modifiedAt || 0) && nowSec - (it.modifiedAt || 0) <= NEW_WINDOW),
    },
  ]
})

const expanded = ref<Set<string>>(new Set())
const allExpanded = computed(() => issues.value.every((g) => g.items.length === 0 || expanded.value.has(g.key)))
function toggleIssue(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
function toggleAllIssues() {
  expanded.value = allExpanded.value ? new Set() : new Set(issues.value.map((g) => g.key))
}

// ── 手册覆盖 ──
const handbookCover = computed(() => {
  const descMap = getCriteriaDescMap(handbookRaw)
  const names = Object.values(meta.tagMap) as string[]
  const missing: string[] = []
  const placeholder: string[] = []
  let covered = 0
  for (const name of names) {
    const desc = (descMap[name] || '').trim()
    if (!desc) missing.push(name)
    else if (/^(?:待补充|待补|To be added)[。.！!]?$/.test(desc)) placeholder.push(name)
    else covered++
  }
  return { total: names.length, covered, placeholder, missing }
})

// ── 互动数据（异步：Supabase）──
const interLoading = ref(true)
const interError = ref('')
const stats = ref<InteractionStats | null>(null)
const userTotal = ref<number | null>(null)
const userTotalError = ref('')

const interRows = computed(() => {
  const s = stats.value
  if (!s) return []
  return allItems.value
    .map((it) => {
      const likes = s.likes.get(it.id) || 0
      const favs = s.favorites.get(it.id) || 0
      const comments = s.comments.get(it.id) || 0
      return { item: it, likes, favs, comments, score: likes * 2 + favs * 3 + comments * 5 }
    })
    .sort((a, b) => b.score - a.score)
})

const interTotals = computed(() => {
  const s = stats.value
  const emptyUsers = { likes: 0, favorites: 0, comments: 0, feedback: 0, any: 0 }
  const emptyFeedback = { total: 0, open: 0, accepted: 0, rejected: 0 }
  if (!s) return { likes: 0, favs: 0, comments: 0, users: emptyUsers, feedback: emptyFeedback, touched: 0 }
  let likes = 0
  let favs = 0
  let comments = 0
  for (const v of s.likes.values()) likes += v
  for (const v of s.favorites.values()) favs += v
  for (const v of s.comments.values()) comments += v
  const touched = interRows.value.filter((r) => r.score > 0).length
  return { likes, favs, comments, users: s.users, feedback: s.feedback, touched }
})

const interTop = computed(() => interRows.value.filter((r) => r.score > 0).slice(0, 10))
const interMaxScore = computed(() => interTop.value[0]?.score || 1)

const interQuery = ref('')
const interSort = ref<'score' | 'likes' | 'favs' | 'comments'>('score')
const onlyTouched = ref(false)
const interPage = ref(0)
const PAGE_SIZE = 40

const interFiltered = computed(() => {
  const q = interQuery.value.trim().toLowerCase()
  const rows = interRows.value.filter((r) => {
    if (onlyTouched.value && r.score === 0) return false
    if (!q) return true
    return r.item.title.toLowerCase().includes(q) || r.item.category.toLowerCase().includes(q)
  })
  const key = interSort.value
  return key === 'score' ? rows : [...rows].sort((a, b) => b[key] - a[key] || b.score - a.score)
})
const interPageCount = computed(() => Math.max(1, Math.ceil(interFiltered.value.length / PAGE_SIZE)))
const interPageRows = computed(() => {
  const page = Math.min(interPage.value, interPageCount.value - 1)
  return interFiltered.value.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
})

onMounted(async () => {
  const [inter, users] = await Promise.allSettled([
    fetchInteractionStats(allItems.value.map((it) => it.id)),
    fetchUserTotal(),
  ])
  if (inter.status === 'fulfilled') stats.value = inter.value
  else interError.value = inter.reason instanceof Error ? inter.reason.message : String(inter.reason)
  if (users.status === 'fulfilled') {
    userTotal.value = users.value.total
    userTotalError.value = users.value.error || ''
  } else {
    userTotalError.value = users.reason instanceof Error ? users.reason.message : String(users.reason)
  }
  interLoading.value = false
})

// ── 复制统计（Markdown）──
const copied = ref(false)
let copyTimer = 0
async function copyStats() {
  const lines = [
    `# 冰山图数据总览（${kpi.value.generatedAt}）`,
    '',
    `- 词条 ${kpi.value.total} · 层级 ${kpi.value.tiers} · 分类 ${kpi.value.categories} · 标签 ${kpi.value.tags}`,
    `- 描述总计 ${kpi.value.chars} 字，平均 ${kpi.value.avgChars} 字；外链率 ${kpi.value.linkRate}%`,
    `- 互动：点赞 ${interTotals.value.likes} · 收藏 ${interTotals.value.favs} · 评论 ${interTotals.value.comments}`,
    `- 用户：参与 ${interTotals.value.users.any}（赞 ${interTotals.value.users.likes} / 藏 ${interTotals.value.users.favorites} / 评 ${interTotals.value.users.comments} / 反馈 ${interTotals.value.users.feedback}）`,
    `- 反馈：共 ${interTotals.value.feedback.total}（待审 ${interTotals.value.feedback.open} / 采纳 ${interTotals.value.feedback.accepted} / 驳回 ${interTotals.value.feedback.rejected}）`,
    '',
    '## 层级分布',
    ...tierBars.value.map((b) => `- ${b.label}: ${b.count}`),
    '',
    '## 分类分布',
    ...catBars.value.map((b) => `- ${b.label}: ${b.count}`),
    '',
    '## 质量问题',
    ...issues.value.map((g) => `- ${g.key}: ${g.items.length}`),
    '',
    '## 手册覆盖',
    `- 标签释义 ${handbookCover.value.covered}/${handbookCover.value.total}；占位 ${handbookCover.value.placeholder.length}；缺 ${handbookCover.value.missing.length}`,
  ]
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copied.value = true
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* 剪贴板不可用时静默失败 */
  }
}

function openEntry(id: string) {
  router.push({ path: '/', hash: `#${id}` })
}

function barWidth(count: number, max: number) {
  return `${Math.max(2, Math.round((count / max) * 100))}%`
}
</script>

<template>
  <DevShell title="词条数据总览" layout="page">
    <template #subtitle>数据快照 {{ kpi.generatedAt }} · 点击任意样本可跳到该词条</template>
    <template #actions>
      <button type="button" class="dev-btn dev-btn--primary dd-copy" @click="copyStats">
        <component :is="copied ? Check : Copy" :size="12" :stroke-width="2" />
        {{ copied ? '已复制' : '复制统计' }}
      </button>
    </template>

    <!-- KPI -->
    <section class="dev-kpis dd-block">
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.total }}</span><span class="dev-kpi-label">词条</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.tiers }}</span><span class="dev-kpi-label">层级</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.categories }}</span><span class="dev-kpi-label">分类</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.tags }}</span><span class="dev-kpi-label">标签</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.chars.toLocaleString() }}</span><span class="dev-kpi-label">描述字数</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.avgChars }}</span><span class="dev-kpi-label">平均字数</span></div>
      <div class="dev-kpi"><span class="dev-kpi-num">{{ kpi.linkRate }}%</span><span class="dev-kpi-label">外链率</span></div>
    </section>

    <div class="dev-grid dd-block">
      <section class="dev-card">
        <h2 class="dev-h2">按层级</h2>
        <div class="dev-bars">
          <div v-for="b in tierBars" :key="b.label" class="dev-bar-row">
            <span class="dev-bar-label">{{ b.label }}</span>
            <span class="dev-bar"><span class="dev-bar-fill" :style="{ width: barWidth(b.count, kpi.total / 2) }" /></span>
            <span class="dev-bar-num">{{ b.count }}</span>
          </div>
        </div>
      </section>

      <section class="dev-card">
        <h2 class="dev-h2">按分类</h2>
        <div class="dev-bars">
          <div v-for="b in catBars" :key="b.label" class="dev-bar-row">
            <span class="dev-bar-label">{{ b.label }}</span>
            <span class="dev-bar"><span class="dev-bar-fill" :style="{ width: barWidth(b.count, catBars[0]?.count || 1), background: b.color }" /></span>
            <span class="dev-bar-num">{{ b.count }}</span>
          </div>
        </div>
      </section>

      <section class="dev-card">
        <h2 class="dev-h2">标签 Top 20</h2>
        <div class="dev-bars">
          <div v-for="b in tagBars" :key="b.label" class="dev-bar-row">
            <span class="dev-bar-label">{{ b.label }}</span>
            <span class="dev-bar"><span class="dev-bar-fill" :style="{ width: barWidth(b.count, maxTagCount) }" /></span>
            <span class="dev-bar-num">{{ b.count }}</span>
          </div>
        </div>
      </section>

      <section class="dev-card">
        <h2 class="dev-h2">描述长度分布</h2>
        <div class="dev-bars">
          <div v-for="b in descBuckets" :key="b.label" class="dev-bar-row">
            <span class="dev-bar-label">{{ b.label }}</span>
            <span class="dev-bar"><span class="dev-bar-fill" :style="{ width: barWidth(b.count, descBuckets[0].count || 1) }" /></span>
            <span class="dev-bar-num">{{ b.count }}</span>
          </div>
        </div>
      </section>

      <section class="dev-card dev-card--wide">
        <h2 class="dev-h2">每层画像</h2>
        <table class="dev-table">
          <thead>
            <tr><th>层级</th><th>词条</th><th>平均字数</th><th>外链率</th><th>无标签率</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in tierProfiles" :key="p.tier">
              <td>{{ p.tier }}</td>
              <td>{{ p.count }}</td>
              <td>{{ p.avgChars }}</td>
              <td>{{ p.linkRate }}%</td>
              <td>{{ p.noTags }}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 质量问题：默认 8 个样本，展开后整组列出（限高滚动） -->
      <section class="dev-card dev-card--wide">
        <div class="dev-h2-row">
          <h2 class="dev-h2">质量问题</h2>
          <button type="button" class="dev-btn" @click="toggleAllIssues">
            {{ allExpanded ? '全部收起' : '全部展开' }}
          </button>
        </div>
        <div class="dd-issues">
          <div v-for="g in issues" :key="g.key" class="dd-issue">
            <div class="dd-issue-head">
              <span class="dd-issue-key">{{ g.key }}</span>
              <span class="dd-issue-side">
                <span class="dd-issue-count" :class="{ 'is-zero': g.items.length === 0 }">{{ g.items.length }}</span>
                <button v-if="g.items.length" type="button" class="dev-btn dd-issue-toggle" @click="toggleIssue(g.key)">
                  {{ expanded.has(g.key) ? '收起' : '展开' }}
                </button>
              </span>
            </div>
            <div v-if="g.items.length" class="dd-issue-samples" :class="{ 'is-expanded': expanded.has(g.key) }">
              <button
                v-for="it in expanded.has(g.key) ? g.items : g.items.slice(0, 8)"
                :key="it.id"
                type="button"
                class="dd-sample"
                :title="`${it.title} · ${it.category}`"
                @click="openEntry(it.id)"
              >{{ it.title }}</button>
              <button
                v-if="!expanded.has(g.key) && g.items.length > 8"
                type="button"
                class="dd-sample dd-sample--more"
                @click="toggleIssue(g.key)"
              >+{{ g.items.length - 8 }} 展开全部</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 互动数据 -->
      <section class="dev-card dev-card--wide">
        <h2 class="dev-h2">互动数据</h2>
        <p v-if="interLoading" class="dev-note">正在从 Supabase 读取…</p>
        <p v-else-if="interError" class="dev-note dev-note--err">读取失败：{{ interError }}</p>
        <template v-else>
          <div class="dev-kpis dev-kpis--tight dd-block-sm">
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.likes }}</span><span class="dev-kpi-label">点赞</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.favs }}</span><span class="dev-kpi-label">收藏</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.comments }}</span><span class="dev-kpi-label">评论</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.touched }}</span><span class="dev-kpi-label">有互动词条</span></div>
          </div>

          <h3 class="dev-h3">用户</h3>
          <div class="dev-kpis dev-kpis--tight dd-block-sm">
            <div class="dev-kpi"><span class="dev-kpi-num">{{ userTotal ?? '—' }}</span><span class="dev-kpi-label">注册用户</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.users.any }}</span><span class="dev-kpi-label">参与用户</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.users.comments }}</span><span class="dev-kpi-label">评论用户</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.users.feedback }}</span><span class="dev-kpi-label">反馈用户</span></div>
          </div>
          <p v-if="userTotalError" class="dev-note dev-note--err">
            注册用户数读不到：{{ userTotalError }}
          </p>
          <p class="dev-note">
            点赞 / 收藏的用户维度读不到：这两张表对 anon 只放行自己的行（RLS），只能拿到计数（{{ interTotals.likes }} / {{ interTotals.favs }}）。
            注册用户总数需要 service_role，前端取不到。
          </p>

          <h3 class="dev-h3">反馈提交</h3>
          <div class="dev-kpis dev-kpis--tight dd-block-sm">
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.feedback.total }}</span><span class="dev-kpi-label">反馈条数</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.feedback.open }}</span><span class="dev-kpi-label">待审</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.feedback.accepted }}</span><span class="dev-kpi-label">已采纳</span></div>
            <div class="dev-kpi"><span class="dev-kpi-num">{{ interTotals.feedback.rejected }}</span><span class="dev-kpi-label">已驳回</span></div>
          </div>

          <h3 class="dev-h3">互动榜 Top 10</h3>
          <div v-if="interTop.length" class="dev-bars">
            <div v-for="r in interTop" :key="r.item.id" class="dev-bar-row">
              <button type="button" class="dev-bar-label dev-link" :title="r.item.title" @click="openEntry(r.item.id)">{{ r.item.title }}</button>
              <span class="dev-bar"><span class="dev-bar-fill" :style="{ width: barWidth(r.score, interMaxScore) }" /></span>
              <span class="dev-bar-num">{{ r.score }}</span>
            </div>
          </div>
          <p v-else class="dev-note">还没有互动记录。</p>

          <h3 class="dev-h3">每词条互动明细</h3>
          <div class="dd-tools">
            <input v-model="interQuery" class="dev-input dd-search" type="search" placeholder="搜索标题 / 分类" @input="interPage = 0" />
            <label class="dev-check"><input v-model="onlyTouched" type="checkbox" @change="interPage = 0" /> 只看有互动</label>
            <div class="dd-sorts">
              排序：
              <button
                v-for="s in [{ k: 'score', label: '综合' }, { k: 'likes', label: '赞' }, { k: 'favs', label: '藏' }, { k: 'comments', label: '评' }]"
                :key="s.k"
                type="button"
                class="dev-btn"
                :class="{ 'is-active': interSort === s.k }"
                @click="interSort = s.k as typeof interSort"
              >{{ s.label }}</button>
            </div>
          </div>
          <table class="dev-table dd-table">
            <thead>
              <tr><th>标题</th><th>层级</th><th>分类</th><th>字数</th><th>赞</th><th>藏</th><th>评</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in interPageRows" :key="r.item.id">
                <td class="dd-cell-title"><button type="button" class="dev-link" @click="openEntry(r.item.id)">{{ r.item.title }}</button></td>
                <td>{{ tierOf(r.item.id) }}</td>
                <td>{{ r.item.category }}</td>
                <td>{{ descOf(r.item).length }}</td>
                <td>{{ r.likes || '—' }}</td>
                <td>{{ r.favs || '—' }}</td>
                <td>{{ r.comments || '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="dd-pager">
            <button type="button" class="dev-btn" :disabled="interPage === 0" @click="interPage--">← 上一页</button>
            <span>{{ Math.min(interPage + 1, interPageCount) }} / {{ interPageCount }}</span>
            <button type="button" class="dev-btn" :disabled="interPage >= interPageCount - 1" @click="interPage++">下一页 →</button>
          </div>
        </template>
      </section>

      <!-- 手册覆盖 -->
      <section class="dev-card dev-card--wide">
        <h2 class="dev-h2">手册标签释义覆盖</h2>
        <div class="dev-kpis dev-kpis--tight dd-block-sm">
          <div class="dev-kpi"><span class="dev-kpi-num">{{ handbookCover.covered }}</span><span class="dev-kpi-label">有释义</span></div>
          <div class="dev-kpi"><span class="dev-kpi-num">{{ handbookCover.placeholder.length }}</span><span class="dev-kpi-label">占位</span></div>
          <div class="dev-kpi"><span class="dev-kpi-num">{{ handbookCover.missing.length }}</span><span class="dev-kpi-label">缺</span></div>
          <div class="dev-kpi"><span class="dev-kpi-num">{{ handbookCover.total }}</span><span class="dev-kpi-label">标签总数</span></div>
        </div>
        <p v-if="handbookCover.missing.length" class="dev-note">缺释义：{{ handbookCover.missing.join('、') }}</p>
      </section>
    </div>
  </DevShell>
</template>

<style scoped>
.dd-copy { display: inline-flex; align-items: center; gap: 0.35rem; }

.dd-block { margin-bottom: 1rem; }
.dd-block-sm { margin-bottom: 0.6rem; }
.dd-search { flex: 1 1 12rem; }

/* 质量问题：默认 8 个样本，展开后整组列出（限高滚动，页面不被撑爆） */
.dd-issues { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.dd-issue { padding: 0.7rem 0.8rem; border-radius: 8px; background: var(--white-02); border: 1px solid var(--white-05); }
.dd-issue-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.dd-issue-key { font-size: var(--font-xs); color: var(--white-70); }
.dd-issue-side { display: inline-flex; align-items: center; gap: 0.45rem; }
.dd-issue-count { font-size: 1rem; font-weight: 700; color: var(--color-accent-soft); font-variant-numeric: tabular-nums; }
.dd-issue-count.is-zero { color: var(--white-25); }
.dd-issue-toggle { padding: 0.1rem 0.45rem; font-size: var(--font-micro); }
.dd-issue-samples { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.5rem; }
.dd-issue-samples.is-expanded {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  max-height: 15rem;
  overflow-y: auto;
  padding-right: 0.2rem;
}
.dd-sample {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--white-08);
  background: none;
  cursor: pointer;
  color: var(--white-55);
  font-size: var(--font-micro);
  text-align: left;
  transition: color 0.15s, border-color 0.15s;
}
.dd-sample:hover { color: var(--white-90); border-color: var(--white-20); }
.dd-sample--more { color: var(--color-accent-soft); border-color: var(--white-12); }

.dd-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin: 0.4rem 0 0.7rem; }
.dd-sorts { display: inline-flex; align-items: center; gap: 0.35rem; font-size: var(--font-micro); color: var(--white-40); }
.dd-table { margin-top: 0.2rem; }
.dd-cell-title { max-width: 20rem; }
.dd-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.7rem;
  font-size: var(--font-micro);
  color: var(--white-40);
  font-variant-numeric: tabular-nums;
}
</style>
