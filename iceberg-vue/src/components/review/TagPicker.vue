<script setup lang="ts">
// TagPicker：标签多选（审核工作台用）—— 与词条弹窗的反馈表单同语言：emoji + 名称 pill，
// 选中反白。69 个标签平铺 + 可搜索，避免长列表里翻找。
import { computed, ref } from 'vue'

const props = defineProps<{
  /** 可选标签名（来自 tagMap 的 value） */
  options: string[]
  /** 标签名 → emoji */
  emoji: Record<string, string>
  modelValue: string[]
  /** 紧凑模式：不显示「已选 N 个」（副表编辑器把它放在浮层里，多一行就多一分噪音） */
  compact?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const q = ref('')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return props.options
  return props.options.filter((n) => n.toLowerCase().includes(s) || (props.emoji[n] || '').includes(s))
})

const isOn = (n: string) => props.modelValue.includes(n)
function toggle(n: string) {
  const next = isOn(n) ? props.modelValue.filter((x) => x !== n) : [...props.modelValue, n]
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="tp">
    <input v-model="q" class="tp-search" type="search" placeholder="筛选标签…" />
    <div class="tp-grid no-scrollbar">
      <button
        v-for="n in shown" :key="n" type="button" class="tp-pill" :class="{ on: isOn(n) }"
        :title="n" @click="toggle(n)"
      ><span class="tp-emoji">{{ emoji[n] || '·' }}</span>{{ n }}</button>
      <p v-if="!shown.length" class="tp-empty">没有匹配的标签</p>
    </div>
    <p v-if="!compact" class="tp-hint">已选 {{ modelValue.length }} 个</p>
  </div>
</template>

<style scoped>
.tp { display: flex; flex-direction: column; gap: 0.4rem; }
.tp-search { padding: 0.3rem 0.5rem; background: var(--white-03); border: 1px solid var(--white-12); border-radius: var(--v2-r-sm); color: var(--white-85); font-size: var(--font-tiny); }
.tp-search:focus-visible { outline: none; border-color: var(--white-25); }
.tp-grid { display: flex; flex-wrap: wrap; gap: 0.3rem; max-height: 190px; overflow-y: auto; padding: 0.15rem; }
.tp-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.55rem; background: var(--white-03); border: 1px solid var(--white-10); border-radius: var(--v2-r-sm); color: var(--white-55); font-size: var(--font-micro); cursor: pointer; }
.tp-pill:hover { color: var(--white-90); border-color: var(--white-25); }
.tp-pill.on { color: var(--v2-on-fg); background: var(--v2-on-bg); border-color: var(--v2-on-bg); font-weight: 700; }
.tp-emoji { font-size: var(--font-xs); }
.tp-empty { margin: 0; padding: 0.4rem; font-size: var(--font-micro); color: var(--white-30); }
.tp-hint { margin: 0; font-size: var(--font-micro); color: var(--white-25); }
</style>
