<script setup lang="ts">
import { computed } from 'vue'

/** 词条元信息徽章行：层级 / 分类（分类色描边）/ 标签（P2-14 原子组件） */
const props = defineProps<{
  tier?: string
  category: string
  categoryColor: string
  tags?: string[] | string
}>()

// 兼容 tags 可能是数组或字符串（旧数据/历史 payload）的情况，统一转成数组
const tagList = computed<string[]>(() => {
  const raw = props.tags
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
    return raw.split(/[,，|]/).map(s => s.trim()).filter(Boolean)
  }
  return []
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
    <span v-if="tier" class="text-[length:var(--font-tiny)] font-medium px-1.5 py-[1px] rounded border bg-white/[0.03] border-white/15 text-white/50">
      {{ tier }}
    </span>
    <span class="text-[length:var(--font-tiny)] font-medium px-1.5 py-[1px] rounded border bg-white/[0.03]"
          :style="{ color: categoryColor, borderColor: categoryColor }">
      {{ category }}
    </span>
    <div class="flex flex-wrap items-center gap-1.5">
      <span v-for="tag in tagList" :key="tag" class="text-[length:var(--font-tiny)] text-white/55">#{{ tag }}</span>
    </div>
  </div>
</template>
