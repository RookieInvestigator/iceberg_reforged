<script setup lang="ts">
// CorrectedMark：被社区订正过的词条角标（v1/v2 详情区共用）。
// 数据源 OVERRIDES_MAP_KEY（overrides.csv，workflow 回填；空表即全隐藏零开销）。
// 点图标展开：改了哪些字段 + 由谁订正（by 为合入时的显示名）。
import { computed, inject, ref } from 'vue';
import { PencilLine } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { OVERRIDES_MAP_KEY, type OverrideRecord } from '../../lib/injectionKeys';

const props = defineProps<{ itemId: string }>();

const { t } = useI18n();
const overridesMap = inject(OVERRIDES_MAP_KEY, new Map<string, OverrideRecord[]>());
const open = ref(false);
const records = computed(() => overridesMap.get(props.itemId) || []);
</script>

<template>
  <span v-if="records.length" class="corr">
    <button type="button" class="corr-btn" :aria-label="t('corrections')" :aria-expanded="open" @click="open = !open">
      <PencilLine :size="13" :stroke-width="2" />
    </button>
    <span v-if="open" class="corr-panel">
      <span v-for="(r, i) in records" :key="i" class="corr-row">
        <span class="corr-field">{{ r.field }}</span>
        <span class="corr-by">{{ t('correctedBy').replace('{name}', r.by || t('anonymousUser')) }}</span>
      </span>
    </span>
  </span>
</template>

<style scoped>
/* 小图标：13px 弱化，hover 才亮，不抢徽章 */
.corr { display: inline-flex; align-items: center; position: relative; }
.corr-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 6px;
  background: none; border: none; cursor: pointer; padding: 0;
  color: var(--white-35); transition: color 0.15s, background-color 0.15s;
}
.corr-btn:hover { color: var(--white-85); background-color: var(--white-05); }
/* 展开面板：行内弱化列表 */
.corr-panel {
  display: inline-flex; flex-wrap: wrap; gap: 4px 10px;
  margin-left: 6px; font-size: var(--font-xs); color: var(--white-55);
}
.corr-field {
  padding: 1px 6px; border-radius: 999px;
  border: 1px solid var(--white-12); color: var(--white-60);
}
.corr-by { color: var(--white-40); }
</style>
