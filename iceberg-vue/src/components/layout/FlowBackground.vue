<script setup lang="ts">
/**
 * FlowBackground —— 橙蓝黑流体背景（Home 之外的静态内容页共用）。
 * 收敛原先复制在 Handbook / Features / FeatureDetail / OnThisDay 四处的一整块
 * 「固定铺满视口 + LiquidGradient + 黑色渐隐遮罩 + 随机种子」样板。
 * 配色与亮暗/饱和统一在 src/lib/bgTheme.ts 调，勿在此改色值。
 */
import { ref } from 'vue'
import LiquidGradient from './LiquidGradient.vue'
import { BG_COLORS, BG_TUNING } from '../../lib/bgTheme'

const bgSeed = ref(Math.floor(Math.random() * 1001))
</script>

<template>
  <div class="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
    <LiquidGradient
      v-bind="BG_COLORS"
      :seed="bgSeed"
      :turb-iter="7"
      :brightness="BG_TUNING.brightness"
      :saturation="BG_TUNING.saturation"
      :dark-shift="BG_TUNING.darkShift"
    />
    <span class="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/70"></span>
  </div>
</template>