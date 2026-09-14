<script setup lang="ts">
// ExportModal：导出弹窗（PNG / SVG / YAML / HTML）。
// PNG/SVG 走同一布局 + 三档宽度（1600/1920/2560，宽=矮=dpr 余量）；
// YAML/HTML 与宽度无关。字体一致性：绘制前等 document.fonts.ready。
// 重型模块（wallExport / wallSvg / qrcode）全动态 import，不进首屏包。
import { ref, inject, computed } from 'vue';
import { useStore } from '@nanostores/vue';
import BaseModal from './BaseModal.vue';
import { useI18n } from '../../lib/useI18n';
import { fontSize, floatMode } from '../../lib/settingsStore';
import {
  RENDER_ITEMS_KEY, FILTER_VISIBLE_KEY, TIER_ORDER_KEY,
  CATEGORY_COLORS_KEY, TAG_MAP_KEY,
} from '../../lib/injectionKeys';
import type { RenderItem } from '../../lib/injectionKeys';
import { V2_EXPORT_METRICS } from '../../lib/export/exportMetrics';
import type { LayoutBuildOptions } from '../../lib/export/wallExport';

const props = defineProps({
  coverTitle: { type: String, default: '' },
  coverMeta: { type: String, default: '' },
  coverIntro: { type: String, default: '' },
});
defineEmits(['close']);

const { t } = useI18n();
const renderItemsRef = inject(RENDER_ITEMS_KEY, null);
const filterVisibleRef = inject(FILTER_VISIBLE_KEY, null);
const tierOrderRef = inject(TIER_ORDER_KEY, null);
const categoryColorsRef = inject(CATEGORY_COLORS_KEY, null);
const tagMapRef = inject(TAG_MAP_KEY, null);

type Format = 'png' | 'svg' | 'yaml' | 'html';
type SliceMode = 'full' | 'tier' | 'even';
const format = ref<Format>('png');
const widthPx = ref(1920);
const dpr = ref(2);
const sliceMode = ref<SliceMode>('full');
const sliceCount = ref(3);
const working = ref(false);
const WIDTHS = [1280, 1600, 1920, 2560];
const DPRS = [1, 1.5, 2];
const COUNTS = [2, 3, 4, 5, 6];

/** 当前筛选态可见条数（YAML/HTML 按此子集导出） */
const exportCountText = computed(() => {
  const items = (renderItemsRef?.value || []) as RenderItem[];
  const vis = filterVisibleRef?.value ?? null;
  const n = vis ? items.filter((it) => vis.has(it.id)).length : items.length;
  return `${n} ${t('entries')}`;
});

const FONT_PX_FALLBACK: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 };

function cssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

