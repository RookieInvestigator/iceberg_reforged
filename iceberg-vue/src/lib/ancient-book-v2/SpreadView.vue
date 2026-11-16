<script setup lang="ts">
import { computed } from 'vue'
import SpreadPage from './SpreadPage.vue'
import { pageNumbers, toChineseNum } from './engine'
import type { PlacedCell } from './types'

const props = defineProps<{
  spread: PlacedCell[][]
  cols: number
  volName?: string
  si: number
  single?: boolean
  /** 句读（圈点）开关 */
  punct?: boolean
  rules?: boolean
  rulesFull?: boolean
  /** 书名页刊记（数据更新日期） */
  updated?: string
}>()

defineEmits<{ 'open-item': [ii: number] }>()

/**
 * 版心页码：**只印奇数页**（右页），与真实线装书一致 —— 中叶码在书口上，
 * 一叶一号，对开的两页共用一个叶码。双页码只出现在导航里。
 */
const pageLabel = computed(() => toChineseNum(pageNumbers(props.si, props.single)[0]!))

/* 鱼尾两张图（作者自绘，evenodd 镂空）。原始坐标系约 374×397，
   两图只有矩阵位移不同，等比缩放到版心宽度即可，图本身未改动。 */
const FISH_TOP = 'M1320.57,194.055C1286.363,251.226 1233.202,287.982 1173.547,287.982L1173.547,-84.908L1547.12,-84.908L1547.12,287.982C1487.464,287.982 1434.303,251.226 1400.097,194.055C1388.067,206.538 1374.578,213.536 1360.333,213.536C1346.089,213.536 1332.599,206.538 1320.57,194.055ZM1399.274,220.501C1387.34,231.526 1374.14,237.516 1360.333,237.516C1346.529,237.516 1333.331,231.529 1321.394,220.507C1286.308,276.438 1233.028,311.961 1173.547,311.961L1173.547,303.628C1230.36,303.628 1281.034,269.31 1314.484,215.84C1315.758,213.789 1317.883,212.415 1320.276,212.097C1322.669,211.779 1325.079,212.549 1326.839,214.192C1337.126,223.76 1348.417,229.183 1360.333,229.183C1372.249,229.183 1383.54,223.76 1393.82,214.194C1395.586,212.546 1397.997,211.775 1400.391,212.094C1402.785,212.412 1404.911,213.785 1406.178,215.825C1439.633,269.31 1490.306,303.628 1547.12,303.628L1547.12,311.961C1487.639,311.961 1434.36,276.439 1399.274,220.501Z'
const FISH_BOTTOM = 'M1546.435,654.107L1546.435,1026.42L1173.547,1026.42L1173.547,653.532L1360.333,810.36L1546.435,654.107ZM1546.435,628.694L1546.435,639.895L1360.333,796.148L1173.547,639.32L1173.547,628.439L1360.333,785.266L1546.435,628.694Z'
/* 原图坐标系 → 版心 viewBox 的比例：版心 120 单位宽 ≈ 图宽 374 */
const FISH_SCALE = 0.32
</script>

<template>
  <div class="sw" :data-si="si" :class="{ 'sw--single': single }">
    <div class="bx">
      <div class="bx-in">
        <SpreadPage
          :cells="spread[0] || []"
          :cols="cols"
          side="r"
          :vol-name="volName"
          :punct="punct"
          :rules="rules"
          :rules-full="rulesFull"
          :updated="updated"
          @open-item="$emit('open-item', $event)"
        />

        <!-- 版心（中缝）：单页模式不显示。
             只有四件东西：上黑口、上鱼尾、书名/卷次/页码、下鱼尾、下黑口。
             鱼尾按传统位置摆：**上下各 15%**（不是紧贴黑口）。
             鱼尾是作者自绘的两张 SVG（鱼尾上 / 鱼尾下，evenodd 镂空），
             原图坐标系约 374×397，等比缩到版心宽度，图本身未改动。 -->
        <div v-if="!single" class="sn">
          <i class="sn-kou sn-kou--top"></i>
          <i class="sn-neck sn-neck--top"></i>

          <svg class="sn-fish sn-fish--top" viewBox="0 0 120 128" aria-hidden="true">
            <g :transform="`scale(${FISH_SCALE})`">
              <g transform="matrix(1,0,0,1,-1173.5469,84.907728)">
                <path :d="FISH_TOP" />
              </g>
            </g>
          </svg>

          <div class="snc">
            <span class="snt" title="書名">中文兔子洞冰山圖</span>
            <span v-if="volName" class="sch" title="卷次">{{ volName }}</span>
            <span class="snm" title="葉碼">{{ pageLabel }}</span>
          </div>

          <svg class="sn-fish sn-fish--foot" viewBox="0 0 120 128" aria-hidden="true">
            <g :transform="`scale(${FISH_SCALE})`">
              <g transform="matrix(1,0,0,1,-1173.5469,-628.438542)">
                <path :d="FISH_BOTTOM" />
              </g>
            </g>
          </svg>

          <i class="sn-neck sn-neck--foot"></i>
          <i class="sn-kou sn-kou--foot"></i>
        </div>

        <SpreadPage
          v-if="!single"
          :cells="spread[1] || []"
          :cols="cols"
          side="l"
          :vol-name="volName"
          :punct="punct"
          :rules="rules"
          :rules-full="rulesFull"
          @open-item="$emit('open-item', $event)"
        />
      </div>
    </div>
  </div>
</template>
