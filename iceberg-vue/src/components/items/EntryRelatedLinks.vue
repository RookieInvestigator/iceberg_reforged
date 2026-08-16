<script setup lang="ts">
import { useI18n } from '../../lib/useI18n'

/** 关联/推荐词条跳板（P2-14：EntryDetailCardNext 与 MobileSheet 模板去重） */
export interface RelatedEntry {
  id: string
  title: string
}

const props = defineProps<{
  related?: RelatedEntry[]
  recommended?: RelatedEntry[]
  /** modal：单行流式 chips（桌面弹窗）；sheet：分块 + 顶部描边（移动抽屉） */
  variant?: 'modal' | 'sheet'
}>()
const emit = defineEmits<{ navigate: [{ id: string }] }>()
const { t } = useI18n()

function go(r: RelatedEntry) {
  emit('navigate', { id: r.id })
}
</script>

<template>
  <!-- 桌面弹窗：单行流式 chips -->
  <div v-if="variant !== 'sheet'" class="flex flex-wrap items-baseline gap-y-1.5 gap-x-1">
    <template v-if="props.related && props.related.length > 0">
      <span class="text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-widest mr-1">{{ t('relatedItem') }}</span>
      <button v-for="r in props.related" :key="'rel-' + r.id" @click="go(r)"
        class="text-[length:var(--font-xs)] text-white/60 hover:text-white/90 px-1.5 py-0.5 rounded-sm hover:bg-white/10 transition-colors cursor-pointer">
        {{ r.title }}
      </button>
    </template>
    <template v-if="props.recommended && props.recommended.length > 0">
      <span class="text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-widest mr-1"
            :class="{ 'ml-2.5': props.related && props.related.length > 0 }">{{ t('recommendedItem') }}</span>
      <button v-for="r in props.recommended" :key="'rec-' + r.id" @click="go(r)"
        class="text-[length:var(--font-xs)] text-white/60 hover:text-white/90 px-1.5 py-0.5 rounded-sm hover:bg-white/10 transition-colors cursor-pointer">
        {{ r.title }}
      </button>
    </template>
  </div>
  <!-- 移动抽屉：分块 + 顶部描边 -->
  <template v-else>
    <div v-if="props.related && props.related.length > 0" class="mt-2" style="border-color:var(--color-surface-border,#333)">
      <div class="text-[length:var(--font-xs)] font-bold text-white/50 uppercase tracking-[0.15em] mb-1.5">{{ t('relatedItem') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="r in props.related" :key="r.id" @click="go(r)"
          class="text-xs text-white/60 hover:text-white/90 px-3 py-2 min-h-[44px] rounded-md hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
          {{ r.title }}
        </button>
      </div>
    </div>
    <div v-if="props.recommended && props.recommended.length > 0" class="mt-3" style="border-color:var(--color-surface-border,#333)">
      <div class="text-[length:var(--font-xs)] font-bold text-white/50 uppercase tracking-[0.15em] mb-1.5">{{ t('recommendedItem') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="r in props.recommended" :key="r.id" @click="go(r)"
          class="text-xs text-white/60 hover:text-white/90 px-3 py-2 min-h-[44px] rounded-md hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
          {{ r.title }}
        </button>
      </div>
    </div>
  </template>
</template>
