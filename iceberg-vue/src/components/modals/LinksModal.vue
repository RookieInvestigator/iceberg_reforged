<script setup lang="ts">
// 友链弹窗 — 展示与本项目互链的伙伴站点
import BaseModal from './BaseModal.vue'
import { useI18n } from '../../lib/useI18n'

defineEmits(['close'])

const { t } = useI18n()

const links = [
  {
    labelKey: 'linksTieba',
    descKey: 'linksTiebaDesc',
    url: 'https://tieba.baidu.com/f?ie=utf-8&kw=%E9%83%BD%E5%B8%82%E4%BC%A0%E8%AF%B4',
  },
]
</script>

<template>
  <BaseModal :title="t('homeLinks')" size="sm" @close="$emit('close')">
    <div class="space-y-4 text-sm text-white-55 leading-relaxed">
      <p>{{ t('linksIntro') }}</p>

      <a v-for="(link, i) in links" :key="i" :href="link.url" target="_blank" rel="noopener noreferrer"
        class="group flex items-center justify-between gap-3 rounded-xl border border-white-08 bg-white-03 px-4 py-3 no-underline transition-colors duration-200 hover:border-white-16 hover:bg-white-05">
        <span class="min-w-0">
          <span class="block text-sm font-semibold text-text-primary">{{ t(link.labelKey) }}</span>
          <span class="mt-0.5 block text-xs text-white-45">{{ t(link.descKey) }}</span>
        </span>
        <span class="shrink-0 text-white-60 transition-transform duration-200 group-hover:translate-x-[3px]" aria-hidden="true">→</span>
      </a>
    </div>
  </BaseModal>
</template>
