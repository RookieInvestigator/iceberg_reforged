<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg'
  showFooter?: boolean
  titleClass?: string
  titleClick?: () => void
}>();

const emit = defineEmits(['close']);

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

let modalCount = 0

// 统一管理背景滚动锁（引用计数）+ Esc 键
onMounted(() => {
  modalCount++
  if (modalCount === 1) {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  document.addEventListener('keydown', onKey);
})
onUnmounted(() => {
  modalCount--
  if (modalCount === 0) {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
  document.removeEventListener('keydown', onKey);
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-up" appear>
      <div class="modal-overlay" @click.self="$emit('close')" @touchmove.self.prevent>
        <div :class="['modal-panel no-scrollbar', `modal-${size}`]" @click.stop>
          
          <div class="modal-header">
            <!-- 增加 truncate 防止标题过长挤压右侧按钮 -->
            <h2 class="pr-4" :class="[titleClass, titleClick ? 'cursor-pointer hover:opacity-70' : '']" @click="titleClick">{{ title }}</h2>
            
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

<style>
/* 弹窗过渡动画 */
.fade-up-enter-active { transition: opacity 0.1s ease-out; }
.fade-up-leave-active { transition: opacity 0.06s ease-in; }
.fade-up-enter-from,
.fade-up-leave-to { opacity: 0; }
</style>