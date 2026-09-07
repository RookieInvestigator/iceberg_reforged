<script setup>
import { computed } from 'vue';
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';

defineEmits(['close']);
const { t } = useI18n();

// 七节正文按首个换行拆成标题/正文，分节渲染（模板内直接写换行会被 Vue 空白压缩吃掉）
const sections = computed(() => [t('termsService'), t('termsAccount'), t('termsIP'), t('termsConduct'), t('termsPrivacy'), t('termsLiability'), t('termsChanges')].map((s) => {
  const i = s.indexOf('\n')
  return i === -1 ? { title: s, body: '' } : { title: s.slice(0, i), body: s.slice(i + 1) }
}));
</script>

<template>
  <BaseModal :title="t('termsTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white-55 leading-relaxed">
      <p>{{ t('termsIntro') }}</p>
      <div class="border-t border-white-05 pt-5 space-y-5">
        <section v-for="(s, i) in sections" :key="i">
          <h3 class="text-sm font-bold text-white-85 tracking-wide mb-1.5">{{ s.title }}</h3>
          <p class="text-xs text-white-55 leading-relaxed m-0">{{ s.body }}</p>
        </section>
      </div>
      <p class="border-t border-white-05 pt-3 text-xs text-white-30">{{ t('termsEffective') }}</p>
    </div>
  </BaseModal>
</template>
