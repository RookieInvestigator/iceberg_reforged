<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowRight } from '@lucide/vue'
import csvRaw from '../../data/on-this-day.csv?raw'
import { parseCSV } from '../../lib/csv'
import { useI18n } from '../../lib/useI18n'
import { useStore } from '@nanostores/vue'
import { detailMode } from '../../lib/settingsStore'
import {
  formatMMDDLabel,
  formatYearShort,
  getAdjacentRecordedDate,
  getSortedRecordedDates,
  normalizeOnThisDayEvents,
  parseDateParam,
  sortEventsByYearDesc,
  toMMDD,
} from '../../lib/onThisDay'
import BaseModal from '../modals/BaseModal.vue'

const { t, lang } = useI18n()
const route = useRoute()
const emit = defineEmits(['close'])
const mode = useStore(detailMode)

let closeTimer = 0
onUnmounted(() => clearTimeout(closeTimer))

const isMainRoute = computed(() => route.path === '/' || route.path === '/legacy')
const fromSource = computed(() => (isMainRoute.value ? 'v2' : undefined))

function goItem(id: string) {
  if (isMainRoute.value || window.innerWidth < 1024 || mode.value === 'modal') {
    document.dispatchEvent(new CustomEvent('open-item-modal', { detail: id }))
    emit('close')
    return
  }

  window.location.hash = id
  const itemEl = document.querySelector<HTMLElement>(`.iceberg-item[data-id="${id}"]`)
  const visible = !!itemEl && itemEl.isConnected && itemEl.offsetParent !== null && itemEl.getClientRects().length > 0
  if (visible && itemEl) {
    itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    itemEl.classList.add('tooltip-active')
    closeTimer = window.setTimeout(() => {
      itemEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))
    }, 700)
  } else {
    document.dispatchEvent(new CustomEvent('open-item-modal', { detail: id }))
  }
  emit('close')
}

const allEvents = normalizeOnThisDayEvents(parseCSV(csvRaw))
const recordedDates = getSortedRecordedDates(allEvents)

const today = new Date()
const cur = ref(today)
const curMMDD = computed(() => toMMDD(cur.value))
const isToday = computed(() => curMMDD.value === toMMDD(today))

const events = computed(() =>
  sortEventsByYearDesc(allEvents.filter((e) => e.date === curMMDD.value)),
)

const prevRecorded = computed(() => getAdjacentRecordedDate(recordedDates, curMMDD.value, -1))
const nextRecorded = computed(() => getAdjacentRecordedDate(recordedDates, curMMDD.value, 1))

function goPrev() {
  const d = new Date(cur.value)
  d.setDate(d.getDate() - 1)
  cur.value = d
}
function goNext() {
  const d = new Date(cur.value)
  d.setDate(d.getDate() + 1)
  cur.value = d
}
function goToday() {
  cur.value = new Date()
}
function jumpToRecorded(mmdd: string | null) {
  if (!mmdd) return
  const parsed = parseDateParam(mmdd, cur.value.getFullYear())
  if (parsed) cur.value = parsed
}

const dateLabel = computed(() => formatMMDDLabel(curMMDD.value, lang.value))

const fullPageRoute = computed(() => ({
  path: '/on-this-day',
  query: {
    date: curMMDD.value,
    ...(fromSource.value ? { from: fromSource.value } : {}),
  },
}))
</script>

