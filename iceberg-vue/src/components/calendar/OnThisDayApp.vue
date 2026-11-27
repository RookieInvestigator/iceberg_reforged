<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowRight, Search, X } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from '@nanostores/vue'
import { detailMode } from '../../lib/settingsStore'
import { useI18n } from '../../lib/useI18n'
import { url } from '../../lib/baseUrl'
import {
  buildCalendarCells,
  formatMMDDLabel,
  formatYearHeading,
  getAdjacentRecordedDate,
  getMonthChronicleGroups,
  getSortedRecordedDates,
  groupEventsByYear,
  parseDateParam,
  searchOnThisDayEvents,
  toMMDD,
  type OnThisDayEvent,
} from '../../lib/onThisDay'
import FlowBackground from '../layout/FlowBackground.vue'

const props = withDefaults(defineProps<{
  allEvents?: OnThisDayEvent[]
}>(), {
  allEvents: () => [],
})

const { t, lang } = useI18n()
const route = useRoute()
const router = useRouter()
const mode = useStore(detailMode)

const contentScrollRef = ref<HTMLElement | null>(null)
const viewMode = ref<'day' | 'month'>('day')
const searchQuery = ref('')
const mobileCalendarOpen = ref(true)

const eventsList = computed(() => props.allEvents)
const eventDateSet = computed(() => new Set(eventsList.value.map((e) => e.date).filter(Boolean)))
const recordedDates = computed(() => getSortedRecordedDates(eventsList.value))

const fromSource = computed(() => {
  const f = typeof route.query.from === 'string' ? route.query.from : ''
  // from=v3 是历史遗留（V3 曾挂在 /v3），一律视为从主图来
  return f === 'v3' || f === 'v2' ? 'v2' : ''
})
const backTarget = computed(() => (fromSource.value ? '/legacy' : '/home'))
const backLabel = computed(() => (fromSource.value ? t('otdBackToIceberg') : t('backToHome')))

function goItem(itemId: string) {
  if (fromSource.value) {
    router.push({ path: '/legacy', query: { item: itemId } })
    return
  }
  if (mode.value === 'modal') {
    router.push({ path: '/', query: { item: itemId } })
  } else {
    window.location.href = url('/#' + itemId)
  }
}

const today = new Date()
const initialDate = parseDateParam(route.query.date, today.getFullYear()) ?? today
const currentDate = ref<Date>(initialDate)
const calendarYear = ref(initialDate.getFullYear())
const calendarMonth = ref(initialDate.getMonth())

const currentMMDD = computed(() => toMMDD(currentDate.value))
const todayMMDD = toMMDD(today)
const isViewingToday = computed(() => currentMMDD.value === todayMMDD)

const monthLocales: Record<string, string> = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' }
const getMonthName = (d: Date) =>
  new Intl.DateTimeFormat(monthLocales[lang.value] || 'zh-CN', { month: 'short' }).format(d)
const getWeekdayName = (d: Date) =>
  new Intl.DateTimeFormat(monthLocales[lang.value] || 'zh-CN', { weekday: 'short' }).format(d)
const weekDays = computed(() => (t('weekDays') ? t('weekDays').split(',') : ['S', 'M', 'T', 'W', 'T', 'F', 'S']))

const calendarCells = computed(() => buildCalendarCells(calendarYear.value, calendarMonth.value))
const monthRecordedGroups = computed(() => getMonthChronicleGroups(eventsList.value, calendarMonth.value + 1))

const dayEvents = computed(() => eventsList.value.filter((e) => e.date === currentMMDD.value))
const groupedEvents = computed(() => groupEventsByYear(dayEvents.value))

const prevRecorded = computed(() => getAdjacentRecordedDate(recordedDates.value, currentMMDD.value, -1))
const nextRecorded = computed(() => getAdjacentRecordedDate(recordedDates.value, currentMMDD.value, 1))

const trimmedSearch = computed(() => searchQuery.value.trim())
const isSearching = computed(() => trimmedSearch.value.length > 0)
const searchResults = computed(() => searchOnThisDayEvents(eventsList.value, trimmedSearch.value))

