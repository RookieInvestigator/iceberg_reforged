<script setup lang="ts">
import { ref, watch, watchEffect, onMounted, onUnmounted, nextTick, markRaw, inject, defineAsyncComponent } from 'vue';
import { useStore } from '@nanostores/vue';
import { searchQuery, searchMode, NEW_MARK_WINDOW_DAYS } from '../../lib/filterStore';
import { floatMode, detailMode, readItems } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import { FILTER_VISIBLE_KEY, DIM_ITEMS_KEY, RENDER_ITEMS_KEY, DESC_MAP_KEY, RELATED_MAP_KEY, ID_ALIASES_KEY, WALL_ORDER_KEY, type RenderItem } from '../../lib/injectionKeys';
import { useSearchWorker } from '../../lib/iceberg/useSearchWorker';
import { useRelatedIndex } from '../../lib/iceberg/useRelatedIndex';
import { useFilterPipeline } from '../../lib/iceberg/useFilterPipeline';
import { useTooltip } from '../../lib/iceberg/useTooltip';
import ItemTooltip from './ItemTooltip.vue';
// P1-10: 详情弹窗/抽屉懒加载 —— EntryDetailCardNext / MobileSheet 静态引入会把
// @supabase/supabase-js（~62KB gz）拖进首屏 chunk；改为异步组件 + 空闲预取
const EntryDetailCardNext = defineAsyncComponent(() => import('./EntryDetailCardNext.vue'));
const MobileSheet = defineAsyncComponent(() => import('./MobileSheet.vue'));

// ── 注入（IndexView 提供）──
const renderItemsRef = inject(RENDER_ITEMS_KEY)
const descMap = inject(DESC_MAP_KEY, new Map<string, string>())
const relatedMap = inject(RELATED_MAP_KEY, new Map<string, string[]>())
const filterVisible = inject(FILTER_VISIBLE_KEY, null)
// perf：dim 模式变暗集合（IndexView 提供，模板 :class 消费）
const dimItems = inject(DIM_ITEMS_KEY, null)
// F30：旧 ID → 新 ID 重定向表（标题/层级修订后，分享 hash / 深链 / 收藏旧 id 仍可解析）
const idAliases = inject(ID_ALIASES_KEY, new Map<string, string>())
// 词条墙 DOM 文档序（IndexView computed）：弹窗前后导航的数据源，零 DOM 扫描
const wallOrderRef = inject(WALL_ORDER_KEY, null)
function resolveId(id: string | null | undefined): string {
  const alias = id ? idAliases.get(id) : undefined;
  return alias || (id || '')
}
const allItemsRaw = renderItemsRef?.value || []
const allItems = allItemsRaw.map(i => markRaw({ ...i, desc: descMap.get(i.id) || '' }))
const itemMap = new Map(allItems.map(i => [i.id, i]));

const { t } = useI18n();

const fm = useStore(floatMode);
const dm = useStore(detailMode);
const rList = useStore(readItems);
const query = useStore(searchQuery);
const sMode = useStore(searchMode);

const newCutoff = Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 24 * 60 * 60;
const itemModAt = new Map(allItems.map(i => [i.id, i.modifiedAt || 0]));

// ── codeq 拆分：搜索 Worker / 相关词条索引 / 过滤管线 / Tooltip 控制器 ──
const { searchResults, initSearch } = useSearchWorker(query, sMode)
const { pickRelated } = useRelatedIndex(itemMap, relatedMap)
const { filterSnapshot, matchesFilter } = useFilterPipeline(allItems, { filterVisible, dimItems, searchResults, resolveId, newCutoff, itemModAt })
const { tip, tipRef, onMouseOver, onMouseLeave, showTooltip, hideTooltip, resetCurrentItem } = useTooltip({ t, dm, findItem })

// ── 弹窗 / 抽屉状态 ──
const sheetItem = ref<any>(null);
// P1-10: MobileSheet 懒加载 —— 首次打开才挂载（先空挂载 → nextTick 再放数据，保留滑入动画）；此后常驻以保留关闭动画
const sheetMounted = ref(false);
let sheetSeq = 0;
function openSheet(payload: Record<string, any>) {
  const seq = ++sheetSeq;
  if (!sheetMounted.value) {
    sheetMounted.value = true;
    sheetItem.value = null;
    nextTick(() => { if (seq === sheetSeq) sheetItem.value = payload; });
  } else {
    sheetItem.value = payload;
  }
}
const modalItem = ref<any>(null);
let hashNavTimer = 0; // F18：hash 导航延时（含内层 tooltip 延时），卸载时取消

function markRead(id: string) {
  const cur = readItems.get();
  // perf：上限 2000（约 16KB），超出丢弃最早记录，防 localStorage 无界增长
  if (!cur.includes(id)) readItems.set([...cur, id].slice(-2000));
}

// P1-5: 可见词条前后导航 id（桌面弹窗用；移动抽屉不再展示左右箭头）
// P-2026-08-21: 数据化文档序（WALL_ORDER_KEY）替代 1400 节点 querySelectorAll 扫描——
// 与分片挂载兼容（不依赖 DOM 是否已补齐），弹窗导航零 DOM 查询；注入缺失时回退 DOM 扫描
function navIdsFor(raw: RenderItem) {
  const vis = filterVisible?.value;
  const order = wallOrderRef?.value;
  if (order) {
    const list = vis ? order.filter(id => vis.has(id)) : order;
    const idx = list.indexOf(raw.id);
    return {
      prevId: idx > 0 ? list[idx - 1] : null,
      nextId: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null,
    };
  }
  const allIds = [...document.querySelectorAll<HTMLElement>('.iceberg-item')].map(el => el.dataset.id).filter((id): id is string => Boolean(id))
    .filter(id => !vis || vis.has(id));
  const idx = allIds.indexOf(raw.id);
  return {
    prevId: idx > 0 ? allIds[idx - 1] : null,
    nextId: idx < allIds.length - 1 ? allIds[idx + 1] : null,
  };
}

