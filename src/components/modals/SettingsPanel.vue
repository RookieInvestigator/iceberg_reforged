<script setup>
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
        <p v-if="dbg === 'dynamic'" class="text-[0.6rem] text-amber-500/50 leading-relaxed px-1">{{ t('bgDynamicWarn') }}</p>
      </div>

      <div>
        <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('detailMode') }}</div>
        <div class="flex gap-1">
          <button @click="detailMode.set('tooltip')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'tooltip' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('detailTooltip') }}</button>
          <button @click="detailMode.set('modal')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'modal' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">{{ t('detailModal') }}</button>
        </div>
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

    </div>

    <template #footer-hint>
      部分设置需刷新页面后生效
    </template>
  </BaseModal>
</template>