function scrollChronicleTop() {
  nextTick(() => {
    if (contentScrollRef.value && window.innerWidth >= 1024) {
      contentScrollRef.value.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })
}

function goDate(d: Date, opts?: { syncUrl?: boolean }) {
  currentDate.value = d
  calendarYear.value = d.getFullYear()
  calendarMonth.value = d.getMonth()
  viewMode.value = 'day'
  if (trimmedSearch.value) searchQuery.value = ''

  if (opts?.syncUrl !== false) {
    const mmdd = toMMDD(d)
    const nextQuery: Record<string, string> = { date: mmdd }
    if (fromSource.value) nextQuery.from = fromSource.value
    if (route.query.date !== mmdd) {
      router.replace({ path: '/on-this-day', query: nextQuery })
    }
  }
  scrollChronicleTop()
}

function goToday() {
  goDate(new Date())
}
function goPrevDay() {
  const d = new Date(currentDate.value)
  d.setDate(d.getDate() - 1)
  goDate(d)
}
function goNextDay() {
  const d = new Date(currentDate.value)
  d.setDate(d.getDate() + 1)
  goDate(d)
}
function jumpToRecorded(mmdd: string | null) {
  if (!mmdd) return
  const d = parseDateParam(mmdd, currentDate.value.getFullYear())
  if (d) goDate(d)
}

function prevMonth() {
  if (calendarMonth.value === 0) {
    calendarYear.value--
    calendarMonth.value = 11
  } else {
    calendarMonth.value--
  }
}
function nextMonth() {
  if (calendarMonth.value === 11) {
    calendarYear.value++
    calendarMonth.value = 0
  } else {
    calendarMonth.value++
  }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function hasEvents(mmdd: string) {
  return eventDateSet.value.has(mmdd)
}
function isSelected(mmdd: string) {
  return currentMMDD.value === mmdd
}
function isTodayGrid(mmdd: string) {
  return todayMMDD === mmdd
}

watch(
  () => route.query.date,
  (q) => {
    const parsed = parseDateParam(q, currentDate.value.getFullYear())
    if (parsed && toMMDD(parsed) !== currentMMDD.value) {
      goDate(parsed, { syncUrl: false })
    }
  },
)

function onKeyDown(e: KeyboardEvent) {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goPrevDay()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    goNextDay()
  } else if (e.key === 't' || e.key === 'T') {
    e.preventDefault()
    goToday()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  document.dispatchEvent(new CustomEvent('vue-ready'))
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="relative min-h-dvh w-full bg-surface font-sans text-white-92 lg:h-dvh lg:overflow-hidden">
    <FlowBackground />
    <div class="pointer-events-none fixed inset-0 z-[1] bg-black/35" aria-hidden="true" />

    <div class="relative z-10 flex min-h-dvh w-full flex-col lg:h-full lg:flex-row">
      <!-- 左侧极简日历栏 -->
      <aside
        class="no-scrollbar z-20 flex w-full shrink-0 flex-col border-b border-white-06 bg-black/35 lg:h-full lg:w-[350px] lg:overflow-y-auto lg:border-b-0 lg:border-r xl:w-[376px]"
      >
        <header class="flex items-center justify-between px-6 pt-5 sm:px-7">
          <h1 class="m-0 text-xs font-bold tracking-[0.16em] text-white-55">
            {{ t('onThisDay') }}
          </h1>
          <router-link
            :to="backTarget"
            class="inline-flex min-h-9 items-center gap-1 text-xs text-white-45 transition-colors hover:text-white-90"
          >
            <span aria-hidden="true">←</span>
            <span>{{ backLabel }}</span>
          </router-link>
        </header>

        <div class="flex flex-1 flex-col px-6 pt-7 pb-6 sm:px-7 lg:justify-center lg:pt-6">
          <!-- 日期主视觉 -->
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white-45 transition-colors hover:bg-white-08 hover:text-white"
              :aria-label="t('prevDay')"
              @click="goPrevDay"
            >
              <ChevronLeft :size="18" :stroke-width="2" />
            </button>

            <div class="text-center">
              <span class="block text-xs tracking-[0.14em] tabular-nums text-white-45">
                {{ getMonthName(currentDate) }} · {{ getWeekdayName(currentDate) }}
              </span>
              <span class="mt-1 block text-5xl font-black leading-none tracking-tight tabular-nums text-white-95 lg:text-6xl">
                {{ pad(currentDate.getDate()) }}
              </span>
            </div>

            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white-45 transition-colors hover:bg-white-08 hover:text-white"
              :aria-label="t('nextDay')"
              @click="goNextDay"
            >
              <ChevronRight :size="18" :stroke-width="2" />
            </button>
          </div>

          <!-- 月份栏 + 移动端折叠按钮 -->
          <div class="mt-7 flex items-center justify-between">
            <span class="text-sm font-semibold tabular-nums text-white-75">
              {{ getMonthName(new Date(calendarYear, calendarMonth)) }} {{ calendarYear }}
            </span>

            <div class="flex items-center gap-1">
              <button
                v-if="!isViewingToday"
                type="button"
                class="min-h-8 rounded-md px-2 text-xs text-white-50 transition-colors hover:bg-white-08 hover:text-white"
                @click="goToday"
              >
                {{ t('today') }}
              </button>
              <button
                type="button"
                :aria-label="t('prevMonth')"
                class="flex h-9 w-9 items-center justify-center rounded-full text-white-45 transition-colors hover:bg-white-08 hover:text-white lg:h-8 lg:w-8"
                @click="prevMonth"
              >
                <ChevronLeft :size="15" :stroke-width="2" />
              </button>
              <button
                type="button"
                :aria-label="t('nextMonth')"
                class="flex h-9 w-9 items-center justify-center rounded-full text-white-45 transition-colors hover:bg-white-08 hover:text-white lg:h-8 lg:w-8"
                @click="nextMonth"
              >
                <ChevronRight :size="15" :stroke-width="2" />
              </button>
              <button
                type="button"
                class="ml-1 min-h-8 px-1.5 text-xs text-white-45 hover:text-white-85 lg:hidden"
                @click="mobileCalendarOpen = !mobileCalendarOpen"
              >
                {{ mobileCalendarOpen ? t('otdHideCalendar') : t('otdShowCalendar') }}
              </button>
            </div>
          </div>

          <!-- 日历网格 -->
          <div class="mt-3" :class="mobileCalendarOpen ? 'block' : 'hidden lg:block'">
            <div class="mb-1.5 grid grid-cols-7 text-center">
              <div v-for="d in weekDays" :key="d" class="py-1 text-tiny text-white-32">
                {{ d }}
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1 text-center">
              <template v-for="(d, i) in calendarCells" :key="i">
                <div v-if="d === null" class="aspect-square" />
                <button
                  v-else
                  type="button"
                  class="relative flex aspect-square min-h-[40px] items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150 lg:min-h-0"
                  :class="isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`)
                    ? 'bg-accent font-bold text-black'
                    : isTodayGrid(`${pad(calendarMonth + 1)}-${pad(d)}`)
                      ? 'font-semibold text-accent-soft ring-1 ring-accent-soft/60 hover:bg-white-08'
                      : hasEvents(`${pad(calendarMonth + 1)}-${pad(d)}`)
                        ? 'font-medium text-white-82 hover:bg-white-08 hover:text-white'
                        : 'text-white-30 hover:bg-white-06 hover:text-white-70'"
                  @click="goDate(new Date(calendarYear, calendarMonth, d))"
                >
                  <span>{{ d }}</span>
                  <span
                    v-if="hasEvents(`${pad(calendarMonth + 1)}-${pad(d)}`) && !isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`)"
                    class="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white-40"
                    aria-hidden="true"
                  />
                </button>
              </template>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：无边框档案阅读流 -->
      <main ref="contentScrollRef" class="events-scroll relative z-10 min-h-0 flex-1 lg:overflow-y-auto">
        <div class="mx-auto max-w-2xl px-6 py-7 sm:px-10 sm:py-11">
          <!-- 单一顶部极简工具行：视图文字切换 + 无框检索 -->
          <div class="mb-8 flex items-center justify-between gap-4 border-b border-white-06 pb-3">
            <nav class="flex items-center gap-3 text-xs">
              <button
                type="button"
                class="min-h-7 transition-colors"
                :class="!isSearching && viewMode === 'day' ? 'font-semibold text-white-95' : 'text-white-40 hover:text-white-80'"
                @click="viewMode = 'day'; searchQuery = ''"
              >
                {{ t('otdTabDay') }}
              </button>
              <span class="text-white-15" aria-hidden="true">/</span>
              <button
                type="button"
                class="min-h-7 transition-colors"
                :class="!isSearching && viewMode === 'month' ? 'font-semibold text-white-95' : 'text-white-40 hover:text-white-80'"
                @click="viewMode = 'month'; searchQuery = ''"
              >
                {{ t('otdTabMonth') }}
              </button>
            </nav>

            <div class="relative w-36 sm:w-48">
              <Search :size="13" :stroke-width="2" class="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 text-white-35" aria-hidden="true" />
              <input
                v-model="searchQuery"
                type="text"
                inputmode="search"
                enterkeyhint="search"
                :placeholder="t('otdSearchPlaceholder')"
                class="h-7 w-full border-b border-transparent bg-transparent pr-5 pl-5 text-xs text-white-90 placeholder:text-white-32 transition-colors focus:border-white-25 focus:outline-none"
              />
              <button
                v-if="searchQuery"
                type="button"
                :aria-label="t('clearAll')"
                class="absolute top-1/2 right-0 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-white-40 hover:text-white"
                @click="searchQuery = ''"
              >
                <X :size="12" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- 1. 搜索模式 -->
          <template v-if="isSearching">
            <p v-if="searchResults.length === 0" class="py-16 text-center text-sm text-white-42">
              {{ t('otdNoMatches') }}
            </p>
            <div v-else class="divide-y divide-white-06">
              <article v-for="(event, i) in searchResults" :key="`${event.date}-${event.year}-${i}`" class="py-5 first:pt-0">
                <div class="mb-1.5 flex items-center gap-2.5 font-mono text-xs tabular-nums text-white-45">
                  <button
                    type="button"
                    class="transition-colors hover:text-accent-soft"
                    @click="jumpToRecorded(event.date)"
                  >
                    {{ formatMMDDLabel(event.date, lang) }}
                  </button>
                  <span class="text-white-18" aria-hidden="true">·</span>
                  <span>{{ formatYearHeading(event.year, lang, t('otdYearUnknown')) }}</span>
                </div>
                <h2 class="text-base font-semibold leading-snug text-white-92">{{ event.title }}</h2>
                <p v-if="event.desc" class="mt-1.5 text-sm leading-[1.85] text-white-55">{{ event.desc }}</p>
                <div v-if="event.link || event.item" class="mt-3 flex items-center gap-5 text-xs">
                  <a v-if="event.link" :href="event.link" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft">
                    <span>{{ t('source') }}</span>
                    <ArrowUpRight :size="12" :stroke-width="2" />
                  </a>
                  <a v-if="event.item" href="#" class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft" @click.prevent="goItem(event.item)">
                    <span>{{ t('explore') }}</span>
                    <ArrowRight :size="12" :stroke-width="2" />
                  </a>
                </div>
              </article>
            </div>
          </template>

          <!-- 2. 本月总览 -->
          <template v-else-if="viewMode === 'month'">
            <p v-if="monthRecordedGroups.length === 0" class="py-16 text-center text-sm text-white-42">
              {{ t('noEvents') }}
            </p>
            <div v-else class="space-y-9">
              <section v-for="dayGroup in monthRecordedGroups" :key="dayGroup.date">
                <h2 class="mb-3 text-xs font-mono font-semibold tabular-nums text-accent-soft/85">
                  <button type="button" class="transition-colors hover:text-white" @click="goDate(new Date(calendarYear, calendarMonth, dayGroup.day))">
                    {{ formatMMDDLabel(dayGroup.date, lang) }}
                  </button>
                </h2>
                <div class="divide-y divide-white-05">
                  <article v-for="(event, i) in dayGroup.events" :key="`${event.year}-${i}`" class="py-4 first:pt-0">
                    <div class="mb-1 font-mono text-xs tabular-nums text-white-40">
                      {{ formatYearHeading(event.year, lang, t('otdYearUnknown')) }}
                    </div>
                    <h3 class="text-base font-semibold leading-snug text-white-92">{{ event.title }}</h3>
                    <p v-if="event.desc" class="mt-1.5 text-sm leading-[1.85] text-white-55">{{ event.desc }}</p>
                    <div v-if="event.link || event.item" class="mt-3 flex items-center gap-5 text-xs">
                      <a v-if="event.link" :href="event.link" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft">
                        <span>{{ t('source') }}</span>
                        <ArrowUpRight :size="12" :stroke-width="2" />
                      </a>
                      <a v-if="event.item" href="#" class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft" @click.prevent="goItem(event.item)">
                        <span>{{ t('explore') }}</span>
                        <ArrowRight :size="12" :stroke-width="2" />
                      </a>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </template>

          <!-- 3. 当日档案（默认） -->
          <template v-else>
            <div v-if="groupedEvents.length === 0" class="py-16 text-center">
              <p class="text-sm text-white-45">{{ t('noEvents') }}</p>
              <div v-if="prevRecorded || nextRecorded" class="mt-4 flex items-center justify-center gap-4 text-xs tabular-nums text-white-55">
                <button v-if="prevRecorded" type="button" class="inline-flex min-h-8 items-center gap-1 transition-colors hover:text-accent-soft" @click="jumpToRecorded(prevRecorded)">
                  <span aria-hidden="true">←</span>
                  <span>{{ formatMMDDLabel(prevRecorded, lang) }}</span>
                </button>
                <span v-if="prevRecorded && nextRecorded" class="text-white-15" aria-hidden="true">·</span>
                <button v-if="nextRecorded" type="button" class="inline-flex min-h-8 items-center gap-1 transition-colors hover:text-accent-soft" @click="jumpToRecorded(nextRecorded)">
                  <span>{{ formatMMDDLabel(nextRecorded, lang) }}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>

            <div v-else class="space-y-9">
              <section v-for="group in groupedEvents" :key="group.year">
                <h2 class="mb-3 font-mono text-xs font-semibold tabular-nums text-accent-soft/85">
                  {{ formatYearHeading(group.year, lang, t('otdYearUnknown')) }}
                </h2>

                <div class="divide-y divide-white-05">
                  <article v-for="(event, i) in group.events" :key="`${group.year}-${i}`" class="py-4 first:pt-0">
                    <h3 class="text-base font-semibold leading-snug text-white-92 sm:text-[1.0625rem]">
                      {{ event.title }}
                    </h3>
                    <p v-if="event.desc" class="mt-1.5 text-sm leading-[1.85] text-white-55">
                      {{ event.desc }}
                    </p>
                    <div v-if="event.link || event.item" class="mt-3 flex items-center gap-5 text-xs">
                      <a
                        v-if="event.link"
                        :href="event.link"
                        target="_blank"
                        rel="noopener"
                        class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft"
                      >
                        <span>{{ t('source') }}</span>
                        <ArrowUpRight :size="12" :stroke-width="2" />
                      </a>
                      <a
                        v-if="event.item"
                        href="#"
                        class="inline-flex items-center gap-1 text-white-40 transition-colors hover:text-accent-soft"
                        @click.prevent="goItem(event.item)"
                      >
                        <span>{{ t('explore') }}</span>
                        <ArrowRight :size="12" :stroke-width="2" />
                      </a>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.events-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--white-18) transparent;
}
.events-scroll::-webkit-scrollbar {
  width: 6px;
}
.events-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.events-scroll::-webkit-scrollbar-thumb {
  background: var(--white-18);
  border-radius: 9999px;
}
.events-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--white-35);
}
</style>