function setModalItem(raw: RenderItem) {
  // 标记已读
  markRead(raw.id);

  const { explicit, recommended } = pickRelated(raw);
  // 手机端底部抽屉不再展示左右箭头，无需构建前后导航 id（也省去移动端 1400 节点扫描）
  if (window.innerWidth < 1024) {
    openSheet({ id: raw.id, title: raw.title, tier: raw.tier, desc: raw.desc, category: raw.category, color: raw.categoryColor, tags: raw.tags || [], link: raw.link, related: explicit, recommended });
    return;
  }
  const nav = navIdsFor(raw);
  modalItem.value = { id: raw.id, title: raw.title, tier: raw.tier, desc: raw.desc, category: raw.category, categoryColor: raw.categoryColor, tags: raw.tags || [], link: raw.link, related: explicit, recommended, ...nav };
}

function onModalNav(item: { id: string }) {
  const full = itemMap.get(item.id);
  if (!full) return;
  if (window.innerWidth < 1024) {
    markRead(full.id);
    const { explicit, recommended } = pickRelated(full);
    openSheet({ id: full.id, title: full.title, tier: full.tier, desc: full.desc, category: full.category, color: full.categoryColor, tags: full.tags || [], link: full.link, related: explicit, recommended });
  } else {
    setModalItem(full);
  }
}

function findItem(el: HTMLElement) { return itemMap.get(el.dataset.id || ''); }

// 错落排版（原 floatMode）：词条按 id 哈希得到固定随机偏移，打破整齐排列（仅视觉，无动画）
watch(fm, (mode) => {
  const c = document.getElementById('items-container');
  if (!c) return;
  c.querySelectorAll<HTMLElement>('.iceberg-item').forEach((el) => {
    if (mode === 'static') {
      const id = el.dataset.id || '';
      let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
      const tx = (((h % 300) / 100) - 1.5).toFixed(2);
      const ty = ((((h * 37) % 600) / 100) - 3).toFixed(2);
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    } else {
      el.style.transform = '';
    }
  });
}, { immediate: true });

// Random entry（F15：随机池 = 当前筛选下的可见集合；无命中时不做随机，避免抽到不符合条件的词条）
let randomTooltipTimer = 0
function showRandom() {
  const pool = allItems.filter(item => matchesFilter(item, filterSnapshot()));
  if (pool.length === 0) return;
  const item = pool[Math.floor(Math.random() * pool.length)];
  if (dm.value === 'modal') {
    setModalItem(item);
    return;
  }
  const el = document.querySelector<HTMLElement>(`.iceberg-item[data-id="${item.id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // F18：保存 tooltip 延时 id，卸载时取消（避免访问已卸载状态）
  window.clearTimeout(randomTooltipTimer);
  randomTooltipTimer = window.setTimeout(() => showTooltip(el, item), 600);
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
  // 手机端统一用底部抽屉
  if (window.innerWidth < 1024) {
    markRead(item.id);
    const { explicit, recommended } = pickRelated(item);
    openSheet({ id: item.id, title: item.title, tier: item.tier, desc: item.desc, category: item.category, color: item.categoryColor, tags: item.tags || [], link: item.link, related: explicit, recommended });
    return;
  }
  if (dm.value === 'modal') {
    setModalItem(item);
    return;
  }
  if (item.link) {
    window.open(item.link, '_blank', 'noopener');
  }
}

watchEffect(() => {
  document.documentElement.setAttribute('data-detail', dm.value);
});

const openModalHandler = (e: Event) => {
  const id = resolveId((e as CustomEvent).detail); // F30：旧 hash/深链 id → 新 id
  const item = itemMap.get(id);
  if (item) setModalItem(item);
};

// P1-10: 空闲预取详情弹窗/抽屉 chunk（首次点击零等待；SDK 已移出首屏关键路径）
let preloadChunkTask = 0
if (typeof requestIdleCallback === 'function') {
  preloadChunkTask = requestIdleCallback(() => { import('./EntryDetailCardNext.vue'); import('./MobileSheet.vue') }, { timeout: 4000 })
} else {
  preloadChunkTask = window.setTimeout(() => { import('./EntryDetailCardNext.vue'); import('./MobileSheet.vue') }, 1500)
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
  // Hash navigation — 弹窗模式直接打开 Modal，tooltip 模式滚动定位
  // F18：延时保存 id，卸载时取消
  const hash = window.location.hash.slice(1);
  if (hash && /^[a-f0-9]{8}$/.test(hash)) {
    hashNavTimer = window.setTimeout(() => {
      const item = itemMap.get(resolveId(hash)); // F30：旧 hash 重定向
      if (!item) return;
      if (dm.value === 'modal' || window.innerWidth < 1024) {
        // P1-4: 移动端 tooltip 模式也直接走弹窗/抽屉（合成 mouseover 被宽度判定拦截）
        setModalItem(item);
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
  <ItemTooltip ref="tipRef" v-bind="tip" @enter="resetCurrentItem" @leave="hideTooltip" />
  <EntryDetailCardNext v-if="modalItem" :item="modalItem" @close="modalItem = null" @navigate="onModalNav" />
  <MobileSheet v-if="sheetMounted" :item="sheetItem" @close="sheetItem = null" @navigate="onModalNav" />
</template>
