<script setup lang="ts">
// V2Interactivity（/v2 专用）：ItemInteractivity 的逻辑逐行复刻（搜索 Worker /
// 相关索引 / 过滤管线 / Tooltip 控制器 / 弹窗前后导航 / 随机 / 已读标记），
// 仅把三个二级界面的呈现换成 v2 版（V2EntryCard / V2Sheet / V2Tooltip）。
// 交互语义、性能路径（懒加载、增量重绘）与 v1 完全一致。
import { ref, watchEffect, onMounted, onUnmounted, nextTick, markRaw, inject, provide, defineAsyncComponent } from 'vue';
import { useStore } from '@nanostores/vue';
import { searchQuery, searchMode, NEW_MARK_WINDOW_DAYS } from '../../lib/filterStore';
import { detailMode, readItems, showReadMark } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY, RENDER_ITEMS_KEY, DESC_MAP_KEY, RELATED_MAP_KEY, ID_ALIASES_KEY, type RenderItem } from '../../lib/injectionKeys';
import { useSearchWorker } from '../../lib/iceberg/useSearchWorker';
import { useRelatedIndex } from '../../lib/iceberg/useRelatedIndex';
import { useFilterPipeline } from '../../lib/iceberg/useFilterPipeline';
import { useTooltip } from '../../lib/iceberg/useTooltip';
import { getItemEl } from '../../lib/iceberg/itemRegistry';
import { MOBILE_BP, resolvePresenter, toEntryView, type EntryView } from '../../lib/iceberg/entryView';
import { decodeTrail, encodeTrail, useTrail } from '../../lib/iceberg/useTrail';
import { TRAIL_KEY } from '../../lib/iceberg/v2/keys';
import { navIndex, wallMatched } from '../../lib/iceberg/wallState';
import V2Tooltip from './V2Tooltip.vue';
// P1-10: 详情弹窗/抽屉懒加载 —— V2EntryCard / V2Sheet 静态引入会把
// @supabase/supabase-js（~62KB gz）拖进首屏 chunk；改为异步组件 + 空闲预取
const V2EntryCard = defineAsyncComponent(() => import('./V2EntryCard.vue'));
const V2Sheet = defineAsyncComponent(() => import('./V2Sheet.vue'));

// ── 注入（IndexView 提供）──
const renderItemsRef = inject(RENDER_ITEMS_KEY)
const descMap = inject(DESC_MAP_KEY, new Map<string, string>())
const relatedMap = inject(RELATED_MAP_KEY, new Map<string, string[]>())
const filterVisible = inject(FILTER_VISIBLE_KEY, null)
// perf：dim 模式变暗集合（IndexView 提供，模板 :class 消费）
const dimItems = inject(DIM_ITEMS_KEY, null)
// F30：旧 ID → 新 ID 重定向表（标题/层级修订后，分享 hash / 深链 / 收藏旧 id 仍可解析）
const idAliases = inject(ID_ALIASES_KEY, new Map<string, string>())
function resolveId(id: string | null | undefined): string {
  const alias = id ? idAliases.get(id) : undefined;
  return alias || (id || '')
}
const allItemsRaw = renderItemsRef?.value || []
const allItems = allItemsRaw.map(i => markRaw({ ...i, desc: descMap.get(i.id) || '' }))
const itemMap = new Map(allItems.map(i => [i.id, i]));

const { t } = useI18n();

const dm = useStore(detailMode);
const rList = useStore(readItems);
const query = useStore(searchQuery);
const sMode = useStore(searchMode);

const newCutoff = Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 24 * 60 * 60;
const itemModAt = new Map(allItems.map(i => [i.id, i.modifiedAt || 0]));

// ── codeq 拆分：搜索 Worker / 相关词条索引 / 过滤管线 / Tooltip 控制器 ──
const { searchResults, initSearch } = useSearchWorker(query, sMode)
const { pickRelated } = useRelatedIndex(itemMap, relatedMap)
useFilterPipeline(allItems, { filterVisible, dimItems, searchResults, resolveId, newCutoff, itemModAt })
// 可见文档序索引 / 匹配集（wallState 单遍维护）：前后导航 O(1) 查表、随机池 O(1)
const navIdx = navIndex
const { tip, tipRef, onMouseOver, onMouseLeave, showTooltip, hideTooltip, resetCurrentItem } = useTooltip({ t, dm, findItem })

