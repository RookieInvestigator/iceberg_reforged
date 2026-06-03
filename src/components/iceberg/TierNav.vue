<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue';

const tierOrder = inject('tierOrder', []);

const current = ref('');
const open = ref(false);
const navRef = ref(null);

function scrollTo(name) {
  open.value = false;
  const tier = document.querySelector(`.iceberg-tier[data-tier="${CSS.escape(name)}"]`);
  if (tier) tier.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let scrollRaf = 0
function onScroll() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    let best = ''
    const vh = window.innerHeight
    document.querySelectorAll('.iceberg-tier').forEach(t => {
      const r = t.getBoundingClientRect()
      if (r.top < vh * 0.5 && r.bottom > 0) best = t.dataset.tier || ''
    })
    current.value = best
    scrollRaf = 0
  })
}

function onDocClick(e) {
  if (navRef.value && !navRef.value.contains(e.target)) open.value = false;
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('mousedown', onDocClick);
  onScroll();
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('mousedown', onDocClick);
});
</script>

<template>
  <Transition name="tier-fade">
    <div v-if="current" class="tier-nav">
      <div class="tier-nav-group">
        <button class="tier-nav-btn" @mousedown.stop @click.stop="open = !open">{{ current }}</button>
        <Transition name="tier-fade">
          <div v-if="open" class="tier-nav-drop">
            <button v-for="t in tierOrder" :key="t" class="tier-nav-item"
              :class="{ 'tier-nav-active': t === current }"
              @click="scrollTo(t)">{{ t }}</button>
          </div>
        </Transition>
      </div>

    </div>
  </Transition>

</template>

<style>
.tier-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 9000; display: flex; justify-content: flex-end; align-items: center; padding: 8px 24px; pointer-events: none; }
.tier-nav > * { pointer-events: auto; }
@media (max-width: 639px) {
  .tier-nav { padding: 6px 12px; z-index: 9010; }
  .tier-nav-btn { padding: 5px 14px; border-radius: 14px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.55); font-size: 0.72rem; }
  .tier-nav-btn:hover { color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.6); }
}
.tier-nav-group { position: relative; }
.tier-nav-btn { padding: 3px 8px; border: none; background: transparent; color: rgba(255,255,255,0.45); font-size: 0.68rem; font-weight: 500; cursor: pointer; transition: color 0.15s; }
.tier-nav-btn:hover { color: rgba(255,255,255,0.75); }
.tier-nav-drop { position: absolute; top: 100%; right: 0; display: flex; flex-direction: column; min-width: 80px; max-height: 50vh; overflow-y: auto; border-radius: 4px; background: rgba(0,0,0,0.75); padding: 2px; scrollbar-width: none; margin-top: 2px; }
.tier-nav-drop::-webkit-scrollbar { display: none; }
.tier-nav-item { text-align: right; padding: 3px 8px; border: none; background: none; color: rgba(255,255,255,0.4); font-size: 0.68rem; cursor: pointer; transition: color 0.1s; }
.tier-nav-item:hover { color: rgba(255,255,255,0.75); }
.tier-nav-active { color: rgba(255,255,255,0.65); }
.tier-fade-enter-active, .tier-fade-leave-active { transition: opacity 0.12s ease; }
.tier-fade-enter-from, .tier-fade-leave-to { opacity: 0; }
</style>
