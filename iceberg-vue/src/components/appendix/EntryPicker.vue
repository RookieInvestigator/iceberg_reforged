<script setup lang="ts">
// 词条选择器：搜索 + 结果列表（关联词条用）。受控：`open` 由父组件管，选中即 emit。
import { computed, ref } from 'vue'
import type { AppendixEditor } from '../../lib/iceberg/useAppendixEditor'

const props = defineProps<{
  ed: AppendixEditor
  /** 已在列表里的 id（置灰，避免重复添加） */
  used?: Set<string>
  placeholder?: string
}>()
const emit = defineEmits<{ pick: [id: string] }>()

const q = ref('')
const results = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return []
  return props.ed.allItems
    .filter(i => !props.used?.has(i.id) && (i.title.toLowerCase().includes(s) || i.id.includes(s)))
    .slice(0, 30)
})
</script>

<template>
  <div class="picker">
    <input v-model="q" class="search" :placeholder="placeholder || '搜索词条名 / ID…'" />
    <div class="list">
      <button v-for="r in results" :key="r.id" class="row" @click="emit('pick', r.id); q = ''">
        <span class="name">{{ r.title }}</span>
        <span class="tier">{{ (r as any).tier }}</span>
        <span class="cat" :style="{ color: (r as any).categoryColor }">{{ (r as any).category }}</span>
      </button>
      <p v-if="q && !results.length" class="empty">没有匹配的词条</p>
      <p v-if="!q" class="empty">输入关键词开始搜索</p>
    </div>
  </div>
</template>

<style scoped>
.picker { min-width: 24rem; }
.search { width: 100%; padding: 0.35rem 0.5rem; font-size: var(--font-xs); border-radius: 7px; background: var(--white-06); border: 1px solid var(--white-14); color: var(--white-92); }
.search:focus { border-color: var(--color-accent); outline: none; }
.list { max-height: 18rem; overflow-y: auto; margin-top: 0.3rem; }
.row { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.38rem 0.5rem; font-size: var(--font-xs); text-align: left; background: none; border: none; border-radius: 7px; color: var(--white-80); cursor: pointer; }
.row:hover { background: var(--white-08); color: #fff; }
.name { flex: 1; }
.tier { font-size: var(--font-micro); color: var(--white-50); }
.cat { font-size: var(--font-micro); }
.empty { padding: 0.4rem 0.5rem; font-size: var(--font-xs); color: var(--white-45); }
</style>
