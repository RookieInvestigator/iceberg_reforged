<script setup lang="ts">
import { inject, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useStore } from '@nanostores/vue'
import { Filter, Shuffle, Settings, ArrowUp } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import { showRandomBtn, immersiveMode, reducedMotion, hasActiveFilterAtom } from '../../lib/v3/store'
import { V3_CTX_KEY } from '../../lib/v3/keys'

const ctx = inject(V3_CTX_KEY)
if (!ctx) throw new Error('[V3FloatingButtons] 缺少 V3_CTX_KEY')

const { t } = useI18n()
const showRandom = useStore(showRandomBtn)
const immersive = useStore(immersiveMode)
const filterActive = useStore(hasActiveFilterAtom)
const scrolled = ref(false)

let scrollTick = 0
function onScroll() {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const next = window.scrollY > 400
    if (scrolled.value !== next) scrolled.value = next
  })
}

function scrollTop() {
  window.scrollTo({ top: 0, behavior: reducedMotion.get() ? 'auto' : 'smooth' })
}

function scrollBottom() {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion.get() ? 'auto' : 'smooth' })
}

useEventListener(window, 'scroll', onScroll, { passive: true })
</script>

<template>
  <div
    class="v3-fab-group fixed z-[10001] flex flex-col gap-3 bottom-6 max-sm:gap-2 max-sm:bottom-4"
    :class="{ 'immersive-group': immersive }"
    style="right: 24px; padding-bottom: env(safe-area-inset-bottom, 0px);"
  >
    <button
      type="button"
      class="fab-btn relative w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]"
      :class="{ 'v3-fab-has-dot': filterActive }"
      :title="`${t('filter')} (F)`"
      :aria-label="t('filter')"
      @mousedown.stop
      @click="ctx.toggleFilterPanel('fab')"
    >
      <Filter :size="20" :stroke-width="2" />
    </button>

    <button
      v-if="showRandom"
      type="button"
      class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]"
      :title="`${t('randomEntry')} (R)`"
      :aria-label="t('randomEntry')"
      @click="ctx.pickAndShowRandom()"
    >
      <Shuffle :size="20" :stroke-width="2" />
    </button>

    <button
      type="button"
      class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]"
      :title="t('settings')"
      :aria-label="t('settings')"
      @click="ctx.openSettings()"
    >
      <Settings :size="20" :stroke-width="2" />
    </button>

    <button
      type="button"
      class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]"
      :aria-label="t('backToTop')"
      @click="scrolled ? scrollTop() : scrollBottom()"
    >
      <ArrowUp
        :size="20"
        :stroke-width="2"
        class="transition-transform duration-200 ease-out"
        :class="{ 'rotate-180': !scrolled }"
      />
    </button>
  </div>
</template>

<style scoped>
.v3-fab-has-dot::after {
  content: '';
  position: absolute;
  top: 9px;
  right: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
}

@media (hover: hover) {
  .immersive-group .fab-btn {
    opacity: 0;
    transform: translateY(6px);
    transition: opacity var(--v3-t-base, 200ms) var(--v3-ease, ease-out),
      background-color var(--v3-t-fast, 140ms) ease,
      color var(--v3-t-fast, 140ms) ease,
      transform var(--v3-t-base, 200ms) var(--v3-ease, ease-out);
  }
  .immersive-group:hover .fab-btn {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
