<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '../lib/useI18n'
import LiquidGradient from '../components/layout/LiquidGradient.vue'

const router = useRouter()
const { t } = useI18n()
const bgSeed = ref(Math.floor(Math.random() * 1001))
</script>

<template>
  <div class="relative min-h-screen bg-surface">
    <!-- 橙蓝黑流体背景：固定铺满视口，纯装饰不拦截交互 -->
    <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <LiquidGradient colorA="#000000" colorB="#012945" colorC="#045B8D" colorD="#0076A2" colorE="#B25512" :seed="bgSeed" />
      <span class="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/70"></span>
    </div>

    <div class="relative z-10 mx-auto max-w-[720px] px-4 pt-8 pb-20 sm:px-8 sm:pt-12 sm:pb-32">
      <button
        class="inline-block cursor-pointer border-none bg-transparent pb-8 text-xs tracking-[0.04em] text-white-20 transition-colors duration-200 hover:text-white-50"
        @click="router.push('/features')"
      >{{ t('backToFeatures') }}</button>

      <div class="rounded-2xl border border-white-08 bg-black/45 px-6 py-20 text-center backdrop-blur-md sm:px-10">
        <span class="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-accent-soft">
          <span class="h-1.5 w-1.5 rounded-full bg-accent-soft" aria-hidden="true"></span>
          {{ t('featuresWipBadge') }}
        </span>
        <p class="mt-5 text-base font-bold text-white-85">{{ t('featuresWip') }}</p>
      </div>
    </div>
  </div>
</template>
