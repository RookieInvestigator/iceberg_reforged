<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../lib/useI18n';
import { url } from '../lib/baseUrl';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
});

const { t } = useI18n();

const titleIn = ref(false);
const metaIn = ref(false);
const navIn = ref(false);
const introIn = ref(false);

function startAnimation() {
  setTimeout(() => titleIn.value = true, 1000);
  setTimeout(() => metaIn.value = true, 800);
  setTimeout(() => navIn.value = true, 1200);
  if (props.introText) setTimeout(() => introIn.value = true, 850);
}

onMounted(() => {
  let heroWasDone = false;
  try { heroWasDone = sessionStorage.getItem('iceberg_hero_done') === '1'; } catch {}

  if (heroWasDone) {
    titleIn.value = metaIn.value = navIn.value = introIn.value = true;
    return;
  }
  document.addEventListener('hero-exit', startAnimation, { once: true });
});

onUnmounted(() => {
  document.removeEventListener('hero-exit', startAnimation);
});
</script>

<template>
  <div class="text-center pt-10 pb-6" style="padding: 0 var(--header-padding-x)">
    <div class="mb-14 flex flex-col items-center">
      <div :style="{ opacity: titleIn ? 1 : 0, transition: 'opacity 0.5s ease-out' }">
        <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50">
          Chinese Oddities Iceberg
        </div>
        <div class="relative inline-flex items-start">
          <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-sm:text-[2.4rem]">
            {{ t('siteTitle') }}
          </h1>
          <span class="absolute -right-14 top-0 sm:-right-16 sm:text-[1.1rem] font-thin text-white/90 tracking-widest select-none max-sm:-top-2 max-sm:-right-10">
            {{ t('edition') }}
          </span>
        </div>
      </div>

      <p
        class="mt-8 text-[0.85rem] font-light text-white/50 tracking-widest uppercase"
        :style="{ opacity: metaIn ? 1 : 0, transform: metaIn ? 'translateY(0)' : 'translateY(10px)', transition: 'opacity 0.35s ease-out, transform 0.35s cubic-bezier(0.2,0,0,1)' }"
      >
        {{ props.buildDate }} <span class="mx-3 opacity-30">|</span> {{ props.entryCount }} {{ t('entries') }}
      </p>

      <div
        class="mt-3 flex items-center gap-3 text-xs tracking-wider"
        :style="{ opacity: navIn ? 1 : 0, transition: 'opacity 0.35s ease-out' }"
      >
        <a :href="url('/minimal')" class="text-white/25 hover:text-white/50 transition-colors">{{ t('minimalMode') }}</a>
        <span class="text-white/10">|</span>
        <a :href="url('/on-this-day')" class="text-white/25 hover:text-white/50 transition-colors">{{ t('onThisDay') }}</a>
      </div>
    </div>

    <p
      v-if="introText"
      :style="{ opacity: introIn ? 1 : 0, transform: introIn ? 'translateY(0)' : 'translateY(10px)', transition: introIn ? 'opacity 0.5s ease-out, transform 0.35s cubic-bezier(0.2,0,0,1)' : 'none' }"
      class="text-[1rem] text-white/60 font-normal leading-relaxed max-w-[750px] mx-auto whitespace-pre-wrap max-sm:text-[0.95rem] max-sm:text-justify"
    >
      {{ introText }}
    </p>
  </div>
</template>
