<script setup>
import { useI18n } from '../lib/useI18n';

defineEmits(['close']);

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel" style="max-width:380px" @click.stop>
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold text-white">{{ t('bulletinTitle') }}</h2>
            <button @click="$emit('close')" class="text-white/30 hover:text-white/60 text-xl leading-none">&times;</button>
          </div>
          <div class="text-sm text-white/60 leading-relaxed space-y-2">
            <p>网站尚在开发中，部分功能暂未实装：</p>
            <ul class="list-disc list-inside space-y-1">
              <li>设置：沉浸模式</li>
              <li>筛选：最新</li>
              <li>设置：词条详情弹窗</li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
