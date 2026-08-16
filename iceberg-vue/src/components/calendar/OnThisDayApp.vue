<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@nanostores/vue';
import { detailMode } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';
import LiquidGradient from '../layout/LiquidGradient.vue';

const props = defineProps({
  allEvents: { type: Array, default: () => [] }
});

// 顶层解构会丢失 props 响应性，改为 computed 派生
const allEvents = computed(() => props.allEvents);
const eventDateSet = computed(() => new Set(allEvents.value.map(e => e.date)));

const { t, lang } = useI18n();
const router = useRouter();
const mode = useStore(detailMode);

// 每次进入页面重新随机流体背景，图案不重复
const bgSeed = ref(Math.floor(Math.random() * 1001));
const contentScrollRef = ref(null);

function goItem(itemId) {
  if (mode.value === 'modal') {
    router.push({ path: '/', query: { item: itemId } });
  } else {
    window.location.href = url('/#' + itemId);
  }
}

// P2-17：月份名随界面语言本地化（zh-CN/ja-JP 显示「3月」，en-US 显示「Mar」）
const monthLocales = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' };
const getMonthName = (date) => new Intl.DateTimeFormat(monthLocales[lang.value] || 'zh-CN', { month: 'short' }).format(date);
const weekDays = computed(() => t('weekDays') ? t('weekDays').split(',') : ['S', 'M', 'T', 'W', 'T', 'F', 'S']);

function toMMDD(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

const today = new Date();
const currentDate = ref(today);
const calendarYear = ref(today.getFullYear());
const calendarMonth = ref(today.getMonth());

const groupedEvents = computed(() => {
  const mmdd = toMMDD(currentDate.value);
  const filtered = allEvents.value.filter(e => e.date === mmdd);

  const groups = {};
  filtered.forEach(event => {
    const y = event.year || 'Unknown';
    if (!groups[y]) groups[y] = [];
    groups[y].push(event);
  });

  return Object.keys(groups)
    .sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return parseInt(b) - parseInt(a);
    })
    .map(year => ({
      year: year,
      items: groups[year]
    }));
});

