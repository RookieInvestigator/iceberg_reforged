<script setup lang="ts">
// EntryMarks：徽章行尾的**标记图标** —— 警示 / 需补充 / 社区贡献，三个小圆图标并列。
//
// 数据源都是副表：警示与需补充来自 `extra.csv`（行的存在即该标记为真，`note` 是 hover 提示），
// 社区贡献来自 `contributors.csv`（只给名字，**不带日期**）。没有标记就整行不渲染。
//
// 气泡一律用 components/ui/TipBubble.vue（与徽章释义同一个组件、同一套样式与展开路径），
// 本组件不再自带任何 tooltip 样式。
import { computed, inject } from 'vue'
import { CircleDashed, PenLine, TriangleAlert } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import TipBubble from '../ui/TipBubble.vue'
import { CONTRIBUTORS_MAP_KEY, EXTRA_MAP_KEY } from '../../lib/injectionKeys'
import { contributorLabel, type ContributorRecord, type ExtraRecord } from '../../lib/iceberg/appendix'

const props = defineProps<{ itemId: string }>()
const { t } = useI18n()

const extraMap = inject(EXTRA_MAP_KEY, new Map<string, ExtraRecord[]>())
const contributorsMap = inject(CONTRIBUTORS_MAP_KEY, new Map<string, ContributorRecord[]>())

const marks = computed(() => {
  const out: Array<{ key: string; kind: 'warn' | 'need' | 'who'; text: string }> = []
  const extra = extraMap.get(props.itemId) || []
  const warn = extra.find((r) => r.flag === 'warn')
  const need = extra.find((r) => r.flag === 'need')
  if (warn) out.push({ key: 'warn', kind: 'warn', text: warn.note || t('markWarn') })
  if (need) out.push({ key: 'need', kind: 'need', text: need.note || t('markNeed') })
  const who = contributorLabel(contributorsMap.get(props.itemId))
  if (who) out.push({ key: 'who', kind: 'who', text: t('contributedBy').replace('{name}', who) })
  return out
})
</script>

<template>
  <div v-if="marks.length" class="marks" :aria-label="t('corrections')" role="group">
    <TipBubble v-for="m in marks" :key="m.key" :text="m.text">
      <button type="button" class="mark" :class="m.kind" :aria-label="m.text">
        <TriangleAlert v-if="m.kind === 'warn'" :size="12" :stroke-width="2.2" />
        <CircleDashed v-else-if="m.kind === 'need'" :size="12" :stroke-width="2.2" />
        <PenLine v-else :size="12" :stroke-width="2.2" />
      </button>
    </TipBubble>
  </div>
</template>

<style scoped>
/* 气泡样式不在这里：走 components/ui/TipBubble.vue + styles/v2.css 的 .tip-anchor/.tip-bubble */
.marks { display: inline-flex; align-items: center; gap: 4px; }
.mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: 1px solid var(--white-10); border-radius: 999px;
  background: var(--white-04); color: var(--white-55);
  cursor: pointer; transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}
.mark:hover, .mark:focus-visible { background: var(--white-08); border-color: var(--white-25); }
.mark.warn { color: color-mix(in srgb, var(--color-danger) 78%, var(--white-55)); }
.mark.warn:hover, .mark.warn:focus-visible { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 45%, transparent); }
.mark.need { color: color-mix(in srgb, var(--color-fav) 78%, var(--white-55)); }
.mark.need:hover, .mark.need:focus-visible { color: var(--color-fav); border-color: color-mix(in srgb, var(--color-fav) 45%, transparent); }
.mark.who:hover, .mark.who:focus-visible { color: var(--white-90); }
</style>
