<script setup>
import { ref, computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { activeCategories, activeTags, searchQuery, toggleCategory, toggleTag } from '../lib/filterStore';

const props = defineProps({ categoryColors: String, tagMap: String, defaultColor: String });
const colors = JSON.parse(props.categoryColors || '{}');
const tagMap = JSON.parse(props.tagMap || '{}');
const defColor = props.defaultColor || '#FFFFFF';

const activeCats = useStore(activeCategories);
const activeT = useStore(activeTags);
const query = useStore(searchQuery);

const tagFilterMode = ref('OR');
const hasActive = computed(() => query.value || activeCats.value.length > 0 || activeT.value.length > 0);

function clearAll() {
  searchQuery.set('');
  activeCategories.set([]);
  activeTags.set([]);
}

function removeSearch() { searchQuery.set(''); }
</script>

<template>
  <div v-if="hasActive" class="flex flex-wrap items-center gap-2.5 mt-10 mb-2 px-[var(--header-padding-x)]">
    <!-- Search chip -->
    <button v-if="query" @click="removeSearch"
      class="group inline-flex items-center gap-2 px-3 py-1.5 text-[0.82rem] bg-white/[0.03] text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white cursor-pointer select-none">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-70"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
      <span class="truncate max-w-[120px]">{{ query }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="text-white/30 transition-colors group-hover:text-white/90 ml-0.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>

    <!-- Category chips -->
    <button v-for="cat in activeCats" :key="cat" @click="toggleCategory(cat)"
      class="group inline-flex items-center gap-2 px-3 py-1.5 text-[0.82rem] bg-white/[0.03] text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white cursor-pointer select-none">
      <span class="block w-2.5 h-2.5 shrink-0" :style="{ backgroundColor: colors[cat] || defColor }" />
      <span>{{ cat }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="text-white/30 transition-colors group-hover:text-white/90 ml-0.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>

    <!-- Tag chips -->
    <button v-for="tag in activeT" :key="tag" @click="toggleTag(tag)"
      class="group inline-flex items-center gap-2 px-3 py-1.5 text-[0.82rem] bg-white/[0.03] text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white cursor-pointer select-none">
      <span>{{ tag }}</span>
      <span>{{ tagMap[tag] || tag }}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" class="text-white/30 transition-colors group-hover:text-white/90 ml-0.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>

    <!-- AND/OR toggle -->
    <button v-if="activeT.length > 1" @click="tagFilterMode = tagFilterMode === 'OR' ? 'AND' : 'OR'"
      class="group inline-flex items-center gap-2 px-3 py-1.5 text-[0.82rem] bg-white/[0.03] text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white cursor-pointer select-none font-mono tracking-wider">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-70"><polyline points="7,11 12,6 17,11"/><polyline points="7,13 12,18 17,13"/></svg>
      {{ tagFilterMode }}
    </button>

    <!-- Clear all -->
    <button @click="clearAll"
      class="inline-flex items-center px-2 py-1.5 text-[0.82rem] text-white/30 transition-colors hover:text-white/80 sm:ml-2 cursor-pointer select-none">
      清除全部
    </button>
  </div>
</template>
