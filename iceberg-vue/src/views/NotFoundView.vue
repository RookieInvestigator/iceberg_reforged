<script setup lang="ts">
import { useI18n } from '../lib/useI18n'
const { t } = useI18n()
</script>

<template>
  <div class="fixed inset-0 flex items-center justify-center bg-surface font-sans">
    <div class="text-center p-8">
      <h1 class="text-8xl font-black text-white-03 leading-none mb-4">404</h1>
      <p class="text-white-60 text-base mb-8">{{ t('notFoundText') }}</p>
      <router-link
        to="/"
        class="inline-block px-8 py-2.5 border border-white-12 rounded-lg text-white-80 no-underline text-sm transition-colors duration-200 hover:bg-white-05 hover:text-white-60 hover:border-white-25"
      >{{ t('notFoundBack') }}</router-link>
    </div>
  </div>
</template>
