<script setup>
// V2Tooltip（/v2 专用）：ItemTooltip 的逻辑逐行复刻（teleport 时序、fade 门控），
// 只换呈现：分类眉题 + 描述 + 发丝线元信息，与 v2 排印语言对齐。
// 定位/尺寸由 useTooltip 内联写入，样式只管字与间距；.tooltip-box 的定位与
// 显示状态机（.show / .floating）沿用 index.css 全局规则。
import { computed, ref } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { useFadeInOnShow } from '../../lib/iceberg/useFadeInOnShow';

const props = defineProps({ show: Boolean, floating: Boolean, anchor: { type: [String, Object], default: null }, desc: String, noDesc: Boolean, category: String, color: String, tags: String });
const emit = defineEmits(['enter', 'leave']);

const { t } = useI18n();

// 仅纯白（都市传说・超自然事件・超常经历 #FFFFFF）色点加黑边，其余纯色圆不动。
// 该特判依赖浅色表面（白底）：若 tooltip 表面改深色需反转（见审计 S1）。
const dotStyle = computed(() => {
  const c = props.color || '#fff';
  return c.toLowerCase() === '#ffffff'
    ? { color: c, '-webkit-text-stroke': '1px #000' }
    : { color: c };
});

const rootEl = ref(null);
defineExpose({ rootEl });

// Teleport 先挂载、下一帧再淡入（门控逻辑见 useFadeInOnShow）
const teleported = useFadeInOnShow(() => props.show);
</script>

<template>
  <!-- floating（生产）：body 级浮动层 + fixed 视口坐标（useTooltip 硬钳制），
       不依附词条/层级 → 任何祖先合成层/containment/overflow 都无法裁剪；
       anchor（实验页幽灵锚点等）回退：teleport 进锚点元素走原 CSS 定位 -->
  <Teleport :to="(floating ? 'body' : anchor) || 'body'" :disabled="!floating && !anchor">
    <div
      ref="rootEl"
      class="tooltip-box v2tip"
      :class="{ show: show && teleported, floating }"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <p class="v2tip-cat"><span :style="dotStyle">●</span> {{ category }}</p>
      <p class="v2tip-desc" :class="{ 'tooltip-desc-empty': noDesc }">{{ desc }}</p>
      <p v-if="tags" class="v2tip-tags">{{ tags }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
/* 只做排印覆盖：定位/显隐状态机沿用全局 .tooltip-box；
   圆角进 v2 三档（md，与下拉框同档，S1）；字号收编 5 阶梯（S7） */
.v2tip { padding: 16px 18px; border-radius: var(--v2-r-md); max-width: min(380px, 88vw); color: var(--color-tooltip-text); }
.v2tip-cat { margin: 0 0 6px; font-size: var(--font-tiny); font-weight: 700; letter-spacing: 0.18em; color: var(--color-tooltip-meta); }
.v2tip-cat span { font-size: 8px; vertical-align: 1px; margin-right: 2px; }
.v2tip-desc { margin: 0; font-size: var(--font-sm); line-height: 1.65; color: var(--color-tooltip-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.v2tip-tags { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--color-tooltip-border); font-size: var(--font-tiny); color: var(--color-tooltip-meta); }
</style>
