<script setup lang="ts">
import SpreadPage from './SpreadPage.vue'
import { toChineseNum } from './engine'
import type { PlacedCell } from './types'

const props = defineProps<{
  spread: PlacedCell[][]
  cols: number
  volName?: string
  si: number
  /** 单页模式（窄屏）：只渲染右页，不显示版心与左页 */
  single?: boolean
}>()

defineEmits<{ 'open-item': [ii: number] }>()

/** 单页模式下页码按物理页算，双页按展算 */
const pageLabel = () => toChineseNum(props.single ? props.si + 1 : props.si * 2 + 1)
</script>

<template>
  <div class="sw" :data-si="si" :class="{ 'sw--single': single }">
    <div class="bx">
      <div class="bx-in">
        <SpreadPage :cells="spread[0] || []" :cols="cols" side="r" :vol-name="volName" @open-item="$emit('open-item', $event)" />

        <!-- 版心（中缝）：单页模式不显示 -->
        <div v-if="!single" class="sn">
          <span class="shk"></span>
          <span class="sxb"></span>
          <svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>
          <span class="snt">中文兔子洞冰山圖</span>
          <span class="sch">{{ volName || '' }}</span>
          <span class="snm">{{ pageLabel() }}</span>
          <svg width="14" viewBox="0 0 24 20" style="color:var(--pc-tx);margin:8px 0;flex-shrink:0;transform:rotate(180deg)"><path d="M0 0L24 0L16 10L24 20L0 20L8 10Z" fill="currentColor"/></svg>
          <span class="sxb"></span>
          <span class="xhk"></span>
        </div>

        <SpreadPage v-if="!single" :cells="spread[1] || []" :cols="cols" side="l" :vol-name="volName" @open-item="$emit('open-item', $event)" />
      </div>
    </div>
  </div>
</template>
