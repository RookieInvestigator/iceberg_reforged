<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from '@nanostores/vue';
import BaseModal from './BaseModal.vue';
import { fontSize, floatMode, filterMode, showRandomBtn, bgMode, sortMode, detailMode, showReadMark, showNewMark, showTrail, immersiveMode, scatterMode, v2DetailSurface, quoteStyle, searchEngine, applySimpleMode, applyStandardMode, flushPersistedWrites, cancelPersistedWrites } from '../../lib/settingsStore';
import { lang as langAtom } from '../../lib/i18nStore';
import { useI18n } from '../../lib/useI18n';

defineEmits(['close']);
const { t } = useI18n();
// v2 实验开关只在主站（/，主冰山图）显示：这些开关只作用于词条墙/详情表面，其他页面显示没有意义
const route = useRoute();
const isV2 = computed(() => route.path === '/');

const fs = useStore(fontSize);
const fm = useStore(floatMode);
const flm = useStore(filterMode);
const dm = useStore(detailMode);
const sr = useStore(showRandomBtn);
const srd = useStore(showReadMark);
const snw = useStore(showNewMark);
const strl = useStore(showTrail);
const dbg = useStore(bgMode);
const lang = useStore(langAtom);
const srt = useStore(sortMode);
const sct = useStore(scatterMode);
const imv = useStore(immersiveMode);
const v2ds = useStore(v2DetailSurface);
const qs = useStore(quoteStyle);
const se = useStore(searchEngine);

const fsOpts = ['xs', 'sm', 'md', 'lg', 'xl'];
const floatOpts = ['none', 'static'];
const filterOpts = ['dim', 'hide'];
const sortOpts = ['default', 'title-asc', 'title-desc', 'category'];
const isMobile = ref(false);
const showImport = ref(false);
const importText = ref('');
onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  // 背景「动态」选项已取消：legacy 用户（已存 dynamic）归一为液态（标准模式现为液态）
  if (dbg.value === 'dynamic') bgMode.set('liquid');
});

// 数据管理
function exportData() {
  // 先落盘防抖期内的待写入，导出的数据包含最新值
  flushPersistedWrites();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  const data: Record<string, string> = {};
  keys.filter((k): k is string => !!k && k.startsWith('iceberg-')).forEach(k => { data[k] = localStorage.getItem(k) ?? ''; });
  navigator.clipboard.writeText(JSON.stringify(data)).catch(() => alert(t('copyFailed')));
}
function doImport() {
  try {
    const data = JSON.parse(importText.value);
    for (const [k, v] of Object.entries(data)) { if (k.startsWith('iceberg-') && typeof v === 'string') localStorage.setItem(k, v); }
    location.reload();
  } catch { alert(t('jsonInvalid')); }
}
function clearData() {
  if (!confirm(t('clearConfirm'))) return;
  // 丢弃防抖待写入，防清除后旧值被定时器写回
  cancelPersistedWrites();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k): k is string => !!k && k.startsWith('iceberg-')).forEach(k => localStorage.removeItem(k));
  location.reload();
}
</script>

