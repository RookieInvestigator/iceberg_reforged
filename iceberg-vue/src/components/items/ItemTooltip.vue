<script setup>
import { ref, watch, nextTick } from 'vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({ show: Boolean, floating: Boolean, anchor: null, desc: String, noDesc: Boolean, category: String, color: String, tags: String });
const emit = defineEmits(['enter', 'leave']);

const { t } = useI18n();

const rootEl = ref(null);
defineExpose({ rootEl });

// Teleport to anchor then trigger fade-in
const teleported = ref(false);
watch(() => props.show, async (val) => {
  if (val) {
    teleported.value = false;
    await nextTick();
    teleported.value = true;
  }
});
</script>

<template>
  <!-- floating（生产）：body 级浮动层 + fixed 视口坐标（useTooltip 硬钳制），
       不依附词条/层级 → 任何祖先合成层/containment/overflow 都无法裁剪；
       anchor（实验页幽灵锚点等）回退：teleport 进锚点元素走原 CSS 定位 -->
  <Teleport :to="(floating ? 'body' : anchor) || 'body'" :disabled="!floating && !anchor">
    <div
      ref="rootEl"
      class="tooltip-box"
      :class="{ show: show && teleported, floating }"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <div class="tooltip-desc" :class="{ 'tooltip-desc-empty': noDesc }">{{ desc }}</div>
      <div class="tooltip-meta">
        <span :style="{ color, filter: 'brightness(0.75) saturate(0.65)' }">{{ t('categories') }}: {{ category }}</span>
        <span v-if="tags">　　{{ t('tags') }}: {{ tags }}</span>
      </div>
    </div>
  </Teleport>
</template>