<template>
  <BaseModal :title="t('onThisDay')" size="lg" @close="$emit('close')">
    <!-- 极简日期切换 -->
    <div class="mb-4 flex items-center justify-between border-b border-white-06 pb-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          :aria-label="t('prevDay')"
          class="flex h-10 w-10 items-center justify-center rounded-md text-white-55 transition-colors hover:bg-white-08 hover:text-white md:h-8 md:w-8"
          @click="goPrev"
        >
          <ChevronLeft :size="15" :stroke-width="2" />
        </button>

        <span class="min-w-[5rem] text-center text-base font-bold tracking-tight tabular-nums text-white-95">
          {{ dateLabel }}
        </span>

        <button
          type="button"
          :aria-label="t('nextDay')"
          class="flex h-10 w-10 items-center justify-center rounded-md text-white-55 transition-colors hover:bg-white-08 hover:text-white md:h-8 md:w-8"
          @click="goNext"
        >
          <ChevronRight :size="15" :stroke-width="2" />
        </button>
      </div>

      <button
        v-if="!isToday"
        type="button"
        class="min-h-8 px-2 text-xs text-white-50 transition-colors hover:text-white-90"
        @click="goToday"
      >
        {{ t('today') }}
      </button>
    </div>

    <!-- 空状态：无边框纯文字 + 邻近有记录日快跳 -->
    <div v-if="events.length === 0" class="py-10 text-center">
      <p class="text-sm text-white-45">{{ t('noEvents') }}</p>
      <div v-if="prevRecorded || nextRecorded" class="mt-4 flex items-center justify-center gap-4 text-xs tabular-nums text-white-55">
        <button
          v-if="prevRecorded"
          type="button"
          class="inline-flex min-h-8 items-center gap-1 transition-colors hover:text-accent-soft"
          @click="jumpToRecorded(prevRecorded)"
        >
          <span aria-hidden="true">←</span>
          <span>{{ formatMMDDLabel(prevRecorded, lang) }}</span>
        </button>
        <span v-if="prevRecorded && nextRecorded" class="text-white-15" aria-hidden="true">·</span>
        <button
          v-if="nextRecorded"
          type="button"
          class="inline-flex min-h-8 items-center gap-1 transition-colors hover:text-accent-soft"
          @click="jumpToRecorded(nextRecorded)"
        >
          <span>{{ formatMMDDLabel(nextRecorded, lang) }}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>

    <!-- 当日记录 -->
    <div v-else class="divide-y divide-white-05">
      <article
        v-for="(event, i) in events"
        :key="`${event.year}-${event.title}-${i}`"
        class="grid grid-cols-[3.75rem_minmax(0,1fr)] items-baseline gap-3 py-3.5 first:pt-0 last:pb-0 sm:gap-4"
      >
        <span class="text-right font-mono text-xs tabular-nums text-white-45">
          {{ formatYearShort(event.year, lang, t('otdYearUnknown')) }}
        </span>

        <div class="min-w-0">
          <h3 class="break-words text-sm font-semibold leading-snug text-white-92">
            {{ event.title }}
          </h3>
          <p v-if="event.desc" class="mt-1 break-words text-xs leading-[1.7] text-white-52">
            {{ event.desc }}
          </p>
          <div v-if="event.link || event.item" class="mt-2 flex flex-wrap items-center gap-4">
            <a
              v-if="event.link"
              :href="event.link"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-tiny text-white-42 transition-colors hover:text-accent-soft"
            >
              <span>{{ t('source') }}</span>
              <ArrowUpRight :size="11" :stroke-width="2" />
            </a>
            <a
              v-if="event.item"
              href="#"
              class="inline-flex items-center gap-1 text-tiny text-white-42 transition-colors hover:text-accent-soft"
              @click.prevent="goItem(event.item)"
            >
              <span>{{ t('explore') }}</span>
              <ArrowRight :size="11" :stroke-width="2" />
            </a>
          </div>
        </div>
      </article>
    </div>

    <!-- 进入完整页面入口 -->
    <template #footer>
      <div class="flex items-center justify-end px-2 py-1.5">
        <router-link
          :to="fullPageRoute"
          class="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-accent/35 bg-accent/12 px-3 py-1.5 text-xs font-medium text-accent-soft transition-colors hover:bg-accent/22 hover:text-white"
          @click="emit('close')"
        >
          <span>{{ t('openOnThisDayPage') }}</span>
          <ArrowRight :size="13" :stroke-width="2" aria-hidden="true" />
        </router-link>
      </div>
    </template>
  </BaseModal>
</template>
