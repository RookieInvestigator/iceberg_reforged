<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStore } from '@nanostores/vue'
import BaseModal from '../modals/BaseModal.vue'
import { useI18n } from '../../lib/useI18n'
import { lang as langAtom } from '../../lib/i18nStore'
import {
  fontSize, floatMode, filterMode, showRandomBtn, bgMode, sortMode, detailMode,
  showReadMark, showNewMark, showTrail, immersiveMode, scatterMode, v2DetailSurface,
  quoteStyle, searchEngine, searchMode, searchFuzzyMode,
  colorblindMode, showFavMark, showEntryTags, showScrollProgress, reducedMotion,
  applySimpleMode, applyStandardMode, resetV3Settings,
  flushPersistedWrites, cancelPersistedWrites,
  v3Density, v3Align, favCount, readCount,
} from '../../lib/v3/store'

const emit = defineEmits<{ close: []; toast: [msg: string] }>()
const { t } = useI18n()

const fs = useStore(fontSize)
const fm = useStore(floatMode)
const flm = useStore(filterMode)
const dm = useStore(detailMode)
const sr = useStore(showRandomBtn)
const srd = useStore(showReadMark)
const snw = useStore(showNewMark)
const strl = useStore(showTrail)
const dbg = useStore(bgMode)
const lang = useStore(langAtom)
const srt = useStore(sortMode)
const sct = useStore(scatterMode)
const imv = useStore(immersiveMode)
const v2ds = useStore(v2DetailSurface)
const qs = useStore(quoteStyle)
const se = useStore(searchEngine)
const sm = useStore(searchMode)
const sfm = useStore(searchFuzzyMode)
const dens = useStore(v3Density)
const al = useStore(v3Align)
const cb = useStore(colorblindMode)
const favMark = useStore(showFavMark)
const entryTags = useStore(showEntryTags)
const progBar = useStore(showScrollProgress)
const redMotion = useStore(reducedMotion)
const favN = useStore(favCount)
const readN = useStore(readCount)

const fsOpts = ['xs', 'sm', 'md', 'lg', 'xl'] as const
const filterOpts = ['dim', 'hide'] as const
const sortOpts = ['default', 'title-asc', 'title-desc', 'category'] as const

const isMobile = ref(false)
const showImport = ref(false)
const importText = ref('')

onMounted(() => {
  isMobile.value = window.innerWidth < 1024
  if (dbg.value === 'dynamic') bgMode.set('liquid')
})

function onResetDefaults() {
  resetV3Settings()
  emit('toast', t('settingsResetToast'))
}

function exportData() {
  flushPersistedWrites()
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('iceberg-')) data[k] = localStorage.getItem(k) ?? ''
  }
  navigator.clipboard.writeText(JSON.stringify(data))
    .then(() => emit('toast', t('dataExport')))
    .catch(() => emit('toast', t('copyFailed')))
}

function doImport() {
  try {
    const data = JSON.parse(importText.value)
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('iceberg-') && typeof v === 'string') localStorage.setItem(k, v)
    }
    location.reload()
  } catch {
    emit('toast', t('jsonInvalid'))
  }
}

function clearData() {
  if (!confirm(t('clearConfirm'))) return
  cancelPersistedWrites()
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k) keys.push(k)
  }
  keys.filter((k) => k.startsWith('iceberg-')).forEach((k) => localStorage.removeItem(k))
  location.reload()
}

const wallToggles = computed(() => [
  { key: 'float', label: t('floatMode'), on: fm.value !== 'none', toggle: () => floatMode.set(fm.value === 'none' ? 'static' : 'none') },
  { key: 'scatter', label: t('scatterMode'), on: sct.value, toggle: () => scatterMode.set(!sct.value) },
  { key: 'new', label: t('highlightNew'), on: snw.value, toggle: () => showNewMark.set(!snw.value) },
  { key: 'read', label: t('dimRead'), on: srd.value, toggle: () => showReadMark.set(!srd.value) },
  { key: 'favMark', label: t('showFavMark'), on: favMark.value, toggle: () => showFavMark.set(!favMark.value) },
  { key: 'entryTags', label: t('showEntryTags'), on: entryTags.value, toggle: () => showEntryTags.set(!entryTags.value) },
])

