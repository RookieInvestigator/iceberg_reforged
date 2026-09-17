<script setup>
import { computed, ref } from 'vue';
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';
import { buildReprintText, getContributors, REPRINT_SITE, REPRINT_URL } from '../../lib/reprint';

defineEmits(['close']);

const { t } = useI18n();

// 转载模板：标题/链接取本站（名单由 reprint.ts 从 meta.json 同源读取，随数据更新自动同步）
const reprintPreview = computed(() => buildReprintText(REPRINT_SITE, REPRINT_URL));
// 完整名单：纯文字整块展示（无内部滚动，可全文选取/分段截图）
const roster = getContributors();

const copied = ref(false);
let copiedTimer = 0;
function copyReprint() {
  navigator.clipboard.writeText(reprintPreview.value).then(() => {
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copied.value = false; }, 2000);
  }).catch(() => alert(t('copyFailed')));
}
</script>

<template>
  <BaseModal :title="t('copyrightTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white-55 leading-relaxed">
      <div class="text-xs text-white-55 leading-relaxed space-y-2">
        <p>{{ t('licenseNote') }}</p>
        <p class="text-center">
          <a href="https://github.com/RookieInvestigator/iceberg_reforged/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" class="text-white-50 hover:text-white-80 transition-colors">AGPLv3</a>
          <span class="text-white-15"> · </span>
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hans" target="_blank" rel="noopener noreferrer" class="text-white-50 hover:text-white-80 transition-colors">CC BY-SA 4.0</a>
        </p>
        <p>{{ t('takedownNote') }}</p>
      </div>

      <div class="border-t border-white-05 pt-4 text-xs text-white-55 leading-relaxed space-y-2">
        <p>{{ t('reprintNote') }}</p>
        <pre class="no-scrollbar max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white-03 p-3 text-left text-white-55">{{ reprintPreview }}</pre>
        <p class="text-center">
          <button type="button" class="text-white-50 no-underline transition-colors duration-200 hover:text-white-80" @click="copyReprint">
            {{ copied ? t('reprintCopied') : t('reprintCopy') }}
          </button>
        </p>
      </div>

      <div class="border-t border-white-05 pt-4 text-xs text-white-55 leading-relaxed space-y-2">
        <p>{{ t('reprintRosterMust') }}</p>
        <p>{{ t('reprintRoster') }} · {{ roster.length }}</p>
        <p class="whitespace-pre-wrap break-words text-left text-white-55">{{ roster.join('、') }}</p>
      </div>
    </div>
  </BaseModal>
</template>
