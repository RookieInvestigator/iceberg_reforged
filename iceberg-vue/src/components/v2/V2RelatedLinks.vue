<script setup lang="ts">
// V2RelatedLinks（/v2 专用）：v1 EntryRelatedLinks 原件冻结，新建 V2 版（审计 A9）。
// 差异：删 variant 双分支（形态交给容器 CSS，见下方 .v2rel--card / .v2rel--sheet）；
// navigate 携带 from（来源词条 id），供 A3 探索轨迹记录「从哪跳来」。
import { computed } from 'vue'
import { useI18n } from '../../lib/useI18n'

export interface RelatedEntry {
  id: string
  title: string
}

const props = defineProps<{
  related?: RelatedEntry[]
  recommended?: RelatedEntry[]
  /** 所在外壳：card（桌面弹窗）/ sheet（移动抽屉），只决定形态 */
  layout?: 'card' | 'sheet'
  /** 来源词条 id（A3 Trail 用） */
  from?: string
}>()
const emit = defineEmits<{ navigate: [{ id: string; from?: string }] }>()
const { t } = useI18n()

const groups = computed(() => [
  { key: 'rel', label: t('relatedItem'), items: props.related ?? [] },
  { key: 'rec', label: t('recommendedItem'), items: props.recommended ?? [] },
].filter((g) => g.items.length > 0))
</script>

<template>
  <div class="v2rel" :class="layout === 'sheet' ? 'v2rel--sheet' : 'v2rel--card'">
    <section v-for="g in groups" :key="g.key" class="v2rel__group">
      <h4 class="v2rel__label">{{ g.label }}</h4>
      <ul class="v2rel__list">
        <li v-for="r in g.items" :key="r.id">
          <button type="button" class="v2rel__chip" @click="emit('navigate', { id: r.id, from: props.from })">
            {{ r.title }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
/* 只管组内与组间节奏；末组下方到动作条的留白不在这里 ——
   margin-bottom 会与 .v2entry-actions 的 margin-top 折叠（相邻兄弟取 max），
   改大也只生效几个 px。那段留白由 V2EntryBody 用 padding-bottom 给。 */
.v2rel__group { margin: 0; }
.v2rel__group + .v2rel__group { margin-top: 0.75rem; }
.v2rel__label {
  margin: 0 0 0.375rem;
  font-size: var(--font-micro); font-weight: 700;
  text-transform: uppercase;
  /* 与 V2EntryBody 的参考标签同节奏：中文下 0.15em 过松 */
  letter-spacing: 0.08em;
  color: var(--white-50);
}
.v2rel__list {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin: 0; padding: 0; list-style: none;
}
.v2rel__chip {
  background: transparent; border: 1px solid transparent; border-radius: 8px;
  color: var(--white-60); cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
.v2rel__chip:hover { color: var(--white-90); background: rgba(255, 255, 255, 0.05); }
/* 桌面弹窗：单行流式小 chips */
.v2rel--card .v2rel__chip { min-height: 24px; padding: 2px 8px; font-size: var(--font-xs); }
/* 移动抽屉：44px 触控块 */
.v2rel--sheet .v2rel__chip { min-height: 44px; padding: 10px 12px; font-size: var(--font-xs); }
.v2rel--sheet .v2rel__chip:hover { border-color: var(--white-10); }
</style>
