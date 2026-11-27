<script setup lang="ts">
// V2RelatedLinks：关联词条区。形态交给容器 CSS（见下方 .v2rel--card / .v2rel--sheet）；
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
            <MirrorText :text="r.title" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.v2rel__group { margin: 0; }
.v2rel__group + .v2rel__group { margin-top: 0.75rem; }
.v2rel__label {
  margin: 0 0 0.3rem;
  font-size: var(--font-micro); font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--white-50);
}
.v2rel__list {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin: 0; padding: 0; list-style: none;
}
.v2rel__chip {
  background: transparent; border: 1px solid transparent; border-radius: 8px;
  color: var(--white-60); cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
.v2rel__chip:hover { color: var(--white-90); background: var(--white-05); }
/* 桌面弹窗：单行流式小 chips，左负距让文字左边沿与分组标签对齐 */
.v2rel--card .v2rel__list { margin-left: -8px; gap: 2px 4px; }
.v2rel--card .v2rel__chip { min-height: 26px; padding: 2px 8px; font-size: var(--font-xs); text-align: left; }
/* 移动抽屉：轻描边触控胶囊，避免透明热区撑开大段空白 */
.v2rel--sheet .v2rel__list { margin-left: 0; gap: 6px; }
.v2rel--sheet .v2rel__chip {
  min-height: 38px;
  padding: 7px 12px;
  font-size: var(--font-xs);
  line-height: 1.35;
  text-align: left;
  background: var(--white-03);
  border-color: var(--white-08);
}
.v2rel--sheet .v2rel__chip:hover,
.v2rel--sheet .v2rel__chip:active {
  background: var(--white-06);
  border-color: var(--white-16);
}
</style>
