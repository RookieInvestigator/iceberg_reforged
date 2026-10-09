<script setup lang="ts">
// V2EntryMetaBadges（/v2 专用）：v1 EntryMetaBadges 原件冻结，新建 V2 版（审计 A7）。
// 差异：徽章是术语表深链（L1）+ 反向回路（L2 经 HandbookView）+ 同构数据收敛 + 语义化 ul/li。
// props 与 v1 签名兼容（tags 收紧为 string[]，归一化上移到 lib/tags.ts）。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '../../lib/useI18n'
import { getCriteriaDescMap, getShortMap, handbookLink, stripMdEm } from '../../lib/handbook'
import { normalizeTags } from '../../lib/tags'
import TipBubble from '../ui/TipBubble.vue'
import rawMd from '../../data/handbook.md?raw'

const props = defineProps<{
  tier?: string
  category: string
  categoryColor: string
  tags?: string[]
  /** 多分类副表：副分类徽章（不含主分类，由调用方经 extraBadges 解析） */
  extra?: Array<{ category: string; color: string }>
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

// 气泡（含 hover/聚焦/点击三条展开路径 + 超界归位）统一交给 TipBubble：
// 徽章释义与标记备注不再各写一套定位与显隐逻辑。
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
    ...(props.extra || []).map((e) => ({
      key: `c:${e.category}`,
      kind: 'category' as const,
      label: e.category,
      color: e.color,
      to: handbookLink('criteria', e.category, from),
      desc: descOf(e.category),
    })),
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
  <ul class="meta-row">
    <li v-for="b in badges" :key="b.key" class="meta-item">
      <!-- 气泡统一走 TipBubble：与标记图标那三个小圆点用的是同一个组件、同一套样式 -->
      <TipBubble :text="b.desc">
        <component
          :is="b.to ? 'router-link' : 'span'"
          :to="b.to"
          class="meta-chip"
          :class="`meta-chip--${b.kind}`"
          :style="b.color ? { '--cat': b.color } : undefined"
        >
          <span v-if="b.kind === 'tag'" aria-hidden="true">#</span>{{ b.label }}
        </component>
      </TipBubble>
    </li>
    <!-- 徽章行尾：标记图标（警示 / 需补充 / 社区贡献）由调用方塞进来。
         用 li 包一层：本组件根是 ul，div 直接做子元素是非法 HTML -->
    <li v-if="$slots.default" class="meta-item"><slot /></li>
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
/* 气泡（徽章释义）已抽到 components/ui/TipBubble.vue + styles/v2.css 的
   .tip-anchor / .tip-bubble —— 与标记图标 tooltip 共用同一实现，这里不再留样式。 */
</style>
