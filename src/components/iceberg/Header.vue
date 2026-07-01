<script setup>
import { inject } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
});

const { t } = useI18n();
const openOnThisDay = inject('openOnThisDay', null);
</script>

<template>
  <div class="text-center pt-10 pb-6 max-sm:pt-8 max-sm:pb-4" style="padding: 0 var(--header-padding-x)">
    <div class="mb-14 max-sm:mb-8 flex flex-col items-center">
      <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50 max-sm:text-xs max-sm:tracking-[0.5em]">
        Chinese Oddities Iceberg · Reforged
      </div>
      <div class="relative inline-flex items-start">
        <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-md:text-[2.4rem] max-sm:text-[1.8rem] max-sm:tracking-wide">
          {{ t('siteTitle') }}
        </h1>
      </div>
      <p class="mt-8 max-sm:mt-6 text-[0.85rem] max-sm:text-[0.75rem] font-light text-white/50 tracking-widest max-sm:tracking-wide uppercase">
        {{ buildDate }} <span class="mx-3 opacity-30">|</span> {{ entryCount }} {{ t('entries') }}
      </p>

      <div class="mt-3 flex items-center gap-3 max-sm:gap-4 text-xs max-sm:text-[0.8rem] tracking-wider">
        <button v-if="openOnThisDay" @click="openOnThisDay()" class="text-white/25 hover:text-white/50 transition-colors py-1">{{ t('onThisDay') }}</button>
        <router-link v-else to="/on-this-day" class="text-white/25 hover:text-white/50 transition-colors py-1">{{ t('onThisDay') }}</router-link>
        <span class="text-white/10">|</span>
        <router-link to="/ancient-book" class="text-white/25 hover:text-white/50 transition-colors py-1">{{ t('ancientBook') }}</router-link>
      </div>
    </div>

    <p
      v-if="introText"
      class="text-[1rem] max-sm:text-[0.9rem] text-white/60 font-normal leading-relaxed max-w-[750px] mx-auto whitespace-pre-wrap max-sm:leading-snug"
    >
      {{ introText }}
    </p>
  </div>
</template>
