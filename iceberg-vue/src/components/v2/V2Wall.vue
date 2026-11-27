<script setup lang="ts">
// V2Wall（/v2 专用）：词条墙容器 —— 声明式排序 + 文档序 + 渐进挂载 + 空态。
// 挂载策略走 wallMount（首屏 2 层 + 逐帧补齐；content-visibility 跳绘制）。
// 不要改成 IO 真卸载远端层：销毁重建会造成滚动不连贯。
import { shallowRef, ref, computed, onMounted, onUnmounted, watch, inject } from 'vue'
import { useStore } from '@nanostores/vue'
import { sortMode } from '../../lib/settingsStore'
import { useI18n } from '../../lib/useI18n'
import { initialMountCount, nextMountCount } from '../../lib/iceberg/wallMount'
import { docOrder } from '../../lib/iceberg/wallState'
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY } from '../../lib/injectionKeys'
import type { IcebergData } from '../../lib/data'
import V2TierChapter from './V2TierChapter.vue'

const props = defineProps<{ data: IcebergData }>()

const { t } = useI18n()
const filterVisible = inject(FILTER_VISIBLE_KEY, shallowRef(null as Set<string> | null))
const dimItems = inject(DIM_ITEMS_KEY, shallowRef(null as Set<string> | null))
const dimSet = computed(() => dimItems.value)

// 声明式排序：按 sortMode 生成每层有序数组
const srt = useStore(sortMode)
const tierItems = computed(() => {
  const out: Record<string, any[]> = {}
  for (const [tn, items] of Object.entries(props.data.tiers as Record<string, any[]>)) {
    let arr: any[] = items
    const m = srt.value
    if (m === 'title-asc' || m === 'title-desc') {
      arr = [...items].sort((a: any, b: any) =>
        m === 'title-asc' ? a.title.localeCompare(b.title, 'zh-CN') : b.title.localeCompare(a.title, 'zh-CN'))
    } else if (m === 'category') {
      arr = [...items].sort((a: any, b: any) => a.category.localeCompare(b.category, 'zh-CN'))
    }
    out[tn] = arr
  }
  return out
})

// 词条墙 DOM 文档序 → wallState.docOrder（单一事实源；sortMode 变化才重建）
watch(tierItems, (ti) => {
  const out: string[] = []
  for (const tn of props.data.tierOrder) {
    const arr = ti[tn]
    if (arr) for (const it of arr) out.push((it as any).id)
  }
  docOrder.value = out
}, { immediate: true })

const hasNoResults = computed(() => filterVisible.value !== null && filterVisible.value.size === 0)

// 首屏只挂前 2 层（视口 + 缓冲），其余在**空闲时段**补齐；安全网 flush 由视图层统一绑定。
//
// 为什么不用逐帧 rAF：实测（gzip + headless Chrome，1440×900）首屏 2→8 层的补齐正好
// 压在入场动画那 1.5s 上，产生了 415~466ms 的单帧和 ~1.2s 的累计卡顿；同一构建把补齐
// 换成空闲回调后，首屏长帧消失、补齐移到用户不再盯着首屏的时段（数字见 CHANGELOG）。
// requestIdleCallback 缺席（Safari 等）时退回 setTimeout，行为等价、只是不挑空闲。
const totalTiers = props.data.tierOrder.length
const mountedTiers = ref(initialMountCount(totalTiers, true))
let mountRaf = 0
let mountIdle = 0
function clearMountTask() {
  if (mountRaf) { cancelAnimationFrame(mountRaf); mountRaf = 0 }
  if (mountIdle) {
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(mountIdle)
    else window.clearTimeout(mountIdle)
    mountIdle = 0
  }
}
function flushWall() {
  if (mountedTiers.value >= totalTiers) return
  mountedTiers.value = totalTiers
  clearMountTask()
}
function tickMount() {
  mountRaf = 0
  mountIdle = 0
  mountedTiers.value = nextMountCount(mountedTiers.value, totalTiers)
  if (mountedTiers.value >= totalTiers) return
  if (typeof window.requestIdleCallback === 'function') {
    // timeout 兜底：空闲一直不到（长任务不断）时也要在 1s 内挂完
    mountIdle = window.requestIdleCallback(tickMount, { timeout: 1000 })
  } else {
    mountIdle = window.setTimeout(tickMount, 120)
  }
}
defineExpose({ flushWall })

onMounted(() => {
  if (mountedTiers.value < totalTiers) {
    if (typeof window.requestIdleCallback === 'function') {
      mountIdle = window.requestIdleCallback(tickMount, { timeout: 1000 })
    } else {
      mountIdle = window.setTimeout(tickMount, 120)
    }
  }
})
onUnmounted(clearMountTask)
</script>

<template>
  <div id="items-container">
    <!-- 全空（hide 模式 0 命中）：整体提示 -->
    <div v-if="hasNoResults" id="items-empty" class="text-center text-white-25 text-sm py-40 italic">{{ t('noResults') }}</div>
    <template v-else>
      <V2TierChapter
        v-for="(tierName, tierIndex) in data.tierOrder.slice(0, mountedTiers)"
        :key="tierName"
        :tier-name="tierName"
        :index="tierIndex"
        :items="tierItems[tierName] || []"
        :filter-visible="filterVisible"
        :dim-set="dimSet"
      />
    </template>
  </div>
</template>