<template>
  <BaseModal :title="t('settings')" size="md" :showFooter="true" @close="$emit('close')">
    <div class="space-y-3.5">

      <div class="flex gap-2">
        <button @click="applySimpleMode()" class="flex-1 py-2 rounded-md text-xs font-medium border border-white-10 text-white-60 hover:text-white hover:bg-white-05 transition-colors">{{ t('simpleMode') }}</button>
        <button @click="applyStandardMode()" class="flex-1 py-2 rounded-md text-xs font-medium border border-white-10 text-white-60 hover:text-white hover:bg-white-05 transition-colors">{{ t('standardMode') }}</button>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('fontSize') }}</div>
        <div class="flex gap-1">
          <button v-for="o in fsOpts" :key="o" @click="fontSize.set(o)" class="opt-btn" :class="{ 'is-on': fs === o }">
            {{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('sortMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in sortOpts" :key="o" @click="sortMode.set(o)" class="opt-btn" :class="{ 'is-on': srt === o }">
            {{ t('sort' + o.charAt(0).toUpperCase() + o.slice(1).replace(/-./g, x => x[1].toUpperCase())) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('searchEngine') }}</div>
        <div class="flex gap-1">
          <button @click="searchEngine.set('baidu')" class="opt-btn" :class="{ 'is-on': se === 'baidu' }">百度</button>
          <button @click="searchEngine.set('google')" class="opt-btn" :class="{ 'is-on': se === 'google' }">Google</button>
          <button @click="searchEngine.set('bing')" class="opt-btn" :class="{ 'is-on': se === 'bing' }">Bing</button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('bgMode') }}</div>
        <div class="flex gap-1 mb-1">
          <button @click="bgMode.set('black')" class="opt-btn" :class="{ 'is-on': dbg === 'black' }">{{ t('bgBlack') }}</button>
          <button @click="bgMode.set('static')" class="opt-btn" :class="{ 'is-on': dbg === 'static' }">{{ t('bgStatic') }}</button>
          <button @click="bgMode.set('liquid')" class="opt-btn" :class="{ 'is-on': dbg === 'liquid' }">{{ t('bgLiquid') }}</button>
        </div>
        <p v-if="dbg === 'liquid'" class="setting-hint">{{ t('bgLiquidHint') }}</p>
        <p v-if="dbg === 'static' || dbg === 'liquid'" class="setting-hint setting-warn">{{ t('bgHeavyHint') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('detailMode') }}</div>
        <div class="flex gap-1">
          <button @click="detailMode.set('tooltip')" class="opt-btn" :class="{ 'is-on': dm === 'tooltip' }">{{ t('detailTooltip') }}</button>
          <button @click="detailMode.set('modal')" class="opt-btn" :class="{ 'is-on': dm === 'modal' }">{{ t('detailModal') }}</button>
          </div>
          <p v-if="isMobile" class="setting-hint">{{ t('mobileOnlyHint') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('filterMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in filterOpts" :key="o" @click="filterMode.set(o)" class="opt-btn" :class="{ 'is-on': flm === o }">
            {{ o === 'dim' ? t('filterDim') : t('filterHide') }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('experimental') }}</div>
        <div class="space-y-1.5">
          <button @click="showRandomBtn.set(!sr)" class="opt-toggle" :class="{ 'is-on': sr }">
            {{ t('randomBtn') }}
            <span class="opt-toggle-mark">{{ sr ? '●' : '○' }}</span>
          </button>
          <button @click="immersiveMode.set(!imv)" class="opt-toggle" :class="{ 'is-on': imv }">
            {{ t('immersiveMode') }}
            <span class="opt-toggle-mark">{{ imv ? '●' : '○' }}</span>
          </button>
          <button @click="floatMode.set(fm === 'none' ? 'static' : 'none')" class="opt-toggle" :class="{ 'is-on': fm !== 'none' }">
            {{ t('floatMode') }}
            <span class="opt-toggle-mark">{{ fm !== 'none' ? '●' : '○' }}</span>
          </button>
          <button @click="showNewMark.set(!snw)" class="opt-toggle" :class="{ 'is-on': snw }">
            {{ t('highlightNew') }}
            <span class="opt-toggle-mark">{{ snw ? '●' : '○' }}</span>
          </button>
          <button @click="showReadMark.set(!srd)" class="opt-toggle" :class="{ 'is-on': srd }">
            {{ t('dimRead') }}
            <span class="opt-toggle-mark">{{ srd ? '●' : '○' }}</span>
          </button>
          <button @click="showTrail.set(!strl)" class="opt-toggle" :class="{ 'is-on': strl }">
            {{ t('showTrail') }}
            <span class="opt-toggle-mark">{{ strl ? '●' : '○' }}</span>
          </button>
          <button @click="scatterMode.set(!sct)" class="opt-toggle" :class="{ 'is-on': sct }">
            {{ t('scatterMode') }}
            <span class="opt-toggle-mark">{{ sct ? '●' : '○' }}</span>
          </button>
        </div>
      </div>

      <div v-if="isV2">
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('v2DetailSurface') }}</div>
        <div class="flex gap-1">
          <button @click="v2DetailSurface.set('dark')" class="opt-btn" :class="{ 'is-on': v2ds === 'dark' }">{{ t('v2SurfaceDark') }}</button>
          <button @click="v2DetailSurface.set('light')" class="opt-btn" :class="{ 'is-on': v2ds === 'light' }">{{ t('v2SurfaceLight') }}</button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('quoteStyle') }}</div>
        <div class="flex gap-1">
          <button @click="quoteStyle.set('corner')" class="opt-btn" :class="{ 'is-on': qs === 'corner' }">{{ t('quoteCorner') }}</button>
          <button @click="quoteStyle.set('curly')" class="opt-btn" :class="{ 'is-on': qs === 'curly' }">{{ t('quoteCurly') }}</button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('lang') }}</div>
        <div class="flex gap-1">
          <button @click="langAtom.set('zh')" class="opt-btn" :class="{ 'is-on': lang === 'zh' }">中文</button>
          <button @click="langAtom.set('en')" class="opt-btn" :class="{ 'is-on': lang === 'en' }">EN</button>
          <button @click="langAtom.set('ja')" class="opt-btn" :class="{ 'is-on': lang === 'ja' }">日本語</button>
        </div>
      </div>

      <!-- 数据管理 -->
      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white-50 uppercase tracking-[0.2em]">{{ t('data') }}</div>
        <div class="flex gap-1">
          <button @click="exportData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white-60 hover:text-white-90 hover:bg-white-05 transition-colors">{{ t('dataExport') }}</button>
          <button @click="showImport = !showImport" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white-60 hover:text-white-90 hover:bg-white-05 transition-colors">{{ t('dataImport') }}</button>
          <button @click="clearData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-danger-soft hover:text-danger hover:bg-danger-wash transition-colors">{{ t('dataClear') }}</button>
        </div>
        <div v-if="showImport" class="mt-2">
          <textarea v-model="importText" :placeholder="t('pasteJsonHint')" class="w-full h-16 text-xs max-sm:text-base rounded-md p-2 bg-white-05 border border-white-10 text-white-70 resize-none"></textarea>
          <button @click="doImport" class="mt-1.5 w-full py-1 rounded-md text-xs font-medium bg-white-10 text-white hover:bg-white-20 transition-colors">{{ t('confirmImport') }}</button>
        </div>
      </div>

    </div>

    <template v-slot:footer-hint>
      {{ t('settingsRefreshHint') }}
    </template>
  </BaseModal>
</template>

<style scoped>
/* P1-8: 移动端设置面板按钮触控目标 ≥44px */
@media (max-width: 640px) {
  button { min-height: 44px; }
}
</style>