<script setup lang="ts">
// V2TierChapter（/v2 专用）：单个层级章节。
// 词条 DOM 与 v1 逐字一致（.iceberg-item / .item-title[data-text] / .item-tag /
// data-id / v-show / v-memo / dim），ItemInteractivity 的委托、tooltip 定位、
// 错落偏移全部零改动；只有章节头与间距是新的。
import { useI18n } from '../../lib/useI18n';
import { useStore } from '@nanostores/vue';
import { floatMode } from '../../lib/settingsStore';
import { showNewMark } from '../../lib/settingsStore';
import { NEW_MARK_WINDOW_DAYS } from '../../lib/filterStore';
import { floatOffsetFor } from '../../lib/iceberg/floatOffset';
import { registerItem } from '../../lib/iceberg/itemRegistry';
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
// 错落排版渲染层输出（F1 根治：随挂载自然生效；开关切换经 v-memo 重渲染）
const floatStatic = useStore(floatMode);
// NEW 标记渲染层输出（同因：命令式 applyItemMarks 只在 setup 时扫已挂载节点，
// 后 6 层永远拿不到 recently-updated；此处随挂载自然生效，命令式路径保留做一致性兜底）
const showNew = useStore(showNewMark);
const newCutoff = Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 24 * 60 * 60;
function itemStyle(item: RenderItem): string {
  let s = `color: ${item.categoryColor}; --item-color: ${item.categoryColor}`;
  if (floatStatic.value === 'static') {
    const { x, y } = floatOffsetFor(item.id);
    s += `; --fx: ${x}px; --fy: ${y}px`;
  }
  return s;
}
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
          :ref="(el) => registerItem(item.id, el as unknown as HTMLElement | null)"
          v-show="!filterVisible || filterVisible.has(item.id)"
          v-memo="[item.id, floatStatic, showNew, dimSet?.has(item.id), filterVisible ? filterVisible.has(item.id) : true]"
          tabindex="0"
          role="button"
          class="iceberg-item inline-flex items-center font-bold cursor-crosshair py-0.5 px-1.5 max-sm:text-[1.05rem]"
          :class="{ dimmed: !!dimSet?.has(item.id), 'recently-updated': showNew && (item.modifiedAt || 0) >= newCutoff }"
          :data-id="item.id"
          :data-category="item.category"
          :style="itemStyle(item)"
        >
          <span class="item-title transition-colors duration-200" :data-text="item.title">{{ item.title }}</span>
          <span v-for="(e, ei) in item.emojis" :key="ei" class="item-tag text-[0.625em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200">{{ e }}</span>
        </span>
      </div>
      <!-- 层空（hide 模式本层 0 命中；管线单遍产出的层可见数，数据驱动与 DOM 挂载无关） -->
      <div v-if="tierVisibleCounts && (tierVisibleCounts.get(tierName) || 0) === 0" class="tier-empty text-center text-white-25 text-sm py-8 italic">{{ t('tierEmpty') }}</div>
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
/* P4：字号从 1432 条内联收归规则（与原来内联同优先级行为：max-sm:text-[1.05rem] 本就打不过内联，保持不变） */
.tier-next .iceberg-item { font-size: 1.15em; }
/* 错落偏移渲染层落点（F1：--fx/--fy 由 itemStyle 输出，无变量时回落 0） */
.tier-next .iceberg-item { transform: translate(var(--fx, 0px), var(--fy, 0px)); }
/* v2 词条行距略收（全局 1.5 用户指定不动，仅 v2 章节覆盖 1.4） */
.tier-next .iceberg-item { line-height: 1.4; }
.tier-next .iceberg-item::before { border-radius: inherit; }
.tier-next .iceberg-item.recently-updated { border-radius: 999px; }
@media (max-width: 640px) {
  .tier-next { padding-top: 2rem; padding-bottom: 2rem; }
}
</style>
