<script setup>
import { useI18n } from '../../lib/useI18n';
import { url } from '../../lib/baseUrl';

const props = defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
});

const { t } = useI18n();
</script>

<template>
  <div class="text-center pt-10 pb-6" style="padding: 0 var(--header-padding-x)">
    <div class="mb-14 flex flex-col items-center">
      <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50">
        Chinese Oddities Iceberg · Reforged
      </div>
      <div class="relative inline-flex items-start">
        <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-sm:text-[2.4rem]">
          {{ t('siteTitle') }}
        </h1>
      </div>
      <p class="mt-8 text-[0.85rem] font-light text-white/50 tracking-widest uppercase">
        {{ props.buildDate }} <span class="mx-3 opacity-30">|</span> {{ props.entryCount }} {{ t('entries') }}
      </p>
      <div class="mt-3 flex items-center gap-3 text-xs tracking-wider">
        <a :href="url('/')" class="text-white/25 hover:text-white/50 transition-colors">{{ t('fullMode') }}</a>
        <span class="text-white/10">|</span>
        <a :href="url('/on-this-day')" class="text-white/25 hover:text-white/50 transition-colors">{{ t('onThisDay') }}</a>
        <span class="text-white/10">|</span>
        <a :href="url('/ancient-book')" class="text-white/25 hover:text-white/50 transition-colors">{{ t('ancientBook') }}</a>
      </div>
    </div>
  </div>
</template>
