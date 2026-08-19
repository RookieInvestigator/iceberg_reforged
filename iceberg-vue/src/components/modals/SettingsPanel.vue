<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useStore } from '@nanostores/vue';
import BaseModal from './BaseModal.vue';
import { fontSize, floatMode, filterMode, showRandomBtn, bgMode, sortMode, detailMode, showReadMark, showNewMark, immersiveMode, scatterMode, applySimpleMode, applyStandardMode } from '../../lib/settingsStore';
import { lang as langAtom } from '../../lib/i18nStore';
import { useI18n } from '../../lib/useI18n';

defineEmits(['close']);
const { t } = useI18n();

const fs = useStore(fontSize);
const fm = useStore(floatMode);
const flm = useStore(filterMode);
const dm = useStore(detailMode);
const sr = useStore(showRandomBtn);
const srd = useStore(showReadMark);
const snw = useStore(showNewMark);
const dbg = useStore(bgMode);
const lang = useStore(langAtom);
const srt = useStore(sortMode);
const sct = useStore(scatterMode);
const imv = useStore(immersiveMode);

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
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k): k is string => !!k && k.startsWith('iceberg-')).forEach(k => localStorage.removeItem(k));
  location.reload();
}
</script>

<template>
  <BaseModal :title="t('settings')" size="md" :showFooter="true" @close="$emit('close')">
    <div class="space-y-4">

      <div class="flex gap-2">
        <button @click="applySimpleMode()" class="flex-1 py-2 rounded-md text-xs font-medium border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors">{{ t('simpleMode') }}</button>
        <button @click="applyStandardMode()" class="flex-1 py-2 rounded-md text-xs font-medium border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors">{{ t('standardMode') }}</button>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('fontSize') }}</div>
        <div class="flex gap-1">
          <button v-for="o in fsOpts" :key="o" @click="fontSize.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', fs === o ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('sortMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in sortOpts" :key="o" @click="sortMode.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', srt === o ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('sort' + o.charAt(0).toUpperCase() + o.slice(1).replace(/-./g, x => x[1].toUpperCase())) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('bgMode') }}</div>
        <div class="flex gap-1 mb-1">
          <button @click="bgMode.set('black')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'black' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">{{ t('bgBlack') }}</button>
          <button @click="bgMode.set('static')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'static' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">{{ t('bgStatic') }}</button>
          <button @click="bgMode.set('liquid')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'liquid' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">{{ t('bgLiquid') }}</button>
        </div>
        <p v-if="dbg === 'liquid'" class="setting-hint">{{ t('bgLiquidHint') }}</p>
        <p v-if="dbg === 'static' || dbg === 'liquid'" class="setting-hint setting-warn">{{ t('bgHeavyHint') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('detailMode') }}</div>
        <div class="flex gap-1">
          <button @click="detailMode.set('tooltip')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'tooltip' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">{{ t('detailTooltip') }}</button>
          <button @click="detailMode.set('modal')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'modal' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">{{ t('detailModal') }}</button>
          </div>
          <p v-if="isMobile" class="setting-hint">{{ t('mobileOnlyHint') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('filterMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in filterOpts" :key="o" @click="filterMode.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', flm === o ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ o === 'dim' ? t('filterDim') : t('filterHide') }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('experimental') }}</div>
        <div class="space-y-1.5">
          <button @click="showRandomBtn.set(!sr)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', sr ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('randomBtn') }}
            <span :class="sr ? 'text-white' : 'text-white/55'">{{ sr ? '●' : '○' }}</span>
          </button>
          <button @click="immersiveMode.set(!imv)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', imv ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('immersiveMode') }}
            <span :class="imv ? 'text-white' : 'text-white/55'">{{ imv ? '●' : '○' }}</span>
          </button>
          <button @click="floatMode.set(fm === 'none' ? 'static' : 'none')"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', fm !== 'none' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('floatMode') }}
            <span :class="fm !== 'none' ? 'text-white' : 'text-white/55'">{{ fm !== 'none' ? '●' : '○' }}</span>
          </button>
          <button @click="showNewMark.set(!snw)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', snw ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('highlightNew') }}
            <span :class="snw ? 'text-white' : 'text-white/55'">{{ snw ? '●' : '○' }}</span>
          </button>
          <button @click="showReadMark.set(!srd)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', srd ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('dimRead') }}
            <span :class="srd ? 'text-white' : 'text-white/55'">{{ srd ? '●' : '○' }}</span>
          </button>
          <button @click="scatterMode.set(!sct)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', sct ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('scatterMode') }}
            <span :class="sct ? 'text-white' : 'text-white/55'">{{ sct ? '●' : '○' }}</span>
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('lang') }}</div>
        <div class="flex gap-1">
          <button @click="langAtom.set('zh')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'zh' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">中文</button>
          <button @click="langAtom.set('en')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'en' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">EN</button>
          <button @click="langAtom.set('ja')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'ja' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">日本語</button>
        </div>
      </div>

      <!-- 数据管理 -->
      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('data') }}</div>
        <div class="flex gap-1">
          <button @click="exportData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors">{{ t('dataExport') }}</button>
          <button @click="showImport = !showImport" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors">{{ t('dataImport') }}</button>
          <button @click="clearData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-red-400/80 hover:text-red-400 hover:bg-red-400/5 transition-colors">{{ t('dataClear') }}</button>
        </div>
        <div v-if="showImport" class="mt-2">
          <textarea v-model="importText" :placeholder="t('pasteJsonHint')" class="w-full h-16 text-xs max-sm:text-base rounded-md p-2 bg-white/5 border border-white/10 text-white/70 resize-none" style="outline:none"></textarea>
          <button @click="doImport" class="mt-1.5 w-full py-1 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors">{{ t('confirmImport') }}</button>
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