function getMonthDays(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { return new Date(y, m, 1).getDay(); }

const calendarDays = computed(() => {
  const days = [];
  const dim = getMonthDays(calendarYear.value, calendarMonth.value);
  const fd = getFirstDay(calendarYear.value, calendarMonth.value);
  for (let i = 0; i < fd; i++) days.push(null);
  for (let d = 1; d <= dim; d++) days.push(d);

  const totalCells = 42;
  const currentLength = days.length;
  for(let i = 0; i < totalCells - currentLength; i++) {
    days.push(null);
  }
  return days;
});

function goDate(d) {
  currentDate.value = d;
  calendarYear.value = d.getFullYear();
  calendarMonth.value = d.getMonth();

  nextTick(() => {
    if (contentScrollRef.value) {
      contentScrollRef.value.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function goToday() { goDate(new Date()); }
function goPrevDay() { const d = new Date(currentDate.value); d.setDate(d.getDate() - 1); goDate(d); }
function goNextDay() { const d = new Date(currentDate.value); d.setDate(d.getDate() + 1); goDate(d); }
function prevMonth() {
  if (calendarMonth.value === 0) { calendarYear.value--; calendarMonth.value = 11; }
  else { calendarMonth.value--; }
}
function nextMonth() {
  if (calendarMonth.value === 11) { calendarYear.value++; calendarMonth.value = 0; }
  else { calendarMonth.value++; }
}

function hasEvents(mmdd) { return eventDateSet.value.has(mmdd); }
function isSelected(mmdd) { return toMMDD(currentDate.value) === mmdd; }
function isTodayGrid(mmdd) { return toMMDD(today) === mmdd; }

onMounted(() => {
  document.dispatchEvent(new CustomEvent('vue-ready'));
});
</script>

<template>
  <div class="relative h-dvh min-h-screen w-full overflow-hidden bg-surface font-sans text-white-92">
    <!-- 橙蓝黑流体背景：固定铺满视口，纯装饰不拦截交互 -->
    <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <LiquidGradient colorA="#000000" colorB="#012945" colorC="#045B8D" colorD="#0076A2" colorE="#B25512" :seed="bgSeed" />
      <span class="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/70"></span>
    </div>

    <div class="relative z-10 flex h-full w-full flex-col lg:flex-row">
      <!-- 左侧：日期 + 日历玻璃面板 -->
      <aside
        class="no-scrollbar z-20 flex w-full shrink-0 flex-col overflow-y-auto border-b border-white-06 max-h-[45dvh] lg:max-h-none lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r xl:w-[420px]"
      >
        <div class="flex items-center justify-between px-6 pt-5 sm:px-8">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-white-45">{{ t('onThisDay') }}</span>
          <router-link to="/home" class="inline-flex items-center gap-1 text-xs text-white-45 transition-colors duration-200 hover:text-white-85">
            <span aria-hidden="true">←</span><span>{{ t('backToHome') }}</span>
          </router-link>
        </div>

        <div class="flex flex-1 flex-col px-6 pt-6 pb-8 sm:px-8 lg:justify-center">
          <!-- 日期主显 + 前后日切换 -->
          <div class="mb-8 flex items-center justify-between gap-3">
            <button @click="goPrevDay"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white-45 transition-colors duration-200 hover:bg-white-08 hover:text-white-85 md:h-10 md:w-10"
              :aria-label="t('prevDay')">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>

            <div class="text-center">
              <span class="block text-tiny uppercase tracking-[0.2em] text-white-35">{{ getMonthName(currentDate) }} {{ currentDate.getFullYear() }}</span>
              <span class="block text-6xl font-black tracking-tight text-white-92">{{ pad(currentDate.getDate()) }}</span>
            </div>

            <button @click="goNextDay"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white-45 transition-colors duration-200 hover:bg-white-08 hover:text-white-85 md:h-10 md:w-10"
              :aria-label="t('nextDay')">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>

          <!-- 月份控制器 -->
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm font-semibold tracking-wide text-white-60">
              {{ getMonthName(new Date(calendarYear, calendarMonth)) }} {{ calendarYear }}
            </span>
            <div class="flex items-center gap-1">
              <button @click="prevMonth" :aria-label="t('prevMonth')"
                class="flex h-10 w-10 items-center justify-center rounded-full text-white-40 transition-colors duration-200 hover:bg-white-08 hover:text-white-85 md:h-8 md:w-8">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button @click="goToday"
                class="flex h-10 items-center justify-center rounded-full px-3 text-xs font-medium text-white-40 transition-colors duration-200 hover:bg-white-08 hover:text-white-85 md:h-8">
                {{ t('today') }}
              </button>
              <button @click="nextMonth" :aria-label="t('nextMonth')"
                class="flex h-10 w-10 items-center justify-center rounded-full text-white-40 transition-colors duration-200 hover:bg-white-08 hover:text-white-85 md:h-8 md:w-8">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          <!-- 星期表头 -->
          <div class="mb-2 grid grid-cols-7 text-center">
            <div v-for="d in weekDays" :key="d" class="text-tiny font-semibold uppercase tracking-wider text-white-30">{{ d }}</div>
          </div>

          <!-- 日历网格 -->
          <div class="grid grid-cols-7 gap-1 text-center">
            <template v-for="(d, i) in calendarDays" :key="i">
              <div v-if="d === null" class="aspect-square"></div>
              <button
                v-else
                @click="goDate(new Date(calendarYear, calendarMonth, d))"
                class="relative aspect-square rounded-full text-sm font-medium transition-colors duration-150"
                :class="isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`)
                  ? 'bg-accent text-black shadow-lg shadow-accent/20'
                  : isTodayGrid(`${pad(calendarMonth + 1)}-${pad(d)}`)
                    ? 'text-accent-soft ring-1 ring-accent-soft/60 hover:bg-white-08'
                    : 'text-white-45 hover:bg-white-08 hover:text-white-85'"
              >
                <span>{{ d }}</span>
                <span v-if="hasEvents(`${pad(calendarMonth + 1)}-${pad(d)}`) && !isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`)"
                      class="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white-35" />
              </button>
            </template>
          </div>
        </div>
      </aside>

      <!-- 右侧：事件流（唯一允许上下滚动的区域） -->
      <main ref="contentScrollRef" class="events-scroll relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-3xl px-5 py-8 sm:px-10 sm:py-12">
          <!-- 空状态 -->
          <div v-if="groupedEvents.length === 0" class="rounded-xl border border-dashed border-white-08 bg-white-02 px-6 py-16 text-center">
            <p class="text-sm text-white-35">{{ t('noEvents') }}</p>
          </div>

          <!-- 按年份分组的事件流 -->
          <div v-else class="space-y-10">
            <section v-for="group in groupedEvents" :key="group.year">
              <h2 class="mb-5 flex items-center gap-3 border-b border-white-05 pb-2 text-lg font-extrabold tracking-[0.08em] text-white-55">
                <span class="font-mono text-sm text-white-30">{{ group.year }}</span>
                <span class="h-px flex-1 bg-white-05" aria-hidden="true"></span>
              </h2>

              <div class="space-y-5">
                <article v-for="(event, i) in group.items" :key="i"
                  class="group/item rounded-xl border border-white-05 bg-white-02 p-5 transition-colors duration-200 hover:border-white-12 hover:bg-white-04">
                  <h3 class="text-base font-bold leading-[1.4] text-white-85 sm:text-lg">{{ event.title }}</h3>
                  <p v-if="event.desc" class="mt-2 max-w-3xl text-sm leading-[1.85] text-white-40">{{ event.desc }}</p>

                  <div class="mt-4 flex flex-wrap items-center gap-5">
                    <a v-if="event.link" :href="event.link" target="_blank" rel="noopener"
                      class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white-35 transition-colors duration-200 hover:text-accent-soft">
                      <span>{{ t('source') }}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
                    </a>
                    <a v-if="event.item" @click.prevent="goItem(event.item)" href="#"
                      class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white-35 transition-colors duration-200 hover:text-accent-soft">
                      <span>{{ t('explore') }}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </a>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 右侧事件流：细滚动条，保持视觉干净但可发现、可拖动 */
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
