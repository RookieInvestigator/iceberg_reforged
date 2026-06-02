<script setup>
import { useStore } from '@nanostores/vue';
import { fontSize, floatMode, filterMode, showRandomBtn, dynamicBg, sortMode, detailMode } from '../lib/settingsStore';
import { lang as langAtom } from '../lib/i18nStore';
import { useI18n } from '../lib/useI18n';

defineEmits(['close']);

const { t } = useI18n();

const fs = useStore(fontSize);
const fm = useStore(floatMode);
const flm = useStore(filterMode);
const dm = useStore(detailMode);
const sr = useStore(showRandomBtn);
const dbg = useStore(dynamicBg);
const lang = useStore(langAtom);

const srt = useStore(sortMode);
const fsOpts = ['xs', 'sm', 'md', 'lg', 'xl'];
const floatOpts = ['none', 'static'];
const filterOpts = ['dim', 'hide'];
const sortOpts = ['default', 'title-asc', 'title-desc', 'category'];

function toggleBgDOM(on) {
  const el = document.getElementById('iceberg-bg');
  if (!el) return;
  if (on) { el.classList.remove('static'); } else { el.classList.add('static'); }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-panel no-scrollbar" style="max-width:440px" @click.stop>

          <!-- Header -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-base font-bold text-white tracking-wide">{{ t('settings') }}</h2>
            <button @click="$emit('close')" class="text-white/25 hover:text-white/60 text-lg leading-none transition-colors">&times;</button>
          </div>

          <!-- Font Size -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('fontSize') }}</div>
          <div class="flex gap-1 mb-4">
            <button v-for="o in fsOpts" :key="o" @click="fontSize.set(o)"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', fs === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}
            </button>
          </div>

          <!-- Sort -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('sortMode') }}</div>
          <div class="flex gap-1 mb-4">
            <button v-for="o in sortOpts" :key="o" @click="sortMode.set(o)"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', srt === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ t('sort' + o.charAt(0).toUpperCase() + o.slice(1).replace(/-./g, x => x[1].toUpperCase())) }}
            </button>
          </div>

          <!-- Layout options -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('floatMode') }}</div>
          <div class="flex gap-1 mb-4">
            <button v-for="o in floatOpts" :key="o" @click="floatMode.set(o)"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', fm === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ o === 'none' ? t('floatNone') : t('floatStatic') }}
            </button>
          </div>

          <!-- Filter mode -->
          <!-- Detail mode -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('detailMode') }}</div>
          <div class="flex gap-1 mb-4">
            <button @click="detailMode.set('tooltip')"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'tooltip' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ t('detailTooltip') }}
            </button>
            <button @click="detailMode.set('modal')"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dm === 'modal' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ t('detailModal') }}
            </button>
          </div>

          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('filterMode') }}</div>
          <div class="flex gap-1 mb-4">
            <button v-for="o in filterOpts" :key="o" @click="filterMode.set(o)"
              :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', flm === o ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">
              {{ o === 'dim' ? t('filterDim') : t('filterHide') }}
            </button>
          </div>

          <!-- Toggle switches -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('experimental') }}</div>
          <div class="flex flex-col gap-1.5 mb-4">
            <button @click="showRandomBtn.set(!sr)"
              :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', sr ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5']">
              {{ t('randomBtn') }}
              <span :class="sr ? 'text-white' : 'text-white/20'">{{ sr ? '●' : '○' }}</span>
            </button>
            <button @click="dynamicBg.set(!dbg); toggleBgDOM(!dbg)"
              :class="['w-full py-1.5 px-3 rounded-md text-xs font-medium transition-colors text-left flex items-center justify-between', dbg ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5']">
              {{ t('bgDynamic') }}
              <span :class="dbg ? 'text-amber-400' : 'text-white/20'">{{ dbg ? '●' : '○' }}</span>
            </button>
            <p v-if="dbg" class="text-[0.6rem] text-amber-500/50 leading-relaxed px-1">{{ t('bgDynamicWarn') }}</p>
          </div>

          <!-- Language -->
          <div class="mb-1.5 text-[0.55rem] font-bold text-white/25 uppercase tracking-[0.2em]">{{ t('lang') }}</div>
          <div class="flex gap-1">
            <button @click="langAtom.set('zh')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'zh' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">中文</button>
            <button @click="langAtom.set('en')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'en' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">EN</button>
            <button @click="langAtom.set('ja')" :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', lang === 'ja' ? 'bg-white text-black' : 'text-white/35 hover:text-white/70 hover:bg-white/5']">日本語</button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
