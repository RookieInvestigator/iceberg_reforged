<script setup lang="ts">
// V2EntryMetaBadges（/v2 专用）：v1 EntryMetaBadges 原件冻结，新建 V2 版（审计 A7）。
// 差异：徽章是术语表深链（L1）+ 反向回路（L2 经 HandbookView）+ 同构数据收敛 + 语义化 ul/li。
// props 与 v1 签名兼容（tags 收紧为 string[]，归一化上移到 lib/tags.ts）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '../../lib/useI18n'
import { getCriteriaDescMap, getShortMap, handbookLink, stripMdEm } from '../../lib/handbook'
import { clearTipFit, fitTipIntoView } from '../../lib/fitTip'
import { normalizeTags } from '../../lib/tags'
import rawMd from '../../data/handbook.md?raw'

const props = defineProps<{
  tier?: string
  category: string
  categoryColor: string
  tags?: string[]
}>()

interface Badge {
  key: string
  kind: 'tier' | 'category' | 'tag'
  label: string
  color?: string
  to?: { path: string; query: Record<string, string> }
  /** hover 预览：术语表「划定标准」节对应释义（无则回退待补充） */
  desc?: string
}

const route = useRoute()
const { t } = useI18n()

function tipLinkOf(e: Event): HTMLElement | null {
  const el = e.target as HTMLElement | null
  return el?.closest?.('a.meta-chip') as HTMLElement | null
}
// tip 宽度自适应：hover/聚焦时量好再摆，超界平移收回弹窗内
function onTipHover(e: Event) {
  fitTipIntoView(tipLinkOf(e))
}
function onTipOut(e: Event) {
  const link = tipLinkOf(e)
  const to = (e as MouseEvent).relatedTarget as HTMLElement | null
  if (link && link !== to?.closest?.('a.meta-chip')) clearTipFit(link)
}
const badges = computed<Badge[]>(() => {
  const from = route.path
  const descMap = getCriteriaDescMap(rawMd)
  const shortMap = getShortMap(rawMd)
  const pending = t('handbookPending')
  // hover 优先短版（md 短版行），无则回退全文（tip 截断为预览）；`==` 强调标记只留文字
  const descOf = (name: string) => stripMdEm(shortMap[name] || descMap[name] || pending)
  return [
    ...(props.tier ? [{ key: `t:${props.tier}`, kind: 'tier', label: props.tier } as Badge] : []),
    {
      key: `c:${props.category}`,
      kind: 'category',
      label: props.category,
      color: props.categoryColor,
      to: handbookLink('criteria', props.category, from),
      desc: descOf(props.category),
    },
    ...normalizeTags(props.tags).map((tag) => ({
      key: `g:${tag}`,
      kind: 'tag' as const,
      label: tag,
      to: handbookLink('criteria', tag, from),
      desc: descOf(tag),
    })),
  ]
})
</script>

<template>
  <ul class="meta-row" @mouseover="onTipHover" @mouseout="onTipOut" @focusin="onTipHover" @focusout="onTipOut">
    <li v-for="b in badges" :key="b.key" class="meta-item">
      <component
        :is="b.to ? 'router-link' : 'span'"
        :to="b.to"
        class="meta-chip"
        :class="`meta-chip--${b.kind}`"
        :style="b.color ? { '--cat': b.color } : undefined"
      >
        <span v-if="b.kind === 'tag'" aria-hidden="true">#</span>{{ b.label }}
        <span v-if="b.to" class="meta-tip" aria-hidden="true">{{ b.desc }}</span>
      </component>
    </li>
  </ul>
</template>

<style scoped>
/* 与 v1 同视觉（tier 弱框 / 分类色描边 / 标签裸字），只收结构：ul/li + 圆角进 v2 三档 */
.meta-row {
  display: flex; flex-wrap: wrap; align-items: center;
  column-gap: 0.75rem; row-gap: 0.375rem;
  margin: 0; padding: 0; list-style: none;
}
.meta-item { display: inline-flex; }
.meta-chip {
  display: inline-flex; align-items: center;
  font-size: var(--font-tiny); font-weight: 500;
  text-decoration: none;
}
.meta-chip--tier,
.meta-chip--category {
  padding: 1px 0.375rem;
  border-radius: 8px;
  border: 1px solid var(--white-15);
  background: rgba(255, 255, 255, 0.03);
  color: var(--white-50);
}
.meta-chip--category { color: var(--cat); border-color: var(--cat); background: rgba(255, 255, 255, 0.03); }
.meta-chip--tag { color: var(--white-55); }
a.meta-chip:hover { filter: brightness(1.35); }
/* hover 类 tooltip：徽章释义预览，纯 CSS，键盘聚焦同显。
 * 相对徽章居中、出在徽章下方（吸顶头会盖住上方）。
 * 行首行尾徽章的 tip 可能轻微超出弹窗边界，属已知可接受范围（hover 瞬态提示）。 */
.meta-chip { position: relative; }
.meta-tip {
  position: absolute; top: calc(100% + 6px); left: 50%;
  transform: translateX(-50%) translateY(-2px);
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
  overflow: hidden;
  width: max-content; max-width: min(260px, calc(100vw - 48px));
  padding: 6px 10px; border-radius: 8px; text-align: left;
  background: var(--color-tooltip-bg); color: var(--color-tooltip-text);
  border: 1px solid rgba(10, 12, 16, 0.12);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  font-size: var(--font-xs); font-weight: 400; line-height: 1.6;
  opacity: 0; pointer-events: none; z-index: 5;
  transition: opacity 0.15s, transform 0.15s;
}
.meta-item:hover .meta-tip,
.meta-item:focus-within .meta-tip {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
</style>
