<script setup>
import { ref, watch, nextTick } from 'vue';
import { useI18n } from '../../lib/useI18n';

const props = defineProps({ show: Boolean, anchor: null, desc: String, noDesc: Boolean, category: String, color: String, tags: String });
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
  <Teleport :to="anchor || 'body'" :disabled="!anchor">
    <div
      ref="rootEl"
      class="tooltip-box"
      :class="{ show: show && teleported }"
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
