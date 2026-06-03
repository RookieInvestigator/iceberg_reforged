<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useStore } from '@nanostores/vue';
import BaseModal from './BaseModal.vue';
import { fontSize, floatMode, filterMode, showRandomBtn, bgMode, sortMode, detailMode } from '../../lib/settingsStore';
import { lang as langAtom } from '../../lib/i18nStore';
import { useI18n } from '../../lib/useI18n';

defineEmits(['close']);
const { t } = useI18n();

const fs = useStore(fontSize);
const fm = useStore(floatMode);
const flm = useStore(filterMode);
const dm = useStore(detailMode);
const sr = useStore(showRandomBtn);
const dbg = useStore(bgMode);
const lang = useStore(langAtom);
const srt = useStore(sortMode);

const fsOpts = ['xs', 'sm', 'md', 'lg', 'xl'];
const floatOpts = ['none', 'static'];
const filterOpts = ['dim', 'hide'];
const sortOpts = ['default', 'title-asc', 'title-desc', 'category'];
const isMobile = ref(false);
const showImport = ref(false);
const importText = ref('');
onMounted(() => { isMobile.value = window.innerWidth < 1024 });

// 数据管理
function exportData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  const data: Record<string, string> = {};
  keys.filter((k): k is string => !!k && k.startsWith('iceberg-')).forEach(k => { data[k] = localStorage.getItem(k) ?? ''; });
  navigator.clipboard.writeText(JSON.stringify(data)).catch(() => alert('复制失败'));
}
function doImport() {
  try {
    const data = JSON.parse(importText.value);
    for (const [k, v] of Object.entries(data)) { if (k.startsWith('iceberg-') && typeof v === 'string') localStorage.setItem(k, v); }
    location.reload();
  } catch { alert('JSON 格式不正确'); }
}
function clearData() {
  if (!confirm('确认清空所有收藏和设置数据？此操作不可撤销。')) return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  keys.filter((k): k is string => !!k && k.startsWith('iceberg-')).forEach(k => localStorage.removeItem(k));
  location.reload();
}
</script>

<template>
  <BaseModal :title="t('settings')" size="md" :showFooter="true" @close="$emit('close')">
    <div class="space-y-4">
      
      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('fontSize') }}</div>
        <div class="flex gap-1">
          <button v-for="o in fsOpts" :key="o" @click="fontSize.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', fs === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
            {{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('sortMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in sortOpts" :key="o" @click="sortMode.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', srt === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
            {{ t('sort' + o.charAt(0).toUpperCase() + o.slice(1).replace(/-./g, x => x[1].toUpperCase())) }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('bgMode') }}</div>
        <div class="flex gap-1 mb-1">
          <button @click="bgMode.set('black')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'black' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('bgBlack') }}</button>
          <button @click="bgMode.set('static')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'static' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('bgStatic') }}</button>
          <button @click="bgMode.set('dynamic')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dbg === 'dynamic' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('bgDynamic') }}</button>
        </div>
        <p v-if="dbg === 'dynamic'" class="setting-hint">{{ t('bgDynamicWarn') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('detailMode') }}</div>
        <div class="flex gap-1">
          <button @click="detailMode.set('tooltip')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'tooltip' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('detailTooltip') }}</button>
          <button @click="detailMode.set('modal')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'modal' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('detailModal') }}</button>
          </div>
          <p v-if="isMobile" class="setting-hint">手机端仅支持底部抽屉，此设置不影响手机</p>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('filterMode') }}</div>
        <div class="flex gap-1">
          <button v-for="o in filterOpts" :key="o" @click="filterMode.set(o)"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', flm === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
            {{ o === 'dim' ? t('filterDim') : t('filterHide') }}
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('experimental') }}</div>
        <div class="space-y-1.5">
          <button @click="showRandomBtn.set(!sr)"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', sr ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5']">
            {{ t('randomBtn') }}
            <span :class="sr ? 'text-white' : 'text-white/20'">{{ sr ? '●' : '○' }}</span>
          </button>
          <button @click="floatMode.set(fm === 'none' ? 'static' : 'none')"
            :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', fm !== 'none' ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5']">
            {{ t('floatMode') }}
            <span :class="fm !== 'none' ? 'text-white' : 'text-white/20'">{{ fm !== 'none' ? '●' : '○' }}</span>
          </button>
        </div>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('lang') }}</div>
        <div class="flex gap-1">
          <button @click="langAtom.set('zh')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'zh' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">中文</button>
          <button @click="langAtom.set('en')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'en' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">EN</button>
          <button @click="langAtom.set('ja')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'ja' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">日本語</button>
        </div>
      </div>

      <!-- 数据管理 -->
      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">数据</div>
        <div class="flex gap-1">
          <button @click="exportData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white/35 hover:text-white/70 hover:bg-white/5 transition-colors">{{ t('dataExport') }}</button>
          <button @click="showImport = !showImport" class="flex-1 py-1.5 rounded-md text-xs font-medium text-white/35 hover:text-white/70 hover:bg-white/5 transition-colors">{{ t('dataImport') }}</button>
          <button @click="clearData" class="flex-1 py-1.5 rounded-md text-xs font-medium text-red-400/40 hover:text-red-400 hover:bg-red-400/5 transition-colors">{{ t('dataClear') }}</button>
        </div>
        <div v-if="showImport" class="mt-2">
          <textarea v-model="importText" placeholder="粘贴 JSON 数据..." class="w-full h-16 text-xs rounded-md p-2 bg-white/5 border border-white/10 text-white/70 resize-none" style="outline:none"></textarea>
          <button @click="doImport" class="mt-1.5 w-full py-1 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors">确认导入</button>
        </div>
      </div>

    </div>

    <template v-slot:footer-hint>
      {{ t('settingsRefreshHint') }}
    </template>
  </BaseModal>
</template>