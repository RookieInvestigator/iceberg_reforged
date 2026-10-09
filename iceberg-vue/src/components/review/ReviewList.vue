<script setup lang="ts">
// ReviewList：工作台左栏清单（DOM 列表，非虚拟滚动 —— 本次 189 条量级，够用且可直接用浏览器搜索）
import { hasEdits, kindOf, type DecisionMap, type FeedbackRow } from '../../lib/feedbackReview'
import { sourceLabel } from '../../lib/sourceLabel'

defineProps<{
  rows: FeedbackRow[]
  titles: Record<string, string>
  decisions: DecisionMap
  activeIndex: number
}>()
const emit = defineEmits<{ pick: [index: number] }>()

const KIND_LABEL: Record<string, string> = { link: '链接', desc: '描述', title: '标题', meta: '分类/标签', mixed: '混合' }
</script>

<template>
  <div class="rl no-scrollbar">
    <p v-if="!rows.length" class="rl-empty">没有可审的行</p>
    <button
      v-for="(r, i) in rows" :key="r.id" type="button" class="rl-row"
      :class="['d-' + (decisions[r.id]?.decision || 'none'), { on: i === activeIndex }]"
      @click="emit('pick', i)"
    >
      <span class="rl-dot" aria-hidden="true" />
      <span class="rl-main">
        <span class="rl-title">{{ titles[r.itemId] || r.itemId }}</span>
        <span class="rl-meta">
          <span class="rl-kind">{{ KIND_LABEL[kindOf(r)] }}</span>
          <span v-if="r.status !== 'open'" class="rl-status" :class="'s-' + r.status">
            {{ r.status === 'accepted' ? (r.applied ? '已合入' : '已采纳') : r.status === 'rejected' ? '已驳回' : r.status }}
          </span>
          <span v-if="r.link" class="rl-host">{{ sourceLabel(r.link) }}</span>
          <span v-if="r.unsupported.length" class="rl-warn" :title="'暂不支持落盘：' + r.unsupported.join(' / ')">!</span>
          <span v-if="hasEdits(decisions[r.id]?.edits)" class="rl-edit" title="已就地修改（只进本地落盘）">✎</span>
        </span>
      </span>
      <span class="rl-id">#{{ r.id }}</span>
    </button>
  </div>
</template>

<style scoped>
.rl { display: flex; flex-direction: column; overflow-y: auto; height: 100%; min-height: 0; }
.rl-empty { margin: auto; color: var(--white-30); font-size: var(--font-xs); }
.rl-row {
  display: flex; align-items: flex-start; gap: 0.5rem; width: 100%;
  padding: 0.55rem 0.7rem; background: none; border: none; cursor: pointer; text-align: left;
  border-bottom: 1px solid var(--white-05); transition: background-color 0.12s;
}
.rl-row:hover { background: var(--white-04); }
.rl-row.on { background: var(--white-08); }
.rl-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; margin-top: 0.45rem; background: var(--white-15); }
.d-accept .rl-dot { background: #43c96a; }
.d-reject .rl-dot { background: #e2564b; }
.d-later .rl-dot { background: var(--white-40); }
.rl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.rl-title { font-size: var(--font-xs); color: var(--white-85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-meta { display: flex; align-items: center; gap: 0.45rem; font-size: var(--font-micro); color: var(--white-30); }
.rl-kind { padding: 0 0.35rem; border: 1px solid var(--white-12); border-radius: 999px; }
/* 库里状态（回看已审条目时一眼看出结论）；仅非 open 显示 */
.rl-status { padding: 0 0.35rem; border-radius: 999px; border: 1px solid transparent; }
.rl-status.s-accepted { color: #43c96a; border-color: color-mix(in srgb, #43c96a 45%, transparent); }
.rl-status.s-rejected { color: #e2564b; border-color: color-mix(in srgb, #e2564b 45%, transparent); }
.rl-host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl-warn { color: var(--color-accent-soft); font-weight: 700; }
.rl-edit { color: var(--color-accent-soft); }
.rl-id { flex: none; font-size: var(--font-micro); color: var(--white-25); font-variant-numeric: tabular-nums; }
</style>
