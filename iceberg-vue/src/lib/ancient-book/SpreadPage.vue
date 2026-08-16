<script setup lang="ts">
import { computed } from 'vue'
import { cellStyle, cellClass, punctKind, titleParts, PC } from './render'
import type { PlacedCell } from './types'

const props = defineProps<{
  cells: PlacedCell[]
  cols: number
  side: 'r' | 'l'
  volName?: string
}>()

const emit = defineEmits<{ 'open-item': [ii: number] }>()

const isBookTitle = computed(() => props.cells[0]?.c === '⚑')
const isVolTitle = computed(() => props.cells[0]?.c === '⚐')
const isTitlePage = computed(() => isBookTitle.value || isVolTitle.value)
const titlePartsArr = computed(() => (isTitlePage.value ? titleParts(props.cells) : []))

function onCellClick(c: PlacedCell) {
  if (c.hw && !c.cm && c.ii >= 0) emit('open-item', c.ii)
}
</script>

<template>
  <div class="pg" :class="side === 'r' ? 'r' : 'l'">
    <div class="gd">
      <div class="pbr">
        <span v-for="j in cols" :key="j" class="rc" :class="{ rf: j === 1 }"></span>
      </div>

      <!-- 书名/卷名标题页 -->
      <div v-if="isTitlePage" :class="isBookTitle ? 'pg-book' : 'pg-vol'">
        <h1 class="b-title">
          <span v-for="(p, i) in titlePartsArr" :key="i">{{ p }}</span>
        </h1>
      </div>

      <!-- 普通正文页：逐字渲染（F24 声明式，插值自动转义） -->
      <template v-else>
        <div
          v-for="(c, k) in cells"
          :key="k"
          :class="cellClass(c)"
          :style="cellStyle(c, cols, 0)"
          :data-ii="c.ii"
          @click="onCellClick(c)"
        >
          <span :class="{ 'eng-span': c.isEng }">{{ c.c }}</span>
          <i v-if="punctKind(c.pn)" class="pd">
            <svg v-if="punctKind(c.pn) === 'stop'" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="3.5" fill="none" :stroke="PC.cr" stroke-width="1.5" />
            </svg>
            <svg v-else viewBox="0 0 10 10">
              <path d="M3 3Q7 7 8 5" :stroke="PC.cr" stroke-width="2" fill="none" stroke-linecap="round" />
            </svg>
          </i>
        </div>
      </template>
    </div>
  </div>
</template>