/** 双 painter 共用的输入（布局只算一次/一种导出） */
function collectInput(): LayoutBuildOptions | null {
  const items = (renderItemsRef?.value || []) as RenderItem[];
  if (!items.length) return null;
  const probe = document.querySelector('.iceberg-item');
  const cs = probe ? getComputedStyle(probe) : null;
  const fs = useStore(fontSize).value;
  const fontPx = cs ? parseFloat(cs.fontSize) || 18.4 : (FONT_PX_FALLBACK[fs] || 16) * V2_EXPORT_METRICS.chipFontScale;
  const fontFamily = cs?.fontFamily || '"Noto Sans SC", system-ui, sans-serif';
  const catColors = (categoryColorsRef || {}) as Record<string, string>;
  const tagMap = (tagMapRef || {}) as Record<string, string>;
  return {
    items: items.map((it) => ({
      id: it.id, tier: it.tier, title: it.title,
      categoryColor: it.categoryColor || '#FFFFFF', emojis: it.emojis || [],
    })),
    tierOrder: tierOrderRef || [...new Set(items.map((it) => it.tier))],
    titleColorOf: (it) => it.categoryColor,
    cover: {
      kicker: 'Chinese Oddities Iceberg · Reforged',
      title: props.coverTitle || t('siteTitle'),
      meta: props.coverMeta || `${items.length} ${t('entries')}`,
      intro: props.coverIntro,
    },
    legend: {
      categoriesLabel: t('categories'),
      tagsLabel: t('tags'),
      categories: Object.entries(catColors).map(([name, color]) => ({ name, color })),
      tags: Object.entries(tagMap).map(([emoji, name]) => ({ emoji, name: String(name) })),
    },
    footer: location.href,
    footerCopy: `${t('copyrightLine').replace('{year}', String(new Date().getFullYear()))} · CC BY-NC-SA 4.0`,
    style: {
      fontPx, fontFamily,
      padX: V2_EXPORT_METRICS.padX, padY: V2_EXPORT_METRICS.padY,
      gapX: V2_EXPORT_METRICS.gapX, gapY: V2_EXPORT_METRICS.gapY,
      contentPadX: V2_EXPORT_METRICS.contentPadX,
      tierPadY: V2_EXPORT_METRICS.tierPadY,
      headerPx: V2_EXPORT_METRICS.headerPx,
      headerMarginBottom: V2_EXPORT_METRICS.headerMarginBottom,
        bg: cssVar('--color-surface', '#050505'),
      headerColor: cssVar('--white-40', 'rgba(255,255,255,0.4)'),
      titleColor: cssVar('--white-90', 'rgba(255,255,255,0.9)'),
      introColor: cssVar('--white-40', 'rgba(255,255,255,0.4)'),
      tagColor: cssVar('--color-text-primary', 'rgba(255,255,255,0.92)'),
      shadowColor: cssVar('--shadow-color', 'rgba(0,0,0,0.6)'),
      dividerColor: cssVar('--white-10', 'rgba(255,255,255,0.1)'),
      legendColor: cssVar('--white-85', 'rgba(255,255,255,0.85)'),
      tagPillBg: cssVar('--white-06', 'rgba(255,255,255,0.06)'),
      emojiRatio: V2_EXPORT_METRICS.emojiRatio,
      float: useStore(floatMode).value !== 'none',
    },
    state: { visible: filterVisibleRef?.value ?? null },
    widthPx: widthPx.value,
  };
}

function stampName(ext: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `iceberg-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.${ext}`;
}

/** 字体门：自托管 Noto 未就绪就度量/绘制会回退，导出前等一手 */
async function fontsReady(): Promise<void> {
  try { await document.fonts.ready; } catch { /* 旧浏览器跳过 */ }
}

async function run(fn: () => Promise<void>): Promise<void> {
  if (working.value) return;
  working.value = true;
  try {
    await fontsReady();
    await fn();
  } catch {
    alert(t('exportFail'));
  } finally {
    working.value = false;
  }
}

async function doExportPng(): Promise<void> {
  const input = collectInput();
  if (!input) return;
  await run(async () => {
    const { exportWallPng } = await import('../../lib/export/wallExport');
    await exportWallPng({
      ...input, filename: stampName('png'),
      dpr: dpr.value, slice: sliceMode.value, sliceCount: sliceCount.value,
    });
  });
}

async function doExportSvg(): Promise<void> {
  const input = collectInput();
  if (!input || !input.footer) return;
  await run(async () => {
    const [{ buildWallLayout }, { renderWallSvg, downloadTextFile }, { default: QRCode }] = await Promise.all([
      import('../../lib/export/wallExport'),
      import('../../lib/export/wallSvg'),
      import('qrcode'),
    ]);
    const layout = buildWallLayout(input);
    const dataUrl = await QRCode.toDataURL(input.footer as string, { width: 288, margin: 1 });
    downloadTextFile(stampName('svg'), 'image/svg+xml', renderWallSvg(layout, input.style, dataUrl));
  });
}

async function doExportYaml(): Promise<void> {
  const items = (renderItemsRef?.value || []) as RenderItem[];
  const vis = filterVisibleRef?.value ?? null;
  const list = vis ? items.filter((it) => vis.has(it.id)) : items;
  if (!list.length) return;
  await run(async () => {
    const [{ dumpEntriesYaml, toYamlEntries }, { downloadTextFile }] = await Promise.all([
      import('../../lib/export/exportYaml'),
      import('../../lib/export/wallSvg'),
    ]);
    downloadTextFile(stampName('yaml'), 'text/yaml', dumpEntriesYaml(toYamlEntries(list)));
  });
}

