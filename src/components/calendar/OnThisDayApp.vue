<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

const props = defineProps({ allEvents: String });
const allEvents = JSON.parse(props.allEvents);

const { t } = useI18n();

const weekDays = computed(() => t('weekDays').split(','));

function toMMDD(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

function formatDate(d) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return t('dateFmt').replace('{m}', String(m)).replace('{d}', String(day));
}

function formatMonthYear(y, m) {
  return t('monthYearFmt').replace('{y}', String(y)).replace('{m}', String(m + 1));
}

const today = new Date();
const currentDate = ref(today);
const events = computed(() => {
  const mmdd = toMMDD(currentDate.value);
  return allEvents.filter(e => e.date === mmdd);
});

const showCalendar = ref(false);
const calendarYear = ref(today.getFullYear());
const calendarMonth = ref(today.getMonth());

function getMonthDays(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { return new Date(y, m, 1).getDay(); }

const calendarDays = computed(() => {
  const days = [];
  const dim = getMonthDays(calendarYear.value, calendarMonth.value);
  const fd = getFirstDay(calendarYear.value, calendarMonth.value);
  for (let i = 0; i < fd; i++) days.push(null);
  for (let d = 1; d <= dim; d++) days.push(d);
  return days;
});

function goDate(d) { currentDate.value = d; showCalendar.value = false; }
function goToday() { currentDate.value = new Date(); showCalendar.value = false; }
function goPrev() { const d = new Date(currentDate.value); d.setDate(d.getDate() - 1); currentDate.value = d; }
function goNext() { const d = new Date(currentDate.value); d.setDate(d.getDate() + 1); currentDate.value = d; }
function openCalendar() { calendarYear.value = currentDate.value.getFullYear(); calendarMonth.value = currentDate.value.getMonth(); showCalendar.value = !showCalendar.value; }
function prevMonth() { if (calendarMonth.value === 0) { calendarYear.value--; calendarMonth.value = 11; } else calendarMonth.value--; }
function nextMonth() { if (calendarMonth.value === 11) { calendarYear.value++; calendarMonth.value = 0; } }
function hasEvents(mmdd) { return allEvents.some(e => e.date === mmdd); }
function isToday(mmdd) { return toMMDD(new Date()) === mmdd; }
function isSelected(mmdd) { return toMMDD(currentDate.value) === mmdd; }

function onDocClick(e) {
  const cal = document.querySelector('.calendar-popover');
  if (cal && !cal.contains(e.target)) showCalendar.value = false;
}

onMounted(() => { document.addEventListener('mousedown', onDocClick); document.dispatchEvent(new CustomEvent('vue-ready')); });
onUnmounted(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
  <div class="w-full max-w-[600px] px-4 pt-12 pb-16">
    <!-- Date navigation -->
    <div class="flex items-center justify-center gap-4 mb-8 select-none">
      <button @click="goPrev" class="text-white/40 hover:text-white/80 transition-colors text-xl leading-none px-2 py-1" :aria-label="t('prevDay')">
        &larr;
      </button>
      <button @click="openCalendar" class="text-white/90 hover:text-white text-lg font-medium tracking-wider transition-colors">
        {{ formatDate(currentDate) }}
      </button>
      <button @click="goNext" class="text-white/40 hover:text-white/80 transition-colors text-xl leading-none px-2 py-1" :aria-label="t('nextDay')">
        &rarr;
      </button>
    </div>

    <!-- Title -->
    <h1 class="text-2xl font-bold tracking-widest text-center mb-10 text-white/85">{{ t('onThisDay') }}</h1>

    <!-- Calendar popover -->
    <Teleport to="body">
      <div v-if="showCalendar" class="calendar-popover fixed z-50 bg-[#1a1a1a] border border-white/10 rounded-lg p-4 shadow-2xl"
           style="top: 120px; left: 50%; transform: translateX(-50%)">
        <div class="flex items-center justify-between mb-3">
          <button @click="prevMonth" class="text-white/50 hover:text-white/80 px-1">&larr;</button>
          <span class="text-sm text-white/70">{{ formatMonthYear(calendarYear, calendarMonth) }}</span>
          <button @click="nextMonth" class="text-white/50 hover:text-white/80 px-1">&rarr;</button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center mb-1">
          <div v-for="d in weekDays" :key="d" class="text-[0.65rem] text-white/30 py-1">{{ d }}</div>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center">
          <template v-for="(d, i) in calendarDays" :key="i">
            <div v-if="d === null" />
            <button
              v-else
              @click="goDate(new Date(calendarYear, calendarMonth, d))"
              class="text-sm py-1 rounded transition-colors"
              :class="{
                'bg-white/15 text-white': isSelected(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
                'text-white/80 font-bold': !isSelected(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`) && isToday(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
                'text-white/50 hover:text-white/80 hover:bg-white/5': !isSelected(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`) && !isToday(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
              }"
            >
              {{ d }}
              <span v-if="hasEvents(`${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)"
                    class="block mx-auto w-1 h-1 rounded-full bg-white/25 mt-0.5" />
            </button>
          </template>
        </div>
        <button @click="goToday" class="mt-3 text-xs text-white/40 hover:text-white/70 transition-colors block mx-auto">{{ t('today') }}</button>
      </div>
    </Teleport>

    <!-- Event list -->
    <div v-if="events.length > 0" class="flex flex-col gap-8">
      <div v-for="(event, i) in events" :key="i">
        <div class="text-white/80 leading-relaxed">
          <span v-if="event.year" class="text-white/40 text-sm font-light mr-2">{{ event.year }}</span>
          <span class="text-white/85 font-medium">{{ event.title }}</span>
        </div>
        <p v-if="event.desc" class="mt-1.5 text-white/45 text-sm leading-relaxed">{{ event.desc }}</p>
        <div class="flex items-center gap-4 mt-2">
          <a v-if="event.link" :href="event.link" target="_blank" rel="noopener noreferrer"
             class="text-white/25 hover:text-white/50 text-xs transition-colors">{{ t('externalLink') }} &nearr;</a>
          <a v-if="event.item" :href="url(`/#${event.item}`)"
             class="text-white/25 hover:text-white/50 text-xs transition-colors">{{ t('relatedItem') }} &rarr;</a>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <p v-else class="text-center text-white/25 text-sm">{{ t('noEvents') }}</p>

    <!-- Back -->
    <div class="mt-16 pt-8 border-t border-white/10 text-center">
      <router-link to="/" class="text-white/25 hover:text-white/50 text-sm transition-colors">&larr; {{ t('backToIceberg') }}</router-link>
    </div>
  </div>
</template>
