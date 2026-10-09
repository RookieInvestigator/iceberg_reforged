<script setup lang="ts">
// 左栏：搜索 / 层级 / 词条列表（有副表改动的打点 + 行数徽章）。
import { computed, ref } from 'vue'
import type { AppendixEditor } from '../../lib/iceberg/useAppendixEditor'

const props = defineProps<{ ed: AppendixEditor }>()
const emit = defineEmits<{ select: [id: string] }>()

const search = ref('')
const tier = ref('')
const tiers = computed(() => props.ed.tiers)
const filtered = computed(() => {
  let items = props.ed.allItems
  if (tier.value) items = items.filter(i => i.tier === tier.value)
  const q = search.value.trim().toLowerCase()
  if (q) items = items.filter(i => i.title.toLowerCase().includes(q) || i.id.includes(q))
  return items
})
const PAGE = 200
const shown = ref(PAGE)
const visible = computed(() => filtered.value.slice(0, shown.value))
const hidden = computed(() => filtered.value.length - shown.value)
</script>

<template>
  <aside class="side">
    <div class="hd">
      <input v-model="search" placeholder="搜索标题 / ID…" class="inp" />
      <select v-model="tier" class="sel">
        <option value="">全部层级</option>
        <option v-for="t in tiers" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    <div class="list">
      <button
        v-for="item in visible" :key="item.id"
        class="row" :class="{ on: ed.selectedId.value === item.id }"
        @click="emit('select', item.id)"
      >
        <span class="dot" :class="{ fill: ed.changeCount(item.id) > 0 }" />
        <span class="name">{{ item.title }}</span>
        <span v-if="ed.changeCount(item.id)" class="n">{{ ed.changeCount(item.id) }}</span>
      </button>
    </div>
    <button v-if="hidden > 0" class="more" @click="shown += PAGE">加载更多（还有 {{ hidden }} 个）</button>
  </aside>
</template>

<style scoped>
.side { width: 288px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--white-09); }
.hd { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; border-bottom: 1px solid var(--white-07); }
.inp { width: 100%; padding: 0.42rem 0.55rem; font-size: var(--font-sm); border-radius: 7px; background: var(--white-06); border: 1px solid var(--white-14); color: var(--white-92); }
.inp::placeholder { color: var(--white-45); }
.inp:focus { border-color: var(--color-accent); outline: none; }
.sel { padding: 0.32rem 0.5rem; font-size: var(--font-xs); border-radius: 7px; background: var(--white-06); border: 1px solid var(--white-14); color: var(--white-70); }
.list { flex: 1; overflow-y: auto; padding: 0.25rem 0; }
.row { display: flex; align-items: center; gap: 0.45rem; width: 100%; padding: 0.4rem 0.8rem; font-size: var(--font-sm); text-align: left; background: none; border: none; color: var(--white-65); cursor: pointer; border-left: 2px solid transparent; }
.row:hover { background: var(--white-05); color: var(--white-90); }
.row.on { background: var(--white-08); color: #fff; border-left-color: var(--color-accent); }
.dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--white-15); }
.dot.fill { background: var(--color-success); }
.name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.n { font-size: var(--font-micro); color: var(--white-90); background: var(--white-12); border-radius: 999px; padding: 0 0.35rem; flex-shrink: 0; }
.more { padding: 0.45rem; font-size: var(--font-xs); background: none; border: none; border-top: 1px solid var(--white-07); color: var(--white-55); cursor: pointer; }
.more:hover { color: var(--white-85); }
</style>
