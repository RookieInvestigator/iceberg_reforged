<script setup lang="ts">
import SpreadPage from './SpreadPage.vue'
import { toChineseNum } from './engine'
import type { PlacedCell } from './types'

defineProps<{
  spread: PlacedCell[][]
  cols: number
  volName?: string
  si: number
}>()

defineEmits<{ 'open-item': [ii: number] }>()
</script>

<template>
  <div class="sw" :data-si="si">
    <div class="bx">
      <div class="bx-in">
        <SpreadPage :cells="spread[0] || []" :cols="cols" side="r" :vol-name="volName" @open-item="$emit('open-item', $event)" />

        <!-- 书口：黑口 / 象鼻 / 鱼尾 / 卷名 / 页码 -->
        <div class="sn">
          <span class="shk"></span>
          <span class="sxb"></span>
          <svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>
          <span class="snt">中文兔子洞冰山圖</span>
          <span class="sch">{{ volName || '' }}</span>
          <span class="snm">{{ toChineseNum(si * 2 + 1) }}</span>
          <svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0;transform:rotate(180deg)"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>
          <span class="sxb"></span>
          <span class="xhk"></span>
        </div>

        <SpreadPage :cells="spread[1] || []" :cols="cols" side="l" :vol-name="volName" @open-item="$emit('open-item', $event)" />
      </div>
    </div>
  </div>
</template>