// ── 弹窗 / 抽屉状态 ──
const sheetItem = ref<EntryView | null>(null);
// P1-10: V2Sheet 懒加载 —— 首次打开才挂载（先空挂载 → nextTick 再放数据，保留滑入动画）；此后常驻以保留关闭动画
const sheetMounted = ref(false);
let sheetSeq = 0;
function openSheet(view: EntryView) {
  const seq = ++sheetSeq;
  if (!sheetMounted.value) {
    sheetMounted.value = true;
    sheetItem.value = null;
    nextTick(() => { if (seq === sheetSeq) sheetItem.value = view; });
  } else {
    sheetItem.value = view;
  }
}
const modalItem = ref<EntryView | null>(null);
let hashNavTimer = 0; // F18：hash 导航延时（含内层 tooltip 延时），卸载时取消

function markRead(id: string) {
  const cur = readItems.get();
  // perf：上限 2000（约 16KB），超出丢弃最早记录，防 localStorage 无界增长
  if (!cur.includes(id)) readItems.set([...cur, id].slice(-2000));
  // O(1) 定向标记：管线不再监听 readItems 全量重扫（O(1432) → O(1)），
  // 与 applyItemMarks 的 read 判定同语义（元素 data-id 即当前 id）
  if (!showReadMark.get()) return;
  const el = getItemEl(id) ?? document.querySelector<HTMLElement>(`.iceberg-item[data-id="${CSS.escape(id)}"]`);
  if (el) el.classList.add('read');
}

// P1-5: 可见词条前后导航 id（桌面弹窗用；移动抽屉不再展示左右箭头）
// 2026-08-21: wallState.navIndex 单遍维护的可见文档序位置索引 → O(1) 查表，
// 与分片挂载兼容（不依赖 DOM 补齐状态），弹窗打开零过滤零 DOM 查询
function navIdsFor(raw: RenderItem) {
  const idx = navIdx.value.map.get(raw.id);
  if (idx == null) return { prevId: null, nextId: null };
  const order = navIdx.value.order;
  return {
    prevId: idx > 0 ? order[idx - 1] : null,
    nextId: idx < navIdx.value.length - 1 ? order[idx + 1] : null,
  };
}

