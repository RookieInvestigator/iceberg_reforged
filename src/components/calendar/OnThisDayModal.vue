<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import csvRaw from '../../data/on-this-day.csv?raw'
import { parseCSV } from '../../lib/csv'
import { useI18n } from '../../lib/useI18n'
import { useStore } from '@nanostores/vue'
import { detailMode } from '../../lib/settingsStore'
import BaseModal from '../modals/BaseModal.vue'

const { t } = useI18n()
const emit = defineEmits(['close'])
const mode = useStore(detailMode)

let closeTimer = 0
onUnmounted(() => clearTimeout(closeTimer))

function goItem(id: string) {
  if (mode.value === 'modal') {
    document.dispatchEvent(new CustomEvent('open-item-modal', { detail: id }));
  } else {
    window.location.hash = id;
    const el = document.querySelector(`.iceberg-item[data-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('tooltip-active');
      closeTimer = setTimeout(() => {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      }, 800);
    }
  }
  emit('close');
}

const today = new Date()
const cur = ref(today)
function toMMDD(d: Date) { return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function pad(n: number) { return String(n).padStart(2, '0') }
const all = parseCSV(csvRaw) as any[]
const events = computed(() => all.filter(e => e.date === toMMDD(cur.value)))
function goPrev() { const d = new Date(cur.value); d.setDate(d.getDate() - 1); cur.value = d }
function goNext() { const d = new Date(cur.value); d.setDate(d.getDate() + 1); cur.value = d }
function goToday() { cur.value = new Date() }
const getMonthName = (d: Date) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d)
</script>

<template>
  <BaseModal :title="t('onThisDay')" size="lg" @close="$emit('close')">
    <!-- 日期导航 -->
    <div class="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
      <button @click="goPrev" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 text-zinc-400 hover:text-white transition-colors">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <span class="text-white font-semibold text-base sm:text-lg tracking-tight">{{ getMonthName(cur) }} {{ pad(cur.getDate()) }}</span>
      <button @click="goNext" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 text-zinc-400 hover:text-white transition-colors">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>
      <button @click="goToday" class="text-[10px] sm:text-[11px] text-zinc-500 hover:text-zinc-300 tracking-wider ml-1">{{ t('today') }}</button>
    </div>

    <!-- Events -->
    <div v-if="events.length === 0" class="py-12 text-center text-zinc-500 text-sm">{{ t('noEvents') }}</div>
    <div v-else class="space-y-4 sm:space-y-5">
      <article v-for="(event, i) in events" :key="i" class="flex gap-1.5">
        <span v-if="event.year" class="shrink-0 w-10 text-right text-xs font-mono text-zinc-500 pt-0.5 pr-1.5">{{ event.year }}</span>
        <span v-else class="shrink-0 w-10" />
        <div class="min-w-0 -ml-0.5">
          <h3 class="text-zinc-200 text-sm font-medium leading-snug break-words">{{ event.title }}</h3>
          <p v-if="event.desc" class="text-zinc-500 text-xs leading-relaxed mt-0.5 sm:mt-1">{{ event.desc }}</p>
          <div v-if="event.link || event.item" class="flex gap-3 sm:gap-4 mt-1.5 sm:mt-2">
            <a v-if="event.link" :href="event.link" target="_blank" rel="noopener" class="text-[10px] text-zinc-600 hover:text-zinc-400 tracking-wider">{{ t('source') }}</a>
            <a v-if="event.item" @click.prevent="goItem(event.item)" href="#" class="text-[10px] text-zinc-600 hover:text-zinc-400 tracking-wider cursor-pointer">{{ t('explore') }}</a>
          </div>
        </div>
      </article>
    </div>

    <template #footer-hint>
      <router-link to="/on-this-day" class="text-[10px] text-zinc-500 hover:text-zinc-300 tracking-wider">查看全部 &rarr;</router-link>
    </template>
  </BaseModal>
</template>
