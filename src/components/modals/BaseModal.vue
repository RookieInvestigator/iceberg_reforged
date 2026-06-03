<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg'
  showFooter?: boolean
  titleClass?: string
}>();

defineEmits(['close']);

// 统一管理背景滚动锁
let prevBody = '', prevHtml = '';
onMounted(() => {
  prevBody = document.body.style.overflow;
  prevHtml = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
})
onUnmounted(() => {
  document.body.style.overflow = prevBody;
  document.documentElement.style.overflow = prevHtml;
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-overlay" @click.self="$emit('close')">
        <div :class="['modal-panel no-scrollbar', `modal-${size}`]" @click.stop>
          
          <div class="modal-header">
            <!-- 增加 truncate 防止标题过长挤压右侧按钮 -->
            <h2 class="pr-4" :class="titleClass">{{ title }}</h2>
            
            <!-- 动作按钮区（插槽 + 关闭按钮） -->
            <div class="flex items-center gap-3 shrink-0">
              <slot name="header-actions" />
              <button class="modal-close" @click="$emit('close')">&times;</button>
            </div>
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