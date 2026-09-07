<script setup lang="ts">
// V2TierChapter（/v2 专用）：单个层级章节。
// 词条 DOM 与 v1 逐字一致（.iceberg-item / .item-title[data-text] / .item-tag /
// data-id / v-show / v-memo / dim），ItemInteractivity 的委托、tooltip 定位、
// 错落偏移全部零改动；只有章节头与间距是新的。
import { useI18n } from '../../lib/useI18n';
import { tierVisibleCounts } from '../../lib/iceberg/wallCounts';
import type { RenderItem } from '../../lib/injectionKeys';

defineProps<{
  tierName: string;
  index: number;
  items: RenderItem[];
  filterVisible: Set<string> | null;
  dimSet: Set<string> | null;
}>();

const { t } = useI18n();
</script>

<template>
  <section
    class="iceberg-tier tier-next relative bg-transparent min-h-[150px] flex flex-col py-10 overflow-visible z-[1]"
    :data-tier="tierName"
    :style="`--tier-stagger: ${index}`"
  >
    <div class="relative z-[2] w-full">
      <h2 class="tier-name">{{ tierName }}</h2>
      <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 max-sm:gap-x-1.5 max-sm:gap-y-[10px] max-sm:mb-3 px-[var(--header-padding-x)]">
        <span
          v-for="item in items"
          :key="item.id"
          v-show="!filterVisible || filterVisible.has(item.id)"
          v-memo="[item.id, dimSet?.has(item.id), filterVisible ? filterVisible.has(item.id) : true]"
          tabindex="0"
          role="button"
          class="iceberg-item inline-flex items-center font-bold cursor-crosshair py-0.5 px-1.5 max-sm:text-[1.05rem]"
          :class="{ dimmed: !!dimSet?.has(item.id) }"
          :data-id="item.id"
          :data-category="item.category"
          :style="`font-size: 1.15em; color: ${item.categoryColor}; --item-color: ${item.categoryColor}`"
        >
          <span class="item-title transition-colors duration-200" :data-text="item.title">{{ item.title }}</span>
          <span v-for="(e, ei) in item.emojis" :key="ei" class="item-tag text-[0.625em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200">{{ e }}</span>
        </span>
      </div>
      <!-- 层空（hide 模式本层 0 命中；管线单遍产出的层可见数，数据驱动与 DOM 挂载无关） -->
      <div v-if="tierVisibleCounts && (tierVisibleCounts.get(tierName) || 0) === 0" class="tier-empty text-center text-white-15 text-sm py-8 italic">{{ t('tierEmpty') }}</div>
    </div>
  </section>
</template>

<style scoped>
/* 章节节奏（极简）+ 居中细字层级名；词条胶囊化 */
.tier-next { padding-top: 2.75rem; padding-bottom: 2.75rem; scroll-margin-top: 90px; }
.tier-name {
  margin: 0 0 2rem; text-align: center;
  font-size: var(--font-xs); font-weight: 400; letter-spacing: 0.35em; margin-right: -0.35em; color: var(--white-40);
}
.tier-next .iceberg-item { border-radius: 999px; padding: 0.3rem 0.8rem; }
.tier-next .iceberg-item::before { border-radius: inherit; }
.tier-next .iceberg-item.recently-updated { border-radius: 999px; }
@media (max-width: 640px) {
  .tier-next { padding-top: 2rem; padding-bottom: 2rem; }
}
</style>