// A3：探索轨迹 —— 面包屑读取的栈（经 TRAIL_KEY 下发卡片），URL ?trail= 同步（replaceState，不占历史）
const { trail, push: trailPush, reset: trailReset, surface: trailSurface } = useTrail()
provide(TRAIL_KEY, { trail })
function syncTrailToUrl() {
  const url = new URL(window.location.href)
  const code = encodeTrail(trail.value.map((n) => n.id))
  if (code) url.searchParams.set('trail', code)
  else url.searchParams.delete('trail')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

/** 单一意图：打开词条（A2 收敛原先 4 条路径；A3：fromId 决定轨迹语义——
 * 来源在栈顶则追加（下潜），否则回到该来源再续（回跳），无来源则新起一段） */
function openEntry(raw: RenderItem, fromId?: string | null) {
  if (fromId) {
    const top = trail.value[trail.value.length - 1]
    if (top && top.id === fromId) {
      trailPush({ id: raw.id, title: raw.title })
    } else {
      const i = trail.value.findIndex((n) => n.id === fromId)
      const base = i >= 0 ? trail.value.slice(0, i + 1) : []
      trail.value = [...base, { id: raw.id, title: raw.title }]
    }
  } else {
    trailReset({ id: raw.id, title: raw.title })
  }
  syncTrailToUrl()
  const depth = Math.max(0, trail.value.findIndex((n) => n.id === raw.id))
  const presenter = resolvePresenter({ viewport: window.innerWidth, detailMode: dm.value });
  if (presenter === 'sheet') {
    markRead(raw.id);
    const { explicit, recommended } = pickRelated(raw);
    openSheet(toEntryView(raw, { related: explicit, recommended, depth }));
  } else if (presenter === 'modal') {
    // 标记已读
    markRead(raw.id);

    const { explicit, recommended } = pickRelated(raw);
    // 手机端底部抽屉不再展示左右箭头，无需构建前后导航 id（也省去移动端 1432 节点扫描）
    if (window.innerWidth < MOBILE_BP) {
      openSheet(toEntryView(raw, { related: explicit, recommended, depth }));
      return;
    }
    const nav = navIdsFor(raw);
    modalItem.value = toEntryView(raw, { related: explicit, recommended, prevId: nav.prevId, nextId: nav.nextId, depth });
  } else if (raw.link) {
    window.open(raw.link, '_blank', 'noopener');
  }
}

function onModalNav(item: { id: string; from?: string }) {
  const full = itemMap.get(item.id);
  if (!full) return;
  openEntry(full, item.from);
}

function closeModal() {
  modalItem.value = null
  trailSurface()
  syncTrailToUrl()
}

function closeSheet() {
  sheetItem.value = null
  trailSurface()
  syncTrailToUrl()
}

function findItem(el: HTMLElement) { return itemMap.get(el.dataset.id || ''); }

// Random entry（F15：随机池 = 当前筛选下的匹配集合；无命中时不做随机，
// 避免抽到不符合条件的词条）。2026-08-21: 走 wallState.wallMatched（管线单遍产出，
// hide/dim 皆有效），替代每次点击的 1432 词条 matchesFilter 全量扫描
let randomTooltipTimer = 0
function showRandom() {
  const matched = wallMatched.value;
  const pool = matched && matched.size ? [...matched] : (matched ? [] : allItems.map(i => i.id));
  if (pool.length === 0) return;
  const id = pool[Math.floor(Math.random() * pool.length)];
  const item = itemMap.get(id);
  if (!item) return;
  if (dm.value === 'modal') {
    openEntry(item);
    return;
  }
  // A4：注册表查表优先；未挂载（渐进挂载补齐窗口）逐帧重试，
  // 覆盖 pointerdown 安全网 flush 后的挂载延迟；8 帧后仍无则放弃（F9 静默语义不变）
  const getEl = () => getItemEl(id) ?? document.querySelector<HTMLElement>(`.iceberg-item[data-id="${CSS.escape(id)}"]`);
  const el = getEl();
  const showTip = (target: HTMLElement) => {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // F18：保存 tooltip 延时 id，卸载时取消（避免访问已卸载状态）
    window.clearTimeout(randomTooltipTimer);
    randomTooltipTimer = window.setTimeout(() => showTooltip(target, item), 600);
  };
  if (el) {
    showTip(el);
    return;
  }
  let tries = 8;
  const tick = () => {
    const late = getEl();
    if (late) { showTip(late); return; }
    if (tries-- > 0) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
defineExpose({ showRandom });

// ── 事件委托（点击 / 键盘；悬停交给 useTooltip）──
// P1-6: 键盘可达性 —— 词条墙 Enter/Space 复用点击链路（WCAG 2.1.1）
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!(e.target as HTMLElement).closest('.iceberg-item')) return;
  e.preventDefault();
  onClick(e);
}

function onClick(e: Event) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.iceberg-item');
  if (!el) return;
  const item = findItem(el);
  if (!item) return;
  openEntry(item);
}

watchEffect(() => {
  document.documentElement.setAttribute('data-detail', dm.value);
});

const openModalHandler = (e: Event) => {
  const id = resolveId((e as CustomEvent).detail); // F30：旧 hash/深链 id → 新 id
  const item = itemMap.get(id);
  if (item) openEntry(item);
};

