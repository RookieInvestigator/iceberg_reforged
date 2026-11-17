<script setup>
// V2Tooltip：词条悬停卡片 —— 分类眉题 + 描述 + 发丝线元信息。
// 定位/尺寸由 useTooltip 内联写入，样式只管字与间距；.tooltip-box 的定位与
// 显示状态机（.show / .floating）走 index.css 全局规则。
import { computed, ref } from 'vue';
import { useI18n } from '../../lib/useI18n';
import { useFadeInOnShow } from '../../lib/iceberg/useFadeInOnShow';
import RichText from '../ui/RichText.vue';

const props = defineProps({ show: Boolean, floating: Boolean, anchor: { type: [String, Object], default: null }, desc: String, noDesc: Boolean, category: String, color: String, tags: String, link: { type: String, default: '' } });
const emit = defineEmits(['enter', 'leave']);

const { t } = useI18n();

// 仅纯白（都市传说・超自然事件・超常经历 #FFFFFF）色点加黑边，其余纯色圆不动。
// 该特判依赖浅色表面（白底）：若 tooltip 表面改深色需反转。
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
      <p class="v2tip-cat">
        <span :style="dotStyle">●</span> {{ category }}
        <span v-if="link" class="v2tip-link" :title="t('hasLink')" :aria-label="t('hasLink')">
          <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
            <path d="M3 9 L9 3 M4.5 3 H9 V7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </p>
      <p class="v2tip-desc" :class="{ 'tooltip-desc-empty': noDesc }">
        <RichText inline :text="desc || ''" />
      </p>
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
/* 有外链标记：眉题末尾一个小箭头，不加下划线也不印 URL */
.v2tip-link { display: inline-flex; align-items: center; margin-left: 4px; color: var(--color-tooltip-meta); opacity: 0.75; vertical-align: 0; }
.v2tip-link svg { display: block; }
.v2tip-desc { margin: 0; font-size: var(--font-sm); line-height: 1.65; color: var(--color-tooltip-text); overflow-wrap: anywhere; }
.v2tip-tags { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--color-tooltip-border); font-size: var(--font-tiny); color: var(--color-tooltip-meta); }
</style>
