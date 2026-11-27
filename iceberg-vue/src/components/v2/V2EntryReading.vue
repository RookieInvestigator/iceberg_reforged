<script setup lang="ts">
// V2EntryReading：词条正文里的「推荐阅读书目」区（书 / 论文）。
// 数据来自副表 reading.csv（一行 = 某词条 → 一本书；同一本书可挂多个词条）。
// 展示层次刻意压低：书名可点（有链接时），作者/年份/推荐者/一句话理由逐级弱化 ——
// 这是正文之外的延伸阅读，不该和描述抢注意力。
import { useI18n } from '../../lib/useI18n'
import type { ReadingRecord } from '../../lib/iceberg/appendix'

defineProps<{ items: ReadingRecord[] }>()

const { t } = useI18n()
</script>

<template>
  <h3 class="v2reading-title">{{ t('readingSection') }}</h3>
  <ul class="v2reading-list">
    <li v-for="(b, i) in items" :key="i" class="v2reading-item">
      <div class="v2reading-head">
        <a
          v-if="b.url"
          :href="b.url"
          target="_blank"
          rel="noopener"
          class="v2reading-name v2reading-name--link"
        >{{ b.title }}</a>
        <span v-else class="v2reading-name">{{ b.title }}</span>
        <span v-if="b.by || b.at" class="v2reading-meta">
          <span v-if="b.by">{{ b.by }}</span>
          <span v-if="b.at" class="v2reading-year">{{ b.at }}</span>
        </span>
      </div>
      <p v-if="b.note" class="v2reading-note">{{ b.note }}</p>
      <p v-if="b.recommender" class="v2reading-rec">{{ t('readingRecommender') }}：{{ b.recommender }}</p>
    </li>
  </ul>
</template>

<style scoped>
.v2reading-title {
  margin: 0 0 6px;
  font-size: var(--font-micro);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--white-45);
}
.v2reading-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.v2reading-item { min-width: 0; }
.v2reading-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.v2reading-name {
  font-size: var(--font-xs);
  color: var(--white-80);
}
.v2reading-name--link {
  text-decoration: underline;
  text-underline-offset: 4px;
  text-decoration-color: var(--white-20);
  transition: color 0.15s, text-decoration-color 0.15s;
}
.v2reading-name--link:hover {
  color: var(--white-95);
  text-decoration-color: var(--white-50);
}
.v2reading-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--font-micro);
  color: var(--white-40);
}
.v2reading-year { color: var(--white-25); font-variant-numeric: tabular-nums; }
.v2reading-note {
  margin: 2px 0 0;
  font-size: var(--font-micro);
  line-height: 1.7;
  color: var(--white-45);
}
.v2reading-rec {
  margin: 2px 0 0;
  font-size: var(--font-micro);
  color: var(--white-30);
}
</style>
