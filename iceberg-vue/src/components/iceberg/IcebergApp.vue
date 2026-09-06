<script setup lang="ts">
// Single Vue island: FilterSidebar + ActiveFilters + Search + ItemInteractivity share one instance
import { computed, ref, onMounted, onUnmounted, watchEffect, inject } from 'vue';
import { useStore } from '@nanostores/vue';
import { activeCategories, activeTags, searchQuery, toggleCategory, toggleTag, tagFilterMode, searchMode, hiddenCategories, hiddenTags, specialFilter, favFilter, hideCategory, hideTag, hasActiveFilter } from '../../lib/filterStore';
import { fontSize } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import ItemInteractivity from '../items/ItemInteractivity.vue';
import { CATEGORY_COLORS_KEY, TAG_MAP_KEY, DEFAULT_COLOR_KEY } from '../../lib/injectionKeys';
import FloatingButtons from './FloatingButtons.vue';

const colors = inject(CATEGORY_COLORS_KEY, {})
const tMap = inject(TAG_MAP_KEY, {})
const cats = Object.entries(colors)
const tagList = Object.entries(tMap)
const defColor = inject(DEFAULT_COLOR_KEY, '#FFFFFF')

const activeCats = useStore(activeCategories);
const activeT = useStore(activeTags);
const query = useStore(searchQuery);
const { t } = useI18n();

// Sidebar state
const interactivityRef = ref<{ showRandom: () => void } | null>(null);
function onRandom() { interactivityRef.value?.showRandom(); }

const sidebarOpen = ref(false);
const sidebarRef = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent) {
  if (sidebarOpen.value && sidebarRef.value && !sidebarRef.value.contains(e.target as Node)) {
    sidebarOpen.value = false;
  }
}
const searchInputRef = ref<HTMLInputElement | null>(null)
function onGlobalKey(e: KeyboardEvent) {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}
onMounted(() => { document.addEventListener('mousedown', onDocClick); document.addEventListener('keydown', onGlobalKey); document.dispatchEvent(new CustomEvent('vue-ready')); });
onUnmounted(() => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onGlobalKey); });

