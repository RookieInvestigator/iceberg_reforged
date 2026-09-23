<script setup lang="ts">
// ExportImageButton：导出触发器（v1 页脚 / v2 跋共用）。
// 点开 ExportModal（四格式 + 三档宽度）；重型导出引擎仍在弹窗流程里懒加载，不进首屏包。
import { ref, useAttrs } from 'vue';
import { Download } from '@lucide/vue';
import { useI18n } from '../../lib/useI18n';
import ExportModal from '../modals/ExportModal.vue';

defineOptions({ inheritAttrs: false }); // fragment 根：class 手动落到 button，关自动透传（消 Extraneous 警告）
const attrs = useAttrs();

defineProps({
  linklike: { type: Boolean, default: false },
  coverTitle: { type: String, default: '' },
  coverMeta: { type: String, default: '' },
  coverIntro: { type: String, default: '' },
});

const { t } = useI18n();
const showExport = ref(false);
</script>

<template>
  <button v-if="linklike" type="button" class="export-linklike" :class="attrs.class" :aria-label="t('exportTitle')" @click="showExport = true">
    {{ t('exportTitle') }}
  </button>
  <button v-else type="button" class="fab-btn w-11 h-11 rounded-full flex items-center justify-center cursor-pointer border-none text-white-40 bg-white-04 transition-colors duration-150 hover:text-white-70 hover:bg-white-08 active:scale-[0.94]" :class="attrs.class" :aria-label="t('exportTitle')" :title="t('exportTitle')" @click="showExport = true">
    <Download :size="20" :stroke-width="2" />
  </button>
  <ExportModal v-if="showExport" :coverTitle="coverTitle" :coverMeta="coverMeta" :coverIntro="coverIntro" @close="showExport = false" />
</template>

<style scoped>
/* 页脚文字链形态：跟随所在页脚的链接样式（v2 跋 / v1 页脚各自覆盖颜色） */
.export-linklike {
  background: none; border: none; cursor: pointer; padding: 0;
  font: inherit; color: inherit; transition: color 0.15s;
}
</style>
