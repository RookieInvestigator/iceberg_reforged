<script setup lang="ts">
import { ref, computed } from 'vue'
import GeoAvatar from '../components/modals/GeoAvatar.vue'

const count = ref(50)
const seeds = computed(() =>
  Array.from({ length: count.value }, (_, i) => ({
    seed: `test-${i}-${Date.now()}`,
    hue: (i * 37 + 28) % 360,
    id: i,
  }))
)

function refresh() { count.value = count.value }
</script>

<template>
  <div class="t">
    <div class="t-bar">
      <button @click="refresh" class="t-btn">刷新</button>
    </div>
    <div class="t-grid">
      <div v-for="s in seeds" :key="s.id" class="t-cell">
        <GeoAvatar :seed="s.seed" :hue="s.hue" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.t { padding: 1rem; min-height: 100vh; background: #111; }
.t-bar { margin-bottom: 1rem; display: flex; gap: 0.5rem; }
.t-btn { padding: 0.4rem 1rem; border-radius: 5px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); cursor: pointer; font-size: 0.8rem; }
.t-btn:hover { background: rgba(255,255,255,0.15); }
.t-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.t-cell { width: 48px; height: 48px; }
</style>
