<script setup lang="ts">
import { computed, ref } from 'vue'
import { cellStyle, cellClass, punctKind, titleParts, judouStyle, mbCellStyle } from './render'
import { JUDOU } from './layout'
import type { PlacedCell } from './types'

const props = defineProps<{
  cells: PlacedCell[]
  cols: number
  side: 'r' | 'l'
  volName?: string
  /** 句读（圈点）开关：只有显示 / 不显示 */
  punct?: boolean
  rules?: boolean
  /** 界行是否贯穿天头地脚（默认只在正文区内） */
  rulesFull?: boolean
  /** 书名页的刊记（数据更新日期），只在书名页渲染 */
  updated?: string
}>()

const emit = defineEmits<{ 'open-item': [ii: number] }>()

const isBookTitle = computed(() => props.cells[0]?.c === '⚑')
const isVolTitle = computed(() => props.cells[0]?.c === '⚐')
const isTitlePage = computed(() => isBookTitle.value || isVolTitle.value)
const titlePartsArr = computed(() => (isTitlePage.value ? titleParts(props.cells) : []))

/** 眉批：视图层只贴在「词条起首字」上（一格一列，无需去重） */
const mbCells = computed(() => props.cells.filter((c) => c.mp?.length && !c.cm))

/** 整条标题高亮：同一词条（ii 相同）的所有字共享 hover 状态 */
const hoveredItem = ref<number | null>(null)
const onCellEnter = (c: PlacedCell) => {
  if (c.hw && !c.cm && c.ii >= 0) hoveredItem.value = c.ii
}
const onCellLeave = () => { hoveredItem.value = null }
const isHovered = (c: PlacedCell) => c.hw && !c.cm && c.ii >= 0 && hoveredItem.value === c.ii

const onCellClick = (c: PlacedCell) => {
  if (c.hw && !c.cm && c.ii >= 0) emit('open-item', c.ii)
}
</script>

<template>
  <div class="pg" :class="side === 'r' ? 'r' : 'l'">
    <!-- 界行（乌丝栏）只画在正文页，可在设置里关闭。
         挂在 `.pg` 层而不是 `.gd` 里：`.gd` 有 overflow: hidden，
         界行就出不了正文区，而「贯穿天头地脚」正是要越过它。 -->
    <div
      v-if="rules !== false && !isTitlePage && cells.length"
      class="pbr"
      :class="{ 'pbr--full': rulesFull }"
    >
      <span v-for="j in cols" :key="j" class="rc" :class="{ rf: j === 1 }"></span>
    </div>

    <div class="gd">
      <!-- 书名页 / 卷首页：**不参与网格**，直接居中。
           标题必须作为**一整段文本**渲染 —— 拆成多个 span 会让每个 span
           独立成列，列序就乱了（「中文兔子洞冰山圖」读成「山洞兔中」）。 -->
      <div v-if="isTitlePage" :class="isBookTitle ? 'pg-book' : 'pg-vol'">
        <h1 class="b-title">{{ titlePartsArr.join('') }}</h1>
        <span v-if="isBookTitle && updated" class="b-date">{{ updated }}</span>
      </div>

      <!-- 正文：逐字渲染 -->
      <template v-else>
        <div
          v-for="(c, k) in cells"
          :key="k"
          :class="[cellClass(c), { 'is-hover': isHovered(c) }]"
          :style="cellStyle(c)"
          :data-ii="c.ii"
          @click="onCellClick(c)"
          @mouseenter="onCellEnter(c)"
          @mouseleave="onCellLeave"
        >
          <span :class="{ 'eng-span': c.isEng }">{{ c.c }}</span>

          <!-- 句读：只有显示 / 不显示两种。位置由 judouStyle() 注入（字格下缘偏右），
               不写死在 CSS 里 —— 否则 top/right 缺失会让标记落在字格左上角。 -->
          <i
            v-if="punct !== false && punctKind(c.pn, true)"
            class="pd"
            :class="`pd--${punctKind(c.pn, true)}`"
            :style="judouStyle(JUDOU)"
          >
            <svg v-if="punctKind(c.pn, true) === 'stop'" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6" />
            </svg>
            <svg v-else viewBox="0 0 10 10">
              <path d="M3 3Q7 7 8 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" />
            </svg>
          </i>
        </div>
      </template>
    </div>

    <!-- 眉批层：**就是一副与字格同轨道的小字格**（夹注那套 2×2）。
         每个小字由 layoutMarginal 算好「第几个半列 / 第几行」，这里只负责摆进去；
         先填满右半列再填左半列，所以 h 递增即可。 -->
    <div v-if="mbCells.length" class="mbl">
      <template v-for="m in mbCells" :key="m.cl">
        <span v-for="(ch, i) in m.mp" :key="`${m.cl}-${i}`" class="mbr" :style="mbCellStyle(m.cl, ch)">{{ ch.c }}</span>
      </template>
    </div>
  </div>
</template>