const interactionToggles = computed(() => [
  { key: 'random', label: t('randomBtn'), on: sr.value, toggle: () => showRandomBtn.set(!sr.value) },
  { key: 'immersive', label: t('immersiveMode'), on: imv.value, toggle: () => immersiveMode.set(!imv.value) },
  { key: 'progress', label: t('showScrollProgress'), on: progBar.value, toggle: () => showScrollProgress.set(!progBar.value) },
])
</script>

<template>
  <BaseModal :title="t('settings')" size="lg" :showFooter="true" @close="emit('close')">
    <div class="v3-set-body">
      <div class="v3-presets">
        <button type="button" class="v3-preset-btn" @click="applySimpleMode()">{{ t('simpleMode') }}</button>
        <button type="button" class="v3-preset-btn" @click="applyStandardMode()">{{ t('standardMode') }}</button>
        <button type="button" class="v3-preset-btn is-muted" @click="onResetDefaults">{{ t('settingsResetDefaults') }}</button>
      </div>

      <!-- 1. 词条墙与排版 -->
      <section class="v3-set-group">
        <h3 class="v3-set-gh">{{ t('setGroupWall') }}</h3>

        <div class="v3-set-sec">
          <div class="v3-set-h">{{ t('fontSize') }}</div>
          <div class="v3-opt-row">
            <button
              v-for="o in fsOpts"
              :key="o"
              type="button"
              class="opt-btn"
              :class="{ 'is-on': fs === o }"
              @click="fontSize.set(o)"
            >{{ t('font' + o.charAt(0).toUpperCase() + o.slice(1)) }}</button>
          </div>
        </div>

        <div class="v3-set-grid">
          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('wallDensity') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': dens === 'airy' }" @click="v3Density.set('airy')">{{ t('densityAiry') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': dens === 'compact' }" @click="v3Density.set('compact')">{{ t('densityCompact') }}</button>
            </div>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('wallAlign') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': al === 'center' }" @click="v3Align.set('center')">{{ t('alignCenter') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': al === 'left' }" @click="v3Align.set('left')">{{ t('alignLeft') }}</button>
            </div>
          </div>
        </div>

        <div class="v3-set-sec">
          <div class="v3-set-h">{{ t('sortMode') }}</div>
          <div class="v3-opt-row">
            <button
              v-for="o in sortOpts"
              :key="o"
              type="button"
              class="opt-btn"
              :class="{ 'is-on': srt === o }"
              @click="sortMode.set(o)"
            >{{ t('sort' + o.charAt(0).toUpperCase() + o.slice(1).replace(/-./g, (x) => x[1].toUpperCase())) }}</button>
          </div>
        </div>

        <div class="v3-set-grid">
          <button
            v-for="tg in wallToggles"
            :key="tg.key"
            type="button"
            class="opt-toggle"
            :class="{ 'is-on': tg.on }"
            @click="tg.toggle()"
          >
            <span>{{ tg.label }}</span>
            <span class="opt-toggle-mark">{{ tg.on ? '●' : '○' }}</span>
          </button>
        </div>
      </section>

      <!-- 2. 交互与检索 -->
      <section class="v3-set-group">
        <h3 class="v3-set-gh">{{ t('setGroupInteraction') }}</h3>

        <div class="v3-set-grid">
          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('detailMode') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': dm === 'tooltip' }" @click="detailMode.set('tooltip')">{{ t('detailTooltip') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': dm === 'modal' }" @click="detailMode.set('modal')">{{ t('detailModal') }}</button>
            </div>
            <p v-if="isMobile" class="v3-set-hint">{{ t('mobileOnlyHint') }}</p>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('filterMode') }}</div>
            <div class="v3-opt-row">
              <button
                v-for="o in filterOpts"
                :key="o"
                type="button"
                class="opt-btn"
                :class="{ 'is-on': flm === o }"
                @click="filterMode.set(o)"
              >{{ o === 'dim' ? t('filterDim') : t('filterHide') }}</button>
            </div>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('searchScopeLabel') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': sm === 'full' }" @click="searchMode.set('full')">{{ t('searchFullText') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': sm === 'title' }" @click="searchMode.set('title')">{{ t('searchTitleOnly') }}</button>
            </div>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('searchMatchLabel') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': sfm === 'fuzzy' }" @click="searchFuzzyMode.set('fuzzy')">{{ t('searchFuzzy') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': sfm === 'exact' }" @click="searchFuzzyMode.set('exact')">{{ t('searchExact') }}</button>
            </div>
          </div>
        </div>

        <div class="v3-set-sec">
          <div class="v3-set-h">{{ t('searchEngine') }}</div>
          <div class="v3-opt-row">
            <button type="button" class="opt-btn" :class="{ 'is-on': se === 'baidu' }" @click="searchEngine.set('baidu')">百度</button>
            <button type="button" class="opt-btn" :class="{ 'is-on': se === 'google' }" @click="searchEngine.set('google')">Google</button>
            <button type="button" class="opt-btn" :class="{ 'is-on': se === 'bing' }" @click="searchEngine.set('bing')">Bing</button>
          </div>
        </div>

        <div class="v3-set-grid">
          <button
            v-for="tg in interactionToggles"
            :key="tg.key"
            type="button"
            class="opt-toggle"
            :class="{ 'is-on': tg.on }"
            @click="tg.toggle()"
          >
            <span>{{ tg.label }}</span>
            <span class="opt-toggle-mark">{{ tg.on ? '●' : '○' }}</span>
          </button>
        </div>
      </section>

      <!-- 3. 阅读与无障碍 -->
      <section class="v3-set-group">
        <h3 class="v3-set-gh">{{ t('setGroupReading') }}</h3>

        <div class="v3-set-grid">
          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('v2DetailSurface') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': v2ds === 'dark' }" @click="v2DetailSurface.set('dark')">{{ t('v2SurfaceDark') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': v2ds === 'light' }" @click="v2DetailSurface.set('light')">{{ t('v2SurfaceLight') }}</button>
            </div>
            <p class="v3-set-hint">{{ t('detailSurfaceHint') }}</p>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('quoteStyle') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': qs === 'corner' }" @click="quoteStyle.set('corner')">{{ t('quoteCorner') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': qs === 'curly' }" @click="quoteStyle.set('curly')">{{ t('quoteCurly') }}</button>
            </div>
          </div>
        </div>

        <div class="v3-set-sec">
          <button
            type="button"
            class="opt-toggle"
            :class="{ 'is-on': cb }"
            :aria-pressed="cb"
            @click="colorblindMode.set(!cb)"
          >
            <span>{{ t('colorblindMode') }}</span>
            <span class="opt-toggle-mark">{{ cb ? '●' : '○' }}</span>
          </button>
          <p class="v3-set-hint">{{ t('colorblindHint') }}</p>
        </div>

        <div class="v3-set-grid">
          <button
            type="button"
            class="opt-toggle"
            :class="{ 'is-on': redMotion }"
            :aria-pressed="redMotion"
            @click="reducedMotion.set(!redMotion)"
          >
            <span>{{ t('reducedMotion') }}</span>
            <span class="opt-toggle-mark">{{ redMotion ? '●' : '○' }}</span>
          </button>
          <button
            type="button"
            class="opt-toggle"
            :class="{ 'is-on': strl }"
            :aria-pressed="strl"
            @click="showTrail.set(!strl)"
          >
            <span>{{ t('showTrail') }}</span>
            <span class="opt-toggle-mark">{{ strl ? '●' : '○' }}</span>
          </button>
        </div>
      </section>

      <!-- 4. 背景与语言 -->
      <section class="v3-set-group">
        <h3 class="v3-set-gh">{{ t('setGroupAppearance') }}</h3>

        <div class="v3-set-grid">
          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('lang') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': lang === 'zh' }" @click="langAtom.set('zh')">中文</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': lang === 'en' }" @click="langAtom.set('en')">EN</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': lang === 'ja' }" @click="langAtom.set('ja')">日本語</button>
            </div>
          </div>

          <div class="v3-set-sec">
            <div class="v3-set-h">{{ t('bgMode') }}</div>
            <div class="v3-opt-row">
              <button type="button" class="opt-btn" :class="{ 'is-on': dbg === 'black' }" @click="bgMode.set('black')">{{ t('bgBlack') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': dbg === 'static' }" @click="bgMode.set('static')">{{ t('bgStatic') }}</button>
              <button type="button" class="opt-btn" :class="{ 'is-on': dbg === 'liquid' }" @click="bgMode.set('liquid')">{{ t('bgLiquid') }}</button>
            </div>
          </div>
        </div>
        <p v-if="dbg === 'liquid'" class="v3-set-hint">{{ t('bgLiquidHint') }}</p>
        <p v-if="dbg === 'static' || dbg === 'liquid'" class="v3-set-hint is-warn">{{ t('bgHeavyHint') }}</p>
      </section>

      <!-- 5. 数据 -->
      <section class="v3-set-group">
        <div class="v3-set-data-head">
          <h3 class="v3-set-gh">{{ t('data') }}</h3>
          <p class="v3-set-data">{{ t('statFavorites') }} <b>{{ favN }}</b> · {{ t('statRead') }} <b>{{ readN }}</b></p>
        </div>
        <div class="flex gap-1.5">
          <button type="button" @click="exportData" class="flex-1 py-2 rounded-md text-xs font-medium text-white-60 hover:text-white-90 hover:bg-white-05 transition-colors cursor-pointer bg-white-03 border border-white-08">{{ t('dataExport') }}</button>
          <button type="button" @click="showImport = !showImport" class="flex-1 py-2 rounded-md text-xs font-medium text-white-60 hover:text-white-90 hover:bg-white-05 transition-colors cursor-pointer bg-white-03 border border-white-08">{{ t('dataImport') }}</button>
          <button type="button" @click="clearData" class="flex-1 py-2 rounded-md text-xs font-medium text-danger-soft hover:text-danger hover:bg-danger-wash transition-colors cursor-pointer bg-white-03 border border-white-08">{{ t('dataClear') }}</button>
        </div>
        <div v-if="showImport" class="mt-1">
          <textarea v-model="importText" :placeholder="t('pasteJsonHint')" class="w-full h-16 text-xs max-sm:text-base rounded-md p-2 bg-white-05 border border-white-10 text-white-70 resize-none"></textarea>
          <button type="button" @click="doImport" class="mt-1.5 w-full py-2 rounded-md text-xs font-medium bg-white-10 text-white hover:bg-white-20 transition-colors cursor-pointer border-none">{{ t('confirmImport') }}</button>
        </div>
      </section>
    </div>

    <template #footer-hint>
      {{ t('settingsRefreshHint') }}
    </template>
  </BaseModal>
</template>

<style scoped>
.v3-set-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.v3-presets {
  display: flex;
  gap: 0.5rem;
}
.v3-preset-btn {
  flex: 1;
  padding: 0.5rem 0.625rem;
  border-radius: 8px;
  border: 1px solid var(--white-10);
  background: var(--white-03);
  color: var(--white-75);
  font-family: inherit;
  font-size: var(--font-xs);
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}
.v3-preset-btn:hover {
  color: var(--white-95);
  background: var(--white-06);
  border-color: var(--white-20);
}
.v3-preset-btn.is-muted {
  color: var(--white-45);
}
.v3-set-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--white-08);
  border-radius: 12px;
  background: var(--white-02);
}
.v3-set-gh {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: var(--font-tiny);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--white-65);
}
.v3-set-gh::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-accent);
  flex: none;
}
.v3-set-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem 0.875rem;
  align-items: start;
}
.v3-set-sec {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}
.v3-set-h {
  font-size: var(--font-micro);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--white-45);
}
.v3-opt-row {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--white-04);
}
.v3-set-hint {
  margin: 0.125rem 0 0;
  font-size: var(--font-micro);
  color: var(--white-40);
  line-height: 1.5;
}
.v3-set-hint.is-warn {
  color: var(--color-danger-soft);
  opacity: 0.88;
}
.v3-set-data-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.v3-set-data {
  margin: 0;
  font-size: var(--font-xs);
  color: var(--white-55);
}
.v3-set-data b {
  color: var(--white-90);
  font-variant-numeric: tabular-nums;
}
.v3-set-group :deep(.opt-toggle.is-on) { color: var(--white-90); }
.v3-set-group :deep(.opt-toggle) { font-family: inherit; }

@media (max-width: 640px) {
  .v3-set-grid { grid-template-columns: 1fr; }
  .v3-set-group { padding: 0.75rem 0.875rem; }
  .v3-set-body button { min-height: 42px; }
}
</style>
