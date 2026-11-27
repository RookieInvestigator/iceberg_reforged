<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onMounted, ref } from 'vue'
import { useStore } from '@nanostores/vue'
import { useI18n } from '../../lib/useI18n'
import { user as userAtom, isSupabaseReady } from '../../lib/userState'
import { V3_CTX_KEY } from '../../lib/v3/keys'

const UserModal = defineAsyncComponent(() => import('../modals/UserModal.vue'))
const CopyrightModal = defineAsyncComponent(() => import('../modals/CopyrightModal.vue'))

const props = withDefaults(defineProps<{
  buildDate?: string
  entryCount?: number
  introText?: string
}>(), {
  buildDate: '',
  entryCount: 0,
  introText: '',
})

const { t } = useI18n()
const v3Ctx = inject(V3_CTX_KEY, null)
const u = useStore(userAtom)
const supReady = isSupabaseReady()
const showUser = ref(false)
const showCopyright = ref(false)
const resolvedBuildDate = computed(() => v3Ctx?.buildDate.value ?? props.buildDate)
const resolvedEntryCount = computed(() => (v3Ctx ? v3Ctx.dataset.value.items.length : props.entryCount))
const intro = computed(() => (v3Ctx ? v3Ctx.dataset.value.introText : props.introText || '').trim())

onMounted(() => {
  if (!supReady) return
  const preload = () => import('../../lib/authStore')
  if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 3000 })
  else window.setTimeout(preload, 800)
})
</script>

<template>
  <header class="v3-mast">
    <p class="v3-mast-kicker">Chinese Oddities Iceberg · Reforged</p>
    <h1 class="v3-mast-title">{{ t('siteTitle') }}</h1>
    <p class="v3-mast-meta">{{ resolvedBuildDate }} <span aria-hidden="true">·</span> {{ resolvedEntryCount }} {{ t('entries') }}</p>

    <nav class="v3-mast-nav">
      <button v-if="v3Ctx" type="button" @click="v3Ctx.openOnThisDay()">{{ t('onThisDay') }}</button>
      <RouterLink v-else to="/on-this-day">{{ t('onThisDay') }}</RouterLink>
      <span class="v3-nav-sep" aria-hidden="true">/</span>
      <RouterLink to="/home">{{ t('navHome') }}</RouterLink>
      <span class="v3-nav-sep" aria-hidden="true">/</span>
      <RouterLink to="/handbook">{{ t('handbookTitle') }}</RouterLink>
      <span class="v3-nav-sep" aria-hidden="true">/</span>
      <button type="button" @click="showCopyright = true">{{ t('copyrightLink') }}</button>
      <template v-if="supReady">
        <span class="v3-nav-sep" aria-hidden="true">/</span>
        <button type="button" @click="showUser = true">
          {{ u ? t('user') + ': ' + u.displayName : t('login') }}
        </button>
      </template>
    </nav>

    <p v-if="intro" class="v3-mast-intro clreq-text" lang="zh-CN">{{ intro }}</p>

    <UserModal v-if="showUser" @close="showUser = false" />
    <CopyrightModal v-if="showCopyright" @close="showCopyright = false" />
  </header>
</template>