async function doExportHtml(): Promise<void> {
  const input = collectInput();
  if (!input) return;
  // HTML 无画布上限，用窄幅单独布局（1200），手机直读友好
  input.widthPx = 1200;
  await run(async () => {
    const [{ buildWallLayout }, { renderWallHtml }, { downloadTextFile }, { default: QRCode }] = await Promise.all([
      import('../../lib/export/wallExport'),
      import('../../lib/export/wallHtml'),
      import('../../lib/export/wallSvg'),
      import('qrcode'),
    ]);
    const layout = buildWallLayout(input);
    const dataUrl = input.footer
      ? await QRCode.toDataURL(input.footer, { width: 288, margin: 1 })
      : null;
    const items = (renderItemsRef?.value || []) as RenderItem[];
    downloadTextFile(
      stampName('html'), 'text/html',
      renderWallHtml(layout, input.style, {
        pageTitle: input.cover?.title || t('siteTitle'),
        pageUrl: input.footer || null,
        qrDataUrl: dataUrl,
        labels: {
          search: t('search'), reset: t('clearAll'), categories: t('categories'),
          tags: t('tags'), noResult: t('noResults'),
        },
        descs: Object.fromEntries(items.map((it) => [it.id, it.desc || ''])),
        links: Object.fromEntries(items.map((it) => [it.id, it.link || ''])),
        cats: Object.fromEntries(items.map((it) => [it.id, it.category || ''])),
        // 标签筛选用 emoji（图例 data-leg-tag 存的就是 emoji，名字对不上永远是 0 命中）
        tags: Object.fromEntries(items.map((it) => [it.id, it.emojis || []])),
      }),
    );
  });
}

function go(): void {
  if (format.value === 'png') void doExportPng();
  else if (format.value === 'svg') void doExportSvg();
  else if (format.value === 'yaml') void doExportYaml();
  else void doExportHtml();
}
</script>

<template>
  <BaseModal :title="t('exportTitle')" size="md" @close="$emit('close')">
    <div class="space-y-4">
      <div>
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('exportFormat') }}</div>
        <div class="flex gap-1">
          <button v-for="f in (['png', 'svg', 'yaml', 'html'] as const)" :key="f" @click="format = f"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors uppercase', format === f ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ f }}
          </button>
        </div>
      </div>

      <div v-if="format === 'png' || format === 'svg'">
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('exportWidth') }}</div>
        <div class="flex gap-1">
          <button v-for="w in WIDTHS" :key="w" @click="widthPx = w"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', widthPx === w ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ w }}px
          </button>
        </div>
      </div>

      <div v-if="format === 'png'">
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('exportDpr') }}</div>
        <div class="flex gap-1">
          <button v-for="d in DPRS" :key="d" @click="dpr = d"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', dpr === d ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ d }}x
          </button>
        </div>
      </div>

      <div v-if="format === 'png'">
        <div class="mb-1.5 text-[length:var(--font-micro)] font-bold text-white/50 uppercase tracking-[0.2em]">{{ t('exportSlice') }}</div>
        <div class="flex gap-1">
          <button @click="sliceMode = 'full'"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', sliceMode === 'full' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('exportSliceFull') }}</button>
          <button @click="sliceMode = 'tier'"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', sliceMode === 'tier' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('exportSliceTier') }}</button>
          <button @click="sliceMode = 'even'"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', sliceMode === 'even' ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ t('exportSliceEven') }}</button>
        </div>
        <div v-if="sliceMode === 'even'" class="flex gap-1 mt-1.5">
          <button v-for="n in COUNTS" :key="n" @click="sliceCount = n"
            :class="['flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', sliceCount === n ? 'bg-white text-black' : 'text-white/60 hover:text-white/90 hover:bg-white/5']">
            {{ n }}{{ t('exportSliceCount') }}</button>
        </div>
      </div>

      <div class="pt-8">
        <button @click="go" :disabled="working"
          class="w-full py-2 rounded-md text-xs font-medium bg-white text-black hover:bg-white/85 transition-colors disabled:opacity-50">
          {{ working ? t('exporting') : t('exportTitle') }} · {{ exportCountText }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