// Font size
const FONT_SCALE: Record<string, string> = { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem' };
const fs = useStore(fontSize);
watchEffect(() => {
  document.documentElement.style.setProperty('--item-font-size', FONT_SCALE[fs.value] || '1rem');
});

// 排序已迁移到 IndexView 声明式实现（tierItems computed），此处不再做命令式 DOM 重排

// Active filters helpers
const tagMode = useStore(tagFilterMode);
const sMode = useStore(searchMode);
const hiddenCats = useStore(hiddenCategories);
const hiddenT = useStore(hiddenTags);
const splFilter = useStore(specialFilter);
const favF = useStore(favFilter);
const hasActive = computed(() => hasActiveFilter({
  query: query.value,
  cats: activeCats.value,
  tags: activeT.value,
  hCats: hiddenCats.value,
  hTags: hiddenT.value,
  spl: splFilter.value,
  favF: favF.value,
}));
function clearAll() { searchQuery.set(''); activeCategories.set([]); activeTags.set([]); hiddenCategories.set([]); hiddenTags.set([]); specialFilter.set('all'); favFilter.set(false); }

// Debounced search — delay store writes by 150ms
let debounce = 0;
function onSearchInputEvent(e: Event) { onSearchInput((e.target as HTMLInputElement).value) }
function onSearchInput(val: string) {
  clearTimeout(debounce);
  debounce = window.setTimeout(() => searchQuery.set(val), 150);
}

// Mobile drawer drag-to-dismiss (rAF throttled)
let dragStartY = 0;
let dragPanY = 0;
let dragTick = false;
function onDrawerTouchStart(e: TouchEvent) { dragStartY = e.touches[0].clientY; dragPanY = 0; dragTick = false; }
function onDrawerTouchMove(e: TouchEvent) {
  dragPanY = e.touches[0].clientY - dragStartY;
  if (dragPanY > 10 && !dragTick) {
    dragTick = true;
    requestAnimationFrame(() => {
      if (sidebarRef.value) {
        sidebarRef.value.style.transform = `translateY(${dragPanY}px)`;
        sidebarRef.value.style.transition = 'none';
      }
      dragTick = false;
    });
  }
}
function onDrawerTouchEnd() {
  if (!sidebarRef.value) return;
  sidebarRef.value.style.transition = '';
  if (dragPanY > 80) sidebarOpen.value = false;
  else sidebarRef.value.style.transform = '';
}
// 系统手势打断（通知栏下拉等）时复位拖拽位移，避免 transform 残留
function onDrawerTouchCancel() {
  dragPanY = 0;
  if (sidebarRef.value) {
    sidebarRef.value.style.transition = '';
    sidebarRef.value.style.transform = '';
  }
}
</script>

<template>
  <!-- Sidebar overlay -->
  <div v-if="sidebarOpen" class="fixed inset-0 z-[10002] bg-black/40 lg:bg-transparent" @click="sidebarOpen = false" />
  <!-- Desktop sidebar toggle -->
  <button
    class="sidebar-toggle hidden lg:flex"
    :style="sidebarOpen ? { left: '-100px' } : { left: '0px' }"
    @mousedown.stop @click="sidebarOpen = !sidebarOpen"
    :aria-label="t('filter')"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>

  <!-- Sidebar panel -->
  <aside ref="sidebarRef" class="sidebar-panel no-scrollbar" :class="{ open: sidebarOpen }" style="width:480px">
    <!-- Mobile drag handle -->
    <div class="drawer-handle lg:hidden"
      @touchstart="onDrawerTouchStart" @touchmove="onDrawerTouchMove" @touchend="onDrawerTouchEnd" @touchcancel="onDrawerTouchCancel">
      <div class="sheet-handle"></div>
    </div>
    <div class="p-6 pl-8 pr-30 pt-20 pb-12 flex flex-col gap-6 w-full">
      <!-- Search -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-bold text-gray-400 tracking-widest uppercase">{{ t('search') }}</span>
          <button type="button" class="flex text-[length:var(--font-micro)] font-bold tracking-wider uppercase cursor-pointer select-none" :aria-pressed="sMode === 'full'" @click="searchMode.set(sMode === 'full' ? 'title' : 'full')">
            <span :class="sMode === 'full' ? 'text-white/80 bg-white/15' : 'text-white/60 hover:text-white/90'" class="px-1.5 py-0.5 transition-colors">{{ t('searchFullText') }}</span>
            <span :class="sMode === 'title' ? 'text-white/80 bg-white/15' : 'text-white/60 hover:text-white/90'" class="px-1.5 py-0.5 transition-colors">{{ t('searchTitleOnly') }}</span>
          </button>
        </div>
        <input
          ref="searchInputRef"
          type="text" :value="query" @input="onSearchInputEvent"
          :placeholder="t('search')"
          autocomplete="off"
          class="w-full py-1.5 px-2 text-[length:var(--font-base)] max-sm:text-base text-white/70 bg-white/[0.03] placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
        />
      </div>

      <!-- Categories -->
      <div>
        <div class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">{{ t('categories') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="[cat, color] in cats" :key="cat" @click="toggleCategory(cat)" @contextmenu.prevent="hideCategory(cat)"
            :class="['group flex items-center gap-2.5 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              activeCats.length === 0 || activeCats.includes(cat) ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']"
            :title="cat" :aria-pressed="activeCats.length === 0 || activeCats.includes(cat)">
            <span class="block w-2.5 h-2.5 shrink-0 transition-opacity duration-200"
                  :class="activeCats.length === 0 || activeCats.includes(cat) ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'"
                  :style="{ backgroundColor: color }" />
            <span class="mt-[1px]">{{ cat }}</span>
          </button>
        </div>
      </div>

      <div class="h-px w-full bg-gradient-to-r from-white/15 to-transparent my-2" />

      <!-- Tags -->
      <div>
        <div class="flex items-center gap-2 mb-3 items-baseline">
          <span class="text-xs font-bold text-gray-400 tracking-widest uppercase">{{ t('tags') }}</span>
          <button type="button" class="flex text-[length:var(--font-micro)] font-bold tracking-wider uppercase cursor-pointer select-none" :aria-pressed="tagMode === 'AND'" @click="tagFilterMode.set(tagMode === 'OR' ? 'AND' : 'OR')">
            <span :class="tagMode === 'OR' ? 'text-white/80 bg-white/15' : 'text-white/60 hover:text-white/90'" class="px-1.5 py-0.5 transition-colors">OR</span>
            <span :class="tagMode === 'AND' ? 'text-white/80 bg-white/15' : 'text-white/60 hover:text-white/90'" class="px-1.5 py-0.5 transition-colors">AND</span>
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="[emoji, name] in tagList" :key="emoji" @click="toggleTag(emoji)" @contextmenu.prevent="hideTag(emoji)"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              activeT.length === 0 || activeT.includes(emoji) ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']"
            :title="name" :aria-pressed="activeT.length === 0 || activeT.includes(emoji)">
            <span class="text-[1.1em] transition duration-200"
                  :class="activeT.length === 0 || activeT.includes(emoji) ? 'opacity-100 grayscale-0' : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0'">{{ emoji }}</span>
            <span class="mt-[1px]">{{ name }}</span>
          </button>
        </div>
      </div>

      <div class="h-px w-full bg-gradient-to-r from-white/15 to-transparent my-2" />

      <div>
        <div class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">{{ t('special') }}</div>
        <div class="flex flex-wrap gap-1.5">
          <button @click="specialFilter.set(splFilter === 'hasLink' ? 'all' : 'hasLink')"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              splFilter === 'hasLink' ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']">
            {{ t('hasLink') }}
          </button>
          <button @click="specialFilter.set(splFilter === 'hasDesc' ? 'all' : 'hasDesc')"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              splFilter === 'hasDesc' ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']">
            {{ t('hasDesc') }}
          </button>
          <button @click="specialFilter.set(splFilter === 'isNew' ? 'all' : 'isNew')"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              splFilter === 'isNew' ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']">
            {{ t('isNew') }}
          </button>
          <button @click="specialFilter.set(splFilter === 'noLinkNoDesc' ? 'all' : 'noLinkNoDesc')"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              splFilter === 'noLinkNoDesc' ? 'bg-white/20 text-white hover:bg-white hover:text-black' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']">
            {{ t('needComplete') }}
          </button>
          <button @click="favFilter.set(!favF)"
            :class="['group flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              favF ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-transparent text-gray-400 hover:bg-white hover:text-black']">
            {{ favF ? '★ ' + t('unfavorite') : '☆ ' + t('favorite') }}
          </button>
        </div>
      </div>
    </div>
  </aside>

  <!-- Active filter chips -->
  <div v-if="hasActive" class="flex flex-wrap items-center gap-1.5 mt-10 mb-2 px-[var(--header-padding-x)]">
    <button v-if="query" @click="searchQuery.set('')"
      class="filter-chip">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-50"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
      <span class="truncate max-w-[120px]">{{ query }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="chip-x"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
    <button v-for="cat in activeCats" :key="cat" @click="toggleCategory(cat)" @contextmenu.prevent="hideCategory(cat)"
      class="filter-chip">
      <span class="block w-2 h-2 shrink-0 rounded-sm" :style="{ backgroundColor: colors[cat] || defColor }" /><span>{{ cat }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="chip-x"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
    <button v-for="tag in activeT" :key="tag" @click="toggleTag(tag)"
      class="filter-chip">
      <span class="opacity-50">{{ tag }}</span><span>{{ tMap[tag] || tag }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="chip-x"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
    <button v-if="activeT.length > 1" @click="tagFilterMode.set(tagMode === 'OR' ? 'AND' : 'OR')"
      class="filter-chip font-mono tracking-wider">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-50"><polyline points="7,11 12,6 17,11"/><polyline points="7,13 12,18 17,13"/></svg>
      {{ tagMode }}
    </button>
    <button v-for="cat in hiddenCats" :key="'h'+cat" @click="hideCategory(cat)"
      class="filter-chip filter-chip-hidden">
      <span class="block w-2 h-2 shrink-0 rounded-sm opacity-20" :style="{ backgroundColor: colors[cat] || defColor }" /><span>{{ cat }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="chip-x"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
    <button v-for="tag in hiddenT" :key="'h'+tag" @click="hideTag(tag)"
      class="group inline-flex items-center gap-2 px-3 py-1.5 text-[length:var(--font-sm)] bg-white/[0.03] text-white/60 line-through transition-all duration-200 hover:bg-white/10 hover:text-white cursor-pointer select-none">
      <span>{{ tag }}</span><span>{{ tMap[tag] || tag }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="text-white/40 transition-colors group-hover:text-white/90 ml-0.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>
    <button @click="clearAll" class="inline-flex items-center px-2 py-1.5 text-[length:var(--font-sm)] text-white/60 transition-colors hover:text-white/90 sm:ml-2 cursor-pointer select-none">{{ t('clearAll') }}</button>
  </div>

  <ItemInteractivity ref="interactivityRef" />
  <FloatingButtons :sidebarOpen="sidebarOpen" @random="onRandom" @toggleSidebar="sidebarOpen = !sidebarOpen" />
</template>

<style scoped>
.sidebar-panel {
  position: fixed; left: 0; top: 0; height: 100%; z-index: 10003;
  overflow-y: auto; overflow-x: hidden;
  background: linear-gradient(to right, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.9) 55%, transparent 100%);
  border: none;
  transform: translateX(-100%);
  transition: transform 0.3s var(--ease-out);
  will-change: transform;
}
.sidebar-panel.open { transform: translateX(0); }
.sidebar-toggle {
  position: fixed; top: 50%; transform: translateY(-50%); z-index: 10001;
  width: 32px; height: 72px; display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: transparent; border: none;
  color: var(--white-45);
  transition: left 0.3s var(--ease-out), color 0.25s ease;
}
.sidebar-toggle:hover { color: var(--white-75); }
.sidebar-toggle svg { width: 22px; height: 22px; }

/* Mobile: bottom drawer */
@media (max-width: 1023px) {
  .sidebar-panel {
    left: 0; right: 0; top: auto; bottom: 0; height: 70vh; width: 100% !important;
    background: var(--color-modal-bg);
    border-radius: 16px 16px 0 0;
    border: 1px solid var(--white-06);
    transform: translateY(100%);
  }
  .sidebar-panel.open { transform: translateY(0); }
  .sidebar-panel .p-6 { padding: 1rem 1.5rem 2rem !important; }
}
.drawer-handle { display: none; }
@media (max-width: 1023px) {
  .drawer-handle { display: flex; justify-content: center; padding: 10px 0 6px; cursor: grab; touch-action: none; }
}

.filter-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; font-size: var(--font-sm);
  color: var(--white-70);
  background: var(--white-04);
  border: 1px solid var(--white-06);
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  cursor: pointer; user-select: none;
}
.filter-chip:hover {
  color: #fff;
  background: var(--white-10);
  border-color: var(--white-15);
}
.chip-x { opacity: 0.25; transition: opacity 0.2s ease; }
.filter-chip:hover .chip-x { opacity: 0.7; }
.filter-chip-hidden { color: var(--white-55); text-decoration: line-through; }
.filter-chip-hidden:hover { color: var(--white-75); }
</style>
