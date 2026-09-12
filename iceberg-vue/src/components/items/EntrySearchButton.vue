<script setup lang="ts">
// EntrySearchButton：词条弹窗标题右侧的外搜按钮（四处复用：
// v2 桌面卡 header-actions、v2 抽屉标题行、v1 桌面弹窗 header-actions、v1 移动抽屉标题行）。
// 引擎走 settingsStore.searchEngine，URL 拼装收敛在 lib/searchEngine。
import { computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { Search } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import { searchEngine } from '../../lib/settingsStore';
import { buildSearchUrl, normalizeSearchEngine } from '../../lib/searchEngine';

const props = defineProps<{
  /** 词条标题：作为搜索关键词 */
  title: string
  /** touch：抽屉标题行用 44px 触控目标（桌面弹窗默认 32px 紧凑） */
  touch?: boolean
}>();

const { t } = useI18n();
const engine = useStore(searchEngine);
const href = computed(() => buildSearchUrl(normalizeSearchEngine(engine.value), props.title));
</script>

<template>
  <a :href="href" target="_blank" rel="noopener" class="entry-search-btn" :class="{ 'entry-search-btn--touch': touch }"
    :title="t('searchThisEntry')" :aria-label="t('searchThisEntry')">
    <Search :size="16" :stroke-width="2" />
  </a>
</template>

<style scoped>
/* 弱化图标按钮：与关闭 × 同排不抢视觉，hover 才亮 */
.entry-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--white-50);
  transition: color 0.15s, background-color 0.15s;
}
.entry-search-btn:hover { color: var(--white-90); background-color: var(--white-05); }
/* 抽屉标题行：44px 触控目标（移动端设置面板同标准） */
.entry-search-btn--touch { width: 44px; height: 44px; }
</style>
