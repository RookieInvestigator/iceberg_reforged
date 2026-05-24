<script setup>
import { useStore } from '@nanostores/vue';
import { searchQuery } from '../lib/filterStore';

const query = useStore(searchQuery);
</script>

<template>
  <input
    type="text"
    :value="query"
    @input="(e) => searchQuery.set(e.target.value)"
    placeholder="搜索词条..."
    autocomplete="off"
    class="w-full py-2.5 px-4 text-[0.95rem] text-white bg-white/5 border border-[#333] rounded-md outline-none transition-colors focus:border-[#888] focus:bg-white/8"
  />
</template>
