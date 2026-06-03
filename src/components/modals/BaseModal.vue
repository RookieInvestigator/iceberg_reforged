<script setup>
import { onMounted, onUnmounted } from 'vue'

defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' }, // 可選：sm, md, lg
  showFooter: { type: Boolean, default: false }
});

defineEmits(['close']);

// 統一管理背景滾動鎖
onMounted(() => { document.body.style.overflow = 'hidden' })
onUnmounted(() => { document.body.style.overflow = '' })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-overlay" @click.self="$emit('close')">
        <div :class="['modal-panel no-scrollbar', `modal-${size}`]" @click.stop>
          
          <div class="modal-header">
            <h2>{{ title }}</h2>
            <button class="modal-close" @click="$emit('close')">&times;</button>
          </div>

          <div class="modal-body no-scrollbar">
            <slot />
          </div>

          <div v-if="showFooter" class="modal-footer-hint">
            <slot name="footer-hint" />
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>