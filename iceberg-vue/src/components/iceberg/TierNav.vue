<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue';
import { TIER_ORDER_KEY } from '../../lib/injectionKeys';

const tierOrder = inject(TIER_ORDER_KEY, []);

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
    <div v-if="current" ref="navRef" class="fixed top-0 left-0 right-0 z-[9000] flex justify-end items-center px-6 py-2 pointer-events-none [&>*]:pointer-events-auto max-sm:px-3 max-sm:py-1.5 max-sm:z-[9010]">
      <div class="relative">
        <button class="px-2 py-[3px] border-none bg-transparent text-white-60 text-tiny font-medium cursor-pointer transition-colors duration-150 hover:text-white-90 max-sm:px-3.5 max-sm:py-[5px] max-sm:rounded-[14px] max-sm:bg-black/50 max-sm:border max-sm:border-white-12 max-sm:text-white-65 max-sm:text-xs max-sm:hover:text-white-90 max-sm:hover:bg-black/60" @mousedown.stop @click.stop="open = !open">{{ current }}</button>
        <Transition name="tier-fade">
          <div v-if="open" class="absolute top-full right-0 flex flex-col min-w-20 max-h-[50vh] overflow-y-auto rounded bg-black/75 p-0.5 no-scrollbar mt-0.5">
            <button v-for="t in tierOrder" :key="t" class="text-right px-2 py-[3px] border-none bg-transparent text-tiny cursor-pointer transition-colors duration-100 hover:text-white-90" :class="t === current ? 'text-white-90' : 'text-white-60'" @click="scrollTo(t)">{{ t }}</button>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style>
/* Vue Transition 钩子类（动态注入，无法用工具类标注） */
.tier-fade-enter-active, .tier-fade-leave-active { transition: opacity 0.12s ease; }
.tier-fade-enter-from, .tier-fade-leave-to { opacity: 0; }
</style>
