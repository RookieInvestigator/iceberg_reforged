<script setup lang="ts">
/**
 * ScatterField —— 非冰山图模式（实验功能）：版面与冰山图一致（词条墙 flex 布局），
 * 但没有层级划分，全部词条打乱顺序后平铺在一个大容器里。
 * 顺序在挂载时用 mulberry32 随机打乱（每次刷新不同）；
 * 词条复用 .iceberg-item 类名与 #items-container 事件委托，
 * tooltip / modal / 过滤 / 搜索 / 收藏 / 已读 / NEW 标记全部照常工作。
 */
import { inject, ref, computed } from 'vue'
import { mulberry32 } from '../../lib/iceberg3d/prng'
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY } from '../../lib/injectionKeys'

const props = defineProps<{ items: any[] }>()
// 模板自动解包：filterVisible 解包后为 Set<string> | null，null 表示无筛选
const filterVisible = inject(FILTER_VISIBLE_KEY, null)
const dimItems = inject(DIM_ITEMS_KEY, null)
const dimSet = computed(() => dimItems?.value ?? null)

// 挂载时随机打乱顺序（Fisher-Yates）
const ordered = ref<any[]>([])
{
  const rand = mulberry32(Math.floor(Math.random() * 0xffffffff))
  const arr = [...props.items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  ordered.value = arr
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 max-sm:gap-x-1.5 max-sm:gap-y-[10px] max-sm:mb-3 py-10 max-sm:py-4 px-[var(--header-padding-x)]">
    <span
      v-for="item in ordered"
      :key="item.id"
      v-show="!filterVisible || filterVisible.has(item.id)"
      v-memo="[item.id, dimSet?.has(item.id), filterVisible ? filterVisible.has(item.id) : true]"
      class="iceberg-item inline-flex items-center font-bold cursor-crosshair py-0.5 px-1.5 max-sm:text-[1.05rem]"
      :class="{ dimmed: !!dimSet?.has(item.id) }"
      :data-id="item.id"
      :data-category="item.category"
      :style="`font-size: 1.15em; color: ${item.categoryColor}; --item-color: ${item.categoryColor}`"
    >
      <span class="item-title transition-colors duration-200">{{ item.title }}</span>
      <span
        v-for="(e, ei) in item.emojis"
        :key="ei"
        class="item-tag text-[0.625em] ml-[0.3em] relative -top-[0.08em] inline-flex items-center justify-center transition-colors duration-200"
      >{{ e }}</span>
    </span>
  </div>
</template>
