<script setup lang="ts">
// V2Header（/v2 专用）：替代 Header 的大品牌块。
// 极简 masthead：微型英文眉题 + 收敛的中文标题 + 单行元信息 + 文本导航。
// 逻辑与 Header 一致（用户弹窗懒加载、Supabase 缺席隐藏入口、authStore 空闲预取）。
import { inject, ref, onMounted, defineAsyncComponent } from 'vue';
import { useStore } from '@nanostores/vue';
import { useI18n } from '../../lib/useI18n';
import { user as userAtom, isSupabaseReady } from '../../lib/userState';
import { OPEN_ON_THIS_DAY_KEY } from '../../lib/injectionKeys';
const UserModal = defineAsyncComponent(() => import('../modals/UserModal.vue'));
// 版权弹窗非首屏关键内容，懒加载（与 UserModal 同策略）
const CopyrightModal = defineAsyncComponent(() => import('../modals/CopyrightModal.vue'));

defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
});

const { t } = useI18n();
const openOnThisDay = inject(OPEN_ON_THIS_DAY_KEY, null);
const u = useStore(userAtom);
const showUser = ref(false);
const showCopyright = ref(false);
const supReady = isSupabaseReady();

onMounted(() => {
  if (!supReady) return;
  const preload = () => import('../../lib/authStore');
  if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 3000 });
  else window.setTimeout(preload, 800);
});
</script>

<template>
  <div class="v2mast" style="padding: 0 var(--header-padding-x)">
    <p class="v2mast-kicker">Chinese Oddities Iceberg · Reforged</p>
    <h1 class="v2mast-title">{{ t('siteTitle') }}</h1>
    <p class="v2mast-meta">{{ buildDate }} <span aria-hidden="true">·</span> {{ entryCount }} {{ t('entries') }}</p>
    <nav class="v2mast-nav">
      <button v-if="openOnThisDay" @click="openOnThisDay()">{{ t('onThisDay') }}</button>
      <router-link v-else to="/on-this-day">{{ t('onThisDay') }}</router-link>
      <span aria-hidden="true">/</span>
      <router-link to="/home">{{ t('navHome') }}</router-link>
      <span aria-hidden="true">/</span>
      <router-link to="/handbook">{{ t('handbookTitle') }}</router-link>
      <span aria-hidden="true">/</span>
      <button @click="showCopyright = true">{{ t('copyrightLink') }}</button>
      <span aria-hidden="true">/</span>
      <button v-if="supReady" @click="showUser = true">
        {{ u ? t('user') + ': ' + u.displayName : t('login') }}
      </button>
    </nav>
    <UserModal v-if="showUser" @close="showUser = false" />
    <CopyrightModal v-if="showCopyright" @close="showCopyright = false" />
    <p v-if="introText" class="v2mast-intro">{{ introText }}</p>
  </div>
</template>

<style scoped>
.v2mast { text-align: center; padding-top: 3.5rem; padding-bottom: 1rem; }
.v2mast-kicker { margin: 0 0 1rem; font-size: var(--font-xs); font-weight: 400; letter-spacing: 0.5em; margin-right: -0.5em; color: var(--white-35); text-transform: uppercase; }
.v2mast-title { margin: 0; font-size: var(--v2-title-size); font-weight: 900; letter-spacing: 0.18em; margin-right: -0.18em; color: var(--white-90); line-height: 1.2; }
.v2mast-meta { margin: 1rem 0 0; font-size: var(--font-xs); font-weight: 400; letter-spacing: 0.2em; color: var(--white-40); }
.v2mast-nav { margin-top: 0.9rem; display: flex; align-items: center; justify-content: center; gap: 0.9rem; font-size: var(--font-xs); letter-spacing: 0.1em; }
.v2mast-nav a, .v2mast-nav button { background: none; border: none; cursor: pointer; padding: 0.2rem 0; color: var(--white-45); text-decoration: none; transition: color 0.15s; }
.v2mast-nav a:hover, .v2mast-nav button:hover { color: var(--white-85); }
.v2mast-nav span { color: var(--white-15); }
.v2mast-intro { margin: 1.4rem auto 0; max-width: 620px; font-size: var(--font-sm); line-height: 1.9; color: var(--white-40); white-space: pre-wrap; }
@media (max-width: 640px) {
  .v2mast { padding-top: 2.5rem; }
  .v2mast-title { font-size: var(--v2-title-size-sm); }
}
</style>
