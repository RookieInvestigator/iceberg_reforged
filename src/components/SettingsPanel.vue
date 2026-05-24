<script setup>
import { useStore } from '@nanostores/vue';
import { fontSize, floatMode, detailMode, filterMode, showRandomBtn, immersiveMode, showLinkEmoji, showDescEmoji } from '../lib/settingsStore';
import { lang as langAtom } from '../lib/i18nStore';
import { useI18n } from '../lib/useI18n';

defineEmits(['close']);

const { t } = useI18n();

const fs = useStore(fontSize);
const fm = useStore(floatMode);
const dm = useStore(detailMode);
const flm = useStore(filterMode);
const sr = useStore(showRandomBtn);
const im = useStore(immersiveMode);
const linkEmoji = useStore(showLinkEmoji);
const descEmoji = useStore(showDescEmoji);
const lang = useStore(langAtom);

const fsOpts = ['xs', 'sm', 'md', 'lg', 'xl'];
const floatOpts = ['none', 'static'];
const detailOpts = ['tooltip', 'modal'];
const filterOpts = ['dim', 'hide'];
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4" @click.self="$emit('close')">
        <div class="bg-[#111] border border-[#333] rounded-2xl w-[340px] max-h-[90vh] overflow-y-auto shadow-2xl p-6" @click.stop>
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-bold text-white">{{ t('settings') }}</h2>
          <button @click="$emit('close')" class="text-white/30 hover:text-white/60 text-xl leading-none">&times;</button>
        </div>

        <!-- Display -->
        <div class="mb-5">
          <div class="text-[0.6rem] font-bold text-white/30 uppercase tracking-[0.15em] mb-3">{{ t('display') }}</div>
          <div class="flex gap-1.5 mb-4">
            <button v-for="o in fsOpts" :key="o" @click="fontSize.set(o)"
              :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', fs === o ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">
              {{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}
            </button>
          </div>
          <div class="flex gap-1.5">
            <button v-for="o in floatOpts" :key="o" @click="floatMode.set(o)"
              :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', fm === o ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">
              {{ o === 'none' ? t('floatNone') : t('floatStatic') }}
            </button>
          </div>
        </div>

        <!-- Interaction -->
        <div class="mb-5">
          <div class="text-[0.6rem] font-bold text-white/30 uppercase tracking-[0.15em] mb-3">{{ t('interaction') }}</div>
          <div class="flex gap-1.5 mb-4">
            <button @click="detailMode.set('tooltip')"
              :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', dm === 'tooltip' ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">
              {{ t('detailTooltip') }}
            </button>
            <button class="flex-1 py-2 px-2 rounded-lg text-xs font-medium text-white/40 opacity-40 pointer-events-none">
              {{ t('detailModal') }}
            </button>
          </div>
          <div class="flex gap-1.5">
            <button v-for="o in filterOpts" :key="o" @click="filterMode.set(o)"
              :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', flm === o ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">
              {{ o === 'dim' ? t('filterDim') : t('filterHide') }}
            </button>
          </div>
        </div>

        <!-- Experimental -->
        <div>
          <div class="text-[0.6rem] font-bold text-white/30 uppercase tracking-[0.15em] mb-3">{{ t('experimental') }}</div>
          <div class="flex gap-1.5 mb-4">
            <button @click="showRandomBtn.set(!sr)"
              :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', sr ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">
              {{ t('randomBtn') }}
            </button>
            <button class="flex-1 py-2 px-2 rounded-lg text-xs font-medium text-white/40 opacity-40 pointer-events-none">
              {{ t('immersiveMode') }}
            </button>
          </div>

          <div class="text-[0.6rem] font-bold text-white/30 uppercase tracking-[0.15em] mt-4 mb-3">{{ t('itemMarkers') }}</div>
          <div class="flex gap-1.5 opacity-40 pointer-events-none">
            <button class="flex-1 py-2 px-2 rounded-lg text-xs font-medium text-white/40">
              <span style="color:#f0a040">▲</span> {{ t('linkMarker') }}
            </button>
            <button class="flex-1 py-2 px-2 rounded-lg text-xs font-medium text-white/40">
              <span style="color:#40c8a0">●</span> {{ t('descLabel') }}
            </button>
          </div>
          <p class="text-[0.6rem] text-white/15 mt-1.5">暂未实装</p>

          <div class="text-[0.6rem] font-bold text-white/30 uppercase tracking-[0.15em] mt-4 mb-3">{{ t('lang') }}</div>
          <div class="flex gap-1.5">
            <button @click="langAtom.set('zh')" :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', lang === 'zh' ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">中文</button>
            <button @click="langAtom.set('en')" :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', lang === 'en' ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">EN</button>
            <button @click="langAtom.set('ja')" :class="['flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors', lang === 'ja' ? 'bg-white text-black' : 'text-white/40 hover:bg-white/10']">日本語</button>
          </div>
        </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
