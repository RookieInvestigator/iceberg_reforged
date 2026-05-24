<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useStore } from '@nanostores/vue';
import { activeCategories, activeTags, toggleCategory, toggleTag } from '../lib/filterStore';
import SearchBar from './SearchBar.vue';

const props = defineProps({ categories: String, tags: String });
const cats = JSON.parse(props.categories);
const tagList = JSON.parse(props.tags);

const activeCats = useStore(activeCategories);
const activeT = useStore(activeTags);

const open = ref(false);
const sidebarRef = ref(null);

function onDocClick(e) {
  if (open.value && sidebarRef.value && !sidebarRef.value.contains(e.target)) {
    open.value = false;
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick));
onUnmounted(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
  <!-- Desktop backdrop -->
  <div v-if="open" class="fixed inset-0 z-[9999] hidden lg:block bg-transparent" @click="open = false" />

  <!-- Toggle button -->
  <button
    class="sidebar-toggle hidden lg:flex"
    :style="{ left: open ? '-100px' : '0px' }"
    @click="open = !open"
    aria-label="筛选"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="9" y2="18" />
    </svg>
  </button>

  <!-- Sidebar panel -->
  <aside ref="sidebarRef" class="sidebar-panel" :class="{ open }" style="width:480px">
    <div class="p-6 pl-8 pr-30 pt-20 pb-12 flex flex-col gap-6 w-full">

      <!-- Search -->
      <SearchBar />

      <!-- Categories -->
      <div>
        <div class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">分类</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="[cat, color] in cats" :key="cat"
            @click="toggleCategory(cat)"
            :class="[
              'group flex items-center gap-2.5 px-3 py-1.5 text-[0.85rem] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              activeCats.length === 0 || activeCats.includes(cat)
                ? 'bg-white/20 text-white hover:bg-white hover:text-black'
                : 'bg-transparent text-gray-500 hover:bg-white hover:text-black'
            ]"
            :title="cat"
            :aria-pressed="activeCats.length === 0 || activeCats.includes(cat)"
          >
            <span class="block w-2.5 h-2.5 shrink-0 transition-opacity duration-200"
                  :class="activeCats.length === 0 || activeCats.includes(cat) ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'"
                  :style="{ backgroundColor: color }" />
            <span class="mt-[1px]">{{ cat }}</span>
          </button>
        </div>
      </div>

      <!-- Divider -->
      <div class="h-px w-full bg-gradient-to-r from-white/15 to-transparent my-2" />

      <!-- Tags -->
      <div>
        <div class="text-xs font-bold text-gray-400 tracking-widest uppercase mb-3">标签</div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="[emoji, name] in tagList" :key="emoji"
            @click="toggleTag(emoji)"
            :class="[
              'group flex items-center gap-2 px-3 py-1.5 text-[0.85rem] font-medium tracking-wide transition-colors duration-200 cursor-pointer select-none border-none',
              activeT.length === 0 || activeT.includes(emoji)
                ? 'bg-white/20 text-white hover:bg-white hover:text-black'
                : 'bg-transparent text-gray-500 hover:bg-white hover:text-black'
            ]"
            :title="name"
            :aria-pressed="activeT.length === 0 || activeT.includes(emoji)"
          >
            <span class="text-[1.1em] transition duration-200"
                  :class="activeT.length === 0 || activeT.includes(emoji)
                    ? 'opacity-100 grayscale-0'
                    : 'opacity-40 grayscale group-hover:opacity-100 group-hover:grayscale-0'">{{
              emoji }}</span>
            <span class="mt-[1px]">{{ name }}</span>
          </button>
        </div>
      </div>

    </div>
  </aside>
</template>

<style scoped>
.sidebar-panel {
  position: fixed; left: 0; top: 0; height: 100%; z-index: 10000;
  overflow-y: auto; overflow-x: hidden;
  background: linear-gradient(to right, black, rgba(0,0,0,0.9), transparent);
  border: none;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
}
.sidebar-panel.open { transform: translateX(0); }
.sidebar-panel::-webkit-scrollbar { display: none; }
.sidebar-panel { -ms-overflow-style: none; scrollbar-width: none; }

.sidebar-toggle {
  position: fixed; top: 50%; transform: translateY(-50%);
  z-index: 10001; width: 28px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  background: color-mix(in srgb, var(--color-sidebar-bg, #0a0a0a) 55%, transparent);
  border: 1px solid var(--color-surface-border, #333);
  border-left: none;
  color: var(--color-text-tertiary, #888);
  transition: left 0.3s cubic-bezier(0.2, 0, 0, 1), background 0.25s ease, color 0.25s ease;
}
.sidebar-toggle:hover { color: var(--color-text-primary, #fff); background: color-mix(in srgb, var(--color-surface-alt, #0a0a0a) 70%, transparent); }
</style>
