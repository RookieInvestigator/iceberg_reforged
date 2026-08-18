<script setup>
import { inject, ref, onMounted, defineAsyncComponent } from 'vue';
import { useStore } from '@nanostores/vue';
import { useI18n } from '../../lib/useI18n';
// P1-10: 登录态走轻量 userState（不引 SDK）；UserModal 与 authStore 均懒加载
import { user as userAtom, isSupabaseReady } from '../../lib/userState';
import { OPEN_ON_THIS_DAY_KEY } from '../../lib/injectionKeys';
const UserModal = defineAsyncComponent(() => import('../modals/UserModal.vue'));

defineProps({
  buildDate: { type: String, default: '' },
  entryCount: { type: Number, default: 0 },
  introText: { type: String, default: '' },
});

const { t } = useI18n();
const openOnThisDay = inject(OPEN_ON_THIS_DAY_KEY, null);
const u = useStore(userAtom);
const showUser = ref(false);
// P0-4: 未配置 Supabase 时不显示登录入口（点了也会抛错）
const supReady = isSupabaseReady();

// P1-10: 空闲时加载 authStore（恢复会话/监听登录态），SDK 不进首屏关键路径
onMounted(() => {
  if (!supReady) return;
  const preload = () => import('../../lib/authStore');
  if (typeof requestIdleCallback === 'function') requestIdleCallback(preload, { timeout: 3000 });
  else window.setTimeout(preload, 800);
});
</script>

<template>
  <div class="text-center pt-10 pb-6 max-sm:pt-8 max-sm:pb-4" style="padding: 0 var(--header-padding-x)">
    <div class="mb-14 max-sm:mb-8 flex flex-col items-center">
      <div class="mb-4 text-sm font-light uppercase tracking-[0.8em] mr-[-0.8em] text-white/50 max-sm:text-xs max-sm:tracking-[0.5em]">
        Chinese Oddities Iceberg · Reforged
      </div>
      <div class="relative inline-flex items-start">
        <h1 class="text-[3.8rem] font-black tracking-widest text-white leading-none max-md:text-[2.4rem] max-sm:text-[1.8rem] max-sm:tracking-wide">
          {{ t('siteTitle') }}
        </h1>
      </div>
      <p class="mt-8 max-sm:mt-6 text-[length:var(--font-sm)] max-sm:text-[length:var(--font-xs)] font-light text-white/50 tracking-widest max-sm:tracking-wide uppercase">
        {{ buildDate }} <span class="mx-3 opacity-30">|</span> {{ entryCount }} {{ t('entries') }}
      </p>

      <div class="mt-3 flex items-center gap-3 max-sm:gap-4 text-xs max-sm:text-[length:var(--font-sm)] tracking-wider">
        <button v-if="openOnThisDay" @click="openOnThisDay()" class="text-white/60 hover:text-white/90 transition-colors py-1">{{ t('onThisDay') }}</button>
        <router-link v-else to="/on-this-day" class="text-white/60 hover:text-white/90 transition-colors py-1">{{ t('onThisDay') }}</router-link>
        <span class="text-white/10">|</span>
        <router-link to="/home" class="text-white/60 hover:text-white/90 transition-colors py-1">{{ t('navHome') }}</router-link>
        <span class="text-white/10">|</span>
        <button v-if="supReady" @click="showUser = true" class="text-white/60 hover:text-white/90 transition-colors py-1">
          {{ u ? t('user') + ': ' + u.displayName : t('login') }}
        </button>
      </div>
      <UserModal v-if="showUser" @close="showUser = false" />
    </div>

    <p
      v-if="introText"
      class="text-[1rem] max-sm:text-[length:var(--font-base)] text-white/60 font-normal leading-relaxed max-w-[750px] mx-auto whitespace-pre-wrap max-sm:leading-snug"
    >
      {{ introText }}
    </p>
  </div>
</template>

