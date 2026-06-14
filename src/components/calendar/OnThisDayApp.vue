<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@nanostores/vue';
import { detailMode } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

const props = defineProps({ 
  allEvents: { type: String, default: '[]' } 
});

const allEvents = (() => {
  try { return JSON.parse(props.allEvents); } 
  catch (e) { return []; }
})();

const { t } = useI18n();
const router = useRouter();
const mode = useStore(detailMode);

function goItem(itemId) {
  if (mode.value === 'modal') {
    router.push({ path: '/', query: { item: itemId } });
  } else {
    window.location.href = url('/#' + itemId);
  }
}

const getMonthName = (date) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
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
  const filtered = allEvents.filter(e => e.date === mmdd);
  
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

const contentScrollRef = ref(null);

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
function prevMonth() { 
  if (calendarMonth.value === 0) { calendarYear.value--; calendarMonth.value = 11; } 
  else { calendarMonth.value--; }
}
function nextMonth() { 
  if (calendarMonth.value === 11) { calendarYear.value++; calendarMonth.value = 0; } 
  else { calendarMonth.value++; }
}

function hasEvents(mmdd) { return allEvents.some(e => e.date === mmdd); }
function isSelected(mmdd) { return toMMDD(currentDate.value) === mmdd; }
function isTodayGrid(mmdd) { return toMMDD(today) === mmdd; }

onMounted(() => {
  document.dispatchEvent(new CustomEvent('vue-ready'));
});
</script>

<template>
  <!-- 核心外围容器：极暗底色，现代无衬线字体，严格一屏限制 -->
  <div class="h-screen w-full overflow-hidden bg-[#09090b] text-zinc-50 font-sans flex flex-col md:flex-row selection:bg-white selection:text-black">

    <!-- ================= 左侧：极简控制台 ================= -->
    <aside class="w-full md:w-[360px] lg:w-[400px] shrink-0 border-r border-white/[0.06] flex flex-col z-20 bg-[#09090b]">
      
      <!-- 极简 Header -->
      <div class="h-16 flex items-center px-8 text-xs font-medium text-zinc-400 tracking-widest uppercase">
        {{ t('onThisDay') }}
      </div>

      <!-- Hero Date 显示区 -->
      <div class="px-8 pt-6 pb-10">
        <h1 class="text-6xl md:text-7xl font-semibold tracking-tighter text-white">
          {{ getMonthName(currentDate) }} {{ pad(currentDate.getDate()) }}
        </h1>

      </div>

      <!-- 日历面板 -->
      <div class="px-8 pb-8 flex flex-col">
        
        <!-- 月份控制器 -->
        <div class="flex justify-between items-center mb-6">
          <span class="text-sm font-medium tracking-wide text-zinc-300">
            {{ getMonthName(new Date(calendarYear, calendarMonth)) }} {{ calendarYear }}
          </span>
          <div class="flex items-center gap-1">
            <button @click="prevMonth" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button @click="goToday" class="px-3 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-xs font-medium text-zinc-400 hover:text-white transition-colors">
              {{ t('today') }}
            </button>
            <button @click="nextMonth" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>

        <!-- 极简网格表头 -->
        <div class="grid grid-cols-7 text-center mb-2">
          <div v-for="d in weekDays" :key="d" class="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{{ d }}</div>
        </div>
        
        <!-- 日历网格 -->
        <div class="grid grid-cols-7 text-center gap-1">
          <template v-for="(d, i) in calendarDays" :key="i">
            <div v-if="d === null" class="aspect-square"></div>
            <button
              v-else
              @click="goDate(new Date(calendarYear, calendarMonth, d))"
              class="aspect-square flex flex-col items-center justify-center relative rounded-full text-sm font-medium transition-all duration-200"
              :class="{
                'bg-white text-black shadow-lg shadow-white/10': isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`),
                'text-zinc-300 hover:bg-white/10': !isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`),
                'ring-1 ring-white/20 text-white': !isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`) && isTodayGrid(`${pad(calendarMonth + 1)}-${pad(d)}`)
              }"
            >
              <span>{{ d }}</span>
              
              <!-- 微小的事件指示点 -->
              <span v-if="hasEvents(`${pad(calendarMonth + 1)}-${pad(d)}`) && !isSelected(`${pad(calendarMonth + 1)}-${pad(d)}`)"
                    class="absolute bottom-1.5 w-1 h-1 rounded-full bg-zinc-600" />
            </button>
          </template>
        </div>
      </div>
    </aside>

    <!-- ================= 右侧：内容流动区 ================= -->
    <main class="flex-1 min-h-0 relative z-10 bg-[#09090b]">
      
      <!-- 隐藏原生滚动条，保留干净视窗 -->
      <div ref="contentScrollRef" class="h-full w-full overflow-y-auto hide-scrollbar scroll-smooth">
        
        <!-- 空状态：极致克制 -->
        <div v-if="groupedEvents.length === 0" class="h-full flex items-center justify-center">
          <div class="text-center">
            <svg class="w-12 h-12 text-zinc-800 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-zinc-500 font-medium">{{ t('noEvents') }}</p>
          </div>
        </div>

        <!-- 事件流 -->
        <div v-else class="max-w-4xl mx-auto pb-32">
          <div v-for="(group, gIdx) in groupedEvents" :key="group.year" class="relative group/era">
            
            <!-- Sticky 毛玻璃年份头 -->
            <div class="sticky top-0 z-20 pt-10 pb-4 px-8 md:px-16 backdrop-blur-xl bg-[#09090b]/80 border-b border-white/[0.04]">
              <h2 class="text-3xl font-bold tracking-tight text-white flex items-center gap-4">
                {{ group.year }}
                <div class="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"></div>
              </h2>
            </div>

            <!-- 具体事件列表 -->
            <div class="px-8 md:px-16 pt-8 space-y-12">
              <article v-for="(event, i) in group.items" :key="i" class="group/item">
                
                <h3 class="text-xl md:text-2xl font-medium leading-snug mb-3 text-zinc-100 group-hover/item:text-white transition-colors">
                  {{ event.title }}
                </h3>
                
                <p v-if="event.desc" class="text-sm md:text-base leading-relaxed text-zinc-400 mb-5 max-w-3xl">
                  {{ event.desc }}
                </p>

                <!-- 科技感极其低调的操作链接 -->
                <div class="flex flex-wrap items-center gap-5 mt-2">
                  <a v-if="event.link" :href="event.link" target="_blank" rel="noopener"
                    class="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-white uppercase tracking-wider transition-colors">
                    <span>{{ t('source') }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
                  </a>
                  <a v-if="event.item" @click.prevent="goItem(event.item)" href="#"
                    class="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-white uppercase tracking-wider transition-colors">
                    <span>{{ t('explore') }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </a>
                </div>
              </article>
            </div>

          </div>
        </div>

      </div>
    </main>

  </div>
</template>

<style>
/* 引入现代无衬线字体 Inter */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* 全局应用 Inter 字体 */
.font-sans {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* 隐藏右侧内容的滚动条，保持画面干净无干扰 */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
</style>