// P1-10: 空闲预取详情弹窗/抽屉 chunk（首次点击零等待；SDK 已移出首屏关键路径）
let preloadChunkTask = 0
if (typeof requestIdleCallback === 'function') {
  preloadChunkTask = requestIdleCallback(() => { import('./V2EntryCard.vue'); import('./V2Sheet.vue') }, { timeout: 4000 })
} else {
  preloadChunkTask = window.setTimeout(() => { import('./V2EntryCard.vue'); import('./V2Sheet.vue') }, 1500)
}

onMounted(() => {
  document.documentElement.setAttribute('data-detail', dm.value);
  document.addEventListener('open-item-modal', openModalHandler);
  // 发送数据到搜索 Worker（仅发送搜索需要的字段，减少结构化克隆开销）
  initSearch(allItems.map(it => ({ id: it.id, title: it.title, desc: it.desc, category: it.category, tags: it.tags })))
  const c = document.getElementById('items-container');
  if (c) {
    c.addEventListener('mouseover', onMouseOver);
    c.addEventListener('mouseleave', onMouseLeave);
    c.addEventListener('click', onClick);
    c.addEventListener('keydown', onKeyDown);
  }
  // A3：?trail= 恢复（分享/刷新）—— 栈重建后打开末项（经 openEntry 落深度），
  // 恢复成功则跳过 ?item=/hash 旧链（trail 已含全部信息）
  const restoredIds = decodeTrail(new URLSearchParams(window.location.search).get('trail'))
    .map((id) => itemMap.get(resolveId(id)))
    .filter((it): it is RenderItem => !!it)
  if (restoredIds.length > 0) {
    trail.value = restoredIds.map((r) => ({ id: r.id, title: r.title }))
    const last = restoredIds[restoredIds.length - 1]
    const from = restoredIds.length > 1 ? restoredIds[restoredIds.length - 2].id : undefined
    hashNavTimer = window.setTimeout(() => openEntry(last, from), 600)
  }
  // Hash navigation — 弹窗模式直接打开 Modal，tooltip 模式滚动定位
  // F18：延时保存 id，卸载时取消
  const hash = window.location.hash.slice(1);
  if (!restoredIds.length && hash && /^[a-f0-9]{8}$/.test(hash)) {
    hashNavTimer = window.setTimeout(() => {
      const item = itemMap.get(resolveId(hash)); // F30：旧 hash 重定向
      // F9：非法深链不再静默——洗掉坏 hash，避免刷新反复撞墙
      if (!item) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      if (dm.value === 'modal' || window.innerWidth < MOBILE_BP) {
        // P1-4: 移动端 tooltip 模式也直接走弹窗/抽屉（合成 mouseover 被宽度判定拦截）
        openEntry(item);
      } else {
        const el = document.querySelector<HTMLElement>(`.iceberg-item[data-id="${resolveId(hash)}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('tooltip-active');
          hashNavTimer = window.setTimeout(() => showTooltip(el, item), 400);
        }
      }
    }, 600);
  }
});

onUnmounted(() => {
  // F18：取消延迟任务（随机 tooltip / hash 导航 / chunk 预取），避免卸载后回调访问已卸载状态
  window.clearTimeout(randomTooltipTimer)
  window.clearTimeout(hashNavTimer)
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(preloadChunkTask)
  else window.clearTimeout(preloadChunkTask)
  const c = document.getElementById('items-container');
  if (c) {
    c.removeEventListener('mouseover', onMouseOver);
    c.removeEventListener('mouseleave', onMouseLeave);
    c.removeEventListener('click', onClick);
    c.removeEventListener('keydown', onKeyDown);
  }
  document.removeEventListener('open-item-modal', openModalHandler);
  // 搜索 Worker 终止 / 相关索引调度 / 滚动监听 / hover 定时器：由各 composable 的 onScopeDispose 清理
});
</script>

<template>
  <V2Tooltip ref="tipRef" v-bind="tip" @enter="resetCurrentItem" @leave="hideTooltip" />
  <V2EntryCard v-if="modalItem" :item="modalItem" @close="closeModal" @navigate="onModalNav" />
  <V2Sheet v-if="sheetMounted" :item="sheetItem" @close="closeSheet" @navigate="onModalNav" />
</template>
