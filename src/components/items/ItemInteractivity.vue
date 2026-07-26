<script setup>
import { ref, reactive, watch, watchEffect, onMounted, onUnmounted, nextTick, markRaw, inject } from 'vue';
import { useStore } from '@nanostores/vue';
import { activeCategories, activeTags, searchQuery, tagFilterMode, searchMode, hiddenCategories, hiddenTags, specialFilter, favFilter } from '../../lib/filterStore';
import { favorites, readItems, showReadMark, showNewMark } from '../../lib/settingsStore';
import { floatMode, filterMode, detailMode } from '../../lib/settingsStore';
import { useI18n } from '../../lib/useI18n';
import ItemTooltip from './ItemTooltip.vue';
import ItemModal from './ItemModal.vue';
import MobileSheet from './MobileSheet.vue';

const renderItemsRef = inject('renderItems')
const descMap = inject('descMap', new Map())
const relatedMap = inject('relatedMap', new Map())
const filterVisible = inject('filterVisible', null)
const allItemsRaw = renderItemsRef?.value || []
const allItems = allItemsRaw.map(i => markRaw({ ...i, desc: descMap.get(i.id) || '' }))
const itemMap = new Map(allItems.map(i => [i.id, i]));

const { t } = useI18n();

// Fuse.js Web Worker — 搜索不阻塞主线程
const searchWorker = new Worker(new URL('../../lib/search.worker.ts', import.meta.url), { type: 'module' })
const searchResults = ref(null) // { ids: string[] } | null
searchWorker.onmessage = (e) => {
  if (e.data.type === 'results') {
    searchResults.value = e.data.ids ? e.data.ids : null
  }
}

const activeCats = useStore(activeCategories);
const activeT = useStore(activeTags);
const query = useStore(searchQuery);


const tip = reactive({ show: false, anchor: null, desc: '', noDesc: false, category: '', color: '', tags: '' });
const tipRef = ref(null);
const sheetItem = ref(null);
const modalItem = ref(null);
const hoverTimer = ref(0);
let currentItemEl = null;
let activeItemEl = null;

const fm = useStore(floatMode);
const fltMode = useStore(filterMode);
const dm = useStore(detailMode);
const tagMode = useStore(tagFilterMode);
const sMode = useStore(searchMode);
const hiddenCats = useStore(hiddenCategories);
const hiddenT = useStore(hiddenTags);
const spl = useStore(specialFilter);
const favF = useStore(favFilter);
const fList = useStore(favorites);
const rList = useStore(readItems);
const sNew = useStore(showNewMark);
const sRead = useStore(showReadMark);
  // 搜索走 Worker（异步，不阻塞主线程）
  watch([query, sMode], ([q, mode]) => {
    searchWorker.postMessage({ type: "search", query: q, mode })
  })

const latestModified = Math.max(...allItems.map(i => i.modifiedAt || 0));
const itemModAt = new Map(allItems.map(i => [i.id, i.modifiedAt || 0]));

// Related-items map: pre-indexed, O(n × avgBucketSize)
let _relMap = null;
function getRelMap() {
  if (_relMap) return _relMap;

  // 预建索引
  const catIdx = new Map();   // category → [itemId]
  const tagIdx = new Map();   // tag → [itemId]
  const bgIdx = new Map();    // bigram → [itemId]
  for (const item of allItems) {
    if (!catIdx.has(item.category)) catIdx.set(item.category, []);
    catIdx.get(item.category).push(item.id);
    for (const t of (item.tags || [])) {
      if (!tagIdx.has(t)) tagIdx.set(t, []);
      tagIdx.get(t).push(item.id);
    }
    for (let i = 0; i < item.title.length - 1; i++) {
      const bg = item.title.slice(i, i + 2);
      if (!bgIdx.has(bg)) bgIdx.set(bg, []);
      bgIdx.get(bg).push(item.id);
    }
  }

  _relMap = new Map();
  for (const item of allItems) {
    const scores = new Map();   // id → score
    const bgN = new Map();      // id → bigram count

    for (const id of (catIdx.get(item.category) || [])) { if (id !== item.id) scores.set(id, 3); }
    for (const t of (item.tags || [])) {
      for (const id of (tagIdx.get(t) || [])) { if (id !== item.id) scores.set(id, (scores.get(id) || 0) + 2); }
    }
    for (let i = 0; i < item.title.length - 1; i++) {
      for (const id of (bgIdx.get(item.title.slice(i, i + 2)) || [])) {
        if (id !== item.id) bgN.set(id, (bgN.get(id) || 0) + 1);
      }
    }
    for (const [id, n] of bgN) { scores.set(id, (scores.get(id) || 0) + Math.min(n, 3)); }

    const sorted = [...scores.entries()]
      .filter(([, s]) => s >= 2)
      .sort((a, b) => b[1] - a[1]);
    _relMap.set(item.id, sorted.slice(0, 10).map(([id]) => id));
  }
  return _relMap;
}
function pickRelated(item) {
  // 1. 副表手动精选优先，否则回退自动解析
  const explicitIds = relatedMap.get(item.id) || (item.related?.length ? item.related : [])
  const explicit = explicitIds
    .map(id => itemMap.get(id)).filter(Boolean)
    .filter(r => r.id !== item.id);
  const usedIds = new Set(explicit.map(r => r.id));

  // 2. 相似度随机选 2 个推荐
  const pool = (getRelMap().get(item.id) || []).filter(id => !usedIds.has(id));
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const recommended = arr.slice(0, 2).map(id => itemMap.get(id)).filter(Boolean);

  return { explicit, recommended };
}

function setModalItem(raw) {
  // 标记已读
  const cur = readItems.get();
  if (!cur.includes(raw.id)) { readItems.set([...cur, raw.id]); }

  const { explicit, recommended } = pickRelated(raw);
  // 手机端走底部抽屉
  if (window.innerWidth < 1024) {
    sheetItem.value = { id: raw.id, title: raw.title, desc: raw.desc, category: raw.category, color: raw.categoryColor, tags: (raw.tags || []).join(' | '), link: raw.link, related: explicit, recommended };
    return;
  }
  const allIds = [...document.querySelectorAll('.iceberg-item')].map(el => el.dataset.id).filter(Boolean);
  const idx = allIds.indexOf(raw.id);
  const prevId = idx > 0 ? allIds[idx - 1] : null;
  const nextId = idx < allIds.length - 1 ? allIds[idx + 1] : null;
  modalItem.value = { id: raw.id, title: raw.title, desc: raw.desc, category: raw.category, categoryColor: raw.categoryColor, tags: raw.tags || [], link: raw.link, related: explicit, recommended, prevId, nextId };
}

function onModalNav(item) {
  const full = itemMap.get(item.id);
  if (!full) return;
  if (window.innerWidth < 1024) {
    const { explicit, recommended } = pickRelated(full);
    sheetItem.value = { id: full.id, title: full.title, desc: full.desc, category: full.category, color: full.categoryColor, tags: (full.tags || []).join(' | '), link: full.link, related: explicit, recommended };
  } else {
    setModalItem(full);
  }
}


function findItem(el) { return itemMap.get(el.dataset.id); }

// Float mode
watch(fm, (mode) => {
  const c = document.getElementById('items-container');
  if (!c) return;
  c.querySelectorAll('.iceberg-item').forEach((el) => {
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

// Random entry
function showRandom() {
  const cats = activeCats.value, tags = activeT.value, results = searchResults.value;
  const hasFilter = cats.length > 0 || tags.length > 0 || query.value;
  let pool = allItems;

  if (hasFilter) {
    pool = allItems.filter(item => {
      if (cats.length > 0 && !cats.includes(item.category)) return false;
      if (tags.length > 0 && !tags.some(t => item.emojis.includes(t))) return false;
      if (results && !results.includes(item.id)) return false;
      return true;
    });
    if (pool.length === 0) pool = allItems;
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
  if (dm.value === 'modal') {
    setModalItem(item);
    return;
  }
  const el = document.querySelector(`.iceberg-item[data-id="${item.id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => showTooltip(el, item), 600);
}
defineExpose({ showRandom });

function setItemClasses(el, align, below) {
  el.classList.remove('tooltip-left', 'tooltip-right', 'tooltip-below');
  if (align === 'left') el.classList.add('tooltip-left');
  else if (align === 'right') el.classList.add('tooltip-right');
  if (below) el.classList.add('tooltip-below');
}

function showTooltip(el, item) {
  if (window.innerWidth < 1024) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const cx = rect.left + rect.width / 2;

  let align = 'center';
  if (cx < vw * 0.25) align = 'left';
  else if (cx > vw * 0.75) align = 'right';

  if (activeItemEl && activeItemEl !== el) { activeItemEl.classList.remove('tooltip-active'); if (activeItemEl.dataset.wasRead) activeItemEl.classList.add('read'); }
  activeItemEl = el;
  if (el.classList.contains('read')) { el.dataset.wasRead = '1'; el.classList.remove('read'); }
  el.classList.add('tooltip-active');
  setItemClasses(el, align, false);

  const tp = tipRef.value?.rootEl;
  if (tp) tp.style.maxHeight = '';

  Object.assign(tip, {
    show: true, anchor: el,
    desc: item.desc || t('noDesc'),
    noDesc: !item.desc,
    category: item.category,
    color: item.categoryColor,
    tags: (item.tags || []).join(' | '),
  });

  nextTick().then(() => {
    const tp = tipRef.value?.rootEl;
    if (!tp) return;
    const h = tp.getBoundingClientRect().height;
    const spaceAbove = rect.top - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    let below = false;

    if (spaceAbove >= h) {
      below = false;
    } else if (spaceBelow >= h) {
      below = true;
    } else {
      below = spaceBelow > spaceAbove;
      const maxH = Math.max(below ? spaceBelow : spaceAbove, 80);
      tp.style.maxHeight = maxH + 'px';
    }
    setItemClasses(el, align, below);
  });
}

function hideTooltip() {
  clearTimeout(hoverTimer.value);
  currentItemEl = null;
  if (activeItemEl) {
    activeItemEl.classList.remove('tooltip-active', 'tooltip-left', 'tooltip-right', 'tooltip-below');
    if (activeItemEl.dataset.wasRead) { activeItemEl.classList.add('read'); delete activeItemEl.dataset.wasRead; }
    activeItemEl = null;
  }
  tip.show = false;
  tip.anchor = null;
}

// Event delegation
let scrollBusy = false;
let scrollTimer = 0;
window.addEventListener('scroll', () => {
  scrollBusy = true;
  hideTooltip();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { scrollBusy = false; }, 300);
}, { passive: true });

function onMouseOver(e) {
  if (scrollBusy || dm.value === 'modal' || window.innerWidth < 1024) return;
  const el = e.target.closest('.iceberg-item');
  if (!el) { hideTooltip(); return; }
  if (el === currentItemEl) return;
  currentItemEl = el;
  clearTimeout(hoverTimer.value);
  const item = findItem(el);
  if (!item) { hideTooltip(); return; }
  hoverTimer.value = setTimeout(() => showTooltip(el, item), 200);
}

function onMouseLeave(e) {
  if (dm.value === 'modal') return;
  clearTimeout(hoverTimer.value);
  currentItemEl = null;
  const to = e.relatedTarget;
  const tp = tipRef.value?.rootEl;
  if (to && tp && (to === tp || tp.contains(to))) return;
  if (!to || !to.closest('#items-container')) hideTooltip();
}

function onClick(e) {
  const el = e.target.closest('.iceberg-item');
  if (!el) return;
  const item = findItem(el);
  if (!item) return;
  // 手机端统一用底部抽屉
  if (window.innerWidth < 1024) {
    const { explicit, recommended } = pickRelated(item);
    sheetItem.value = { id: item.id, title: item.title, desc: item.desc, category: item.category, color: item.categoryColor, tags: (item.tags || []).join(' | '), link: item.link, related: explicit, recommended };
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

// Filter
watchEffect(() => {
  if (typeof document === 'undefined') return;
  const cats = activeCats.value, tags = activeT.value, results = searchResults.value;
  void fltMode.value, void tagMode.value, void sMode.value, void hiddenCats.value, void hiddenT.value, void spl.value, void favF.value, void fList.value, void rList.value, void sNew.value, void sRead.value;
  const tierEmptyMsg = t('tierEmpty');
  const noResultsMsg = t('noResults');
  requestAnimationFrame(() => {
    const c = document.getElementById('items-container');
    if (!c) return;
    // 纯 JS 数组匹配（替代 DOM querySelectorAll 循环）
    const matched = new Set();
    for (const item of allItems) {
      let match = true;
      const sMode = spl.value;
      if (sMode === 'hasLink') { if (!item.link) match = false; }
      else if (sMode === 'hasDesc') { if (!item.desc) match = false; }
      else if (sMode === 'isNew') { if ((item.modifiedAt || 0) < latestModified) match = false; }
      else if (sMode === 'noLinkNoDesc') { if (item.link || item.desc) match = false; }
      if (match && favF.value && !fList.value.includes(item.id)) match = false;
      const hCats = hiddenCats.value, hTags = hiddenT.value;
      if (hCats.length > 0 && hCats.includes(item.category)) match = false;
      if (match && hTags.length > 0) {
        if (hTags.some(t => (item.emojis || []).includes(t))) match = false;
      }
      if (match && cats.length > 0) match = cats.includes(item.category);
      if (match && tags.length > 0) {
        match = tagMode.value === 'AND'
          ? tags.every(t => (item.emojis || []).includes(t))
          : tags.some(t => (item.emojis || []).includes(t));
      }
      if (match && results) match = results.includes(item.id);
      if (match) matched.add(item.id);
    }
    // 声明式更新：一次性设置 Set，由 v-show 批量处理 DOM
    if (filterVisible) {
      if (fltMode.value === 'hide') {
        filterVisible.value = matched;
      } else {
        filterVisible.value = null;
        c.querySelectorAll('.iceberg-item').forEach(el => {
          el.classList.toggle('dimmed', !matched.has(el.dataset.id));
        });
      }
    } else {
      c.querySelectorAll('.iceberg-item').forEach(el => {
        const id = el.dataset.id;
        if (fltMode.value === 'hide') {
          el.style.display = matched.has(id) ? '' : 'none';
        } else {
          el.style.display = '';
          el.classList.toggle('dimmed', !matched.has(id));
        }
      });
    }
    // 标记样式（所有模式统一应用）
    const rs = rList.value; const sn = sNew.value; const sr = sRead.value;
    c.querySelectorAll('.iceberg-item').forEach(el => {
      const id = el.dataset.id;
      el.classList.toggle('recently-updated', sn && id ? ((itemModAt.get(id) || 0) === latestModified) : false);
      el.classList.toggle('read', sr && id ? rs.includes(id) : false);
    });
    // 统计可见 + tier-empty（基于 tier 数据，无需 DOM 查询）
    let total = matched.size;
    const tierVis = new Map();
    for (const item of allItems) {
      if (!matched.has(item.id) || !item.tier) continue;
      tierVis.set(item.tier, (tierVis.get(item.tier) || 0) + 1);
    }
    c.querySelectorAll('.iceberg-tier').forEach(tier => {
      const tn = tier.dataset.tier;
      const v = tierVis.get(tn) || 0;
      let msg = tier.querySelector('.tier-empty');
      if (v === 0) {
        if (!msg) { msg = document.createElement('div'); msg.className = 'tier-empty text-center text-white/15 text-sm py-8 italic'; msg.textContent = tierEmptyMsg; tier.appendChild(msg); }
      } else if (msg) { msg.remove(); }
    });
    let globalMsg = document.getElementById('items-empty');
    if (total === 0) {
      if (!globalMsg) { globalMsg = document.createElement('div'); globalMsg.id = 'items-empty'; globalMsg.className = 'text-center text-white/20 text-lg py-40 italic'; globalMsg.textContent = noResultsMsg; c.appendChild(globalMsg); }
      c.querySelectorAll('.iceberg-tier').forEach(t => { t.style.display = 'none'; });
    } else {
      if (globalMsg) globalMsg.remove();
      c.querySelectorAll('.iceberg-tier').forEach(t => { t.style.display = ''; });
    }
    const bg = document.getElementById('iceberg-bg');
    if (bg) {
      const h = Math.max(document.documentElement.scrollHeight, bg.getBoundingClientRect().height);
      bg.style.setProperty('--bg-hf', Math.max(h / 1000, 1));
    }
  });
});

watchEffect(() => {
  document.documentElement.setAttribute('data-detail', dm.value);
});

const openModalHandler = (e) => {
  const id = e.detail;
  const item = itemMap.get(id);
  if (item) setModalItem(item);
};

onMounted(() => {
  document.documentElement.setAttribute('data-detail', dm.value);
  document.addEventListener('open-item-modal', openModalHandler);
  // 发送数据到搜索 Worker（仅发送搜索需要的字段，减少结构化克隆开销）
  const searchItems = allItems.map(it => ({ id: it.id, title: it.title, desc: it.desc }))
  searchWorker.postMessage({ type: 'init', items: searchItems })
  const c = document.getElementById('items-container');
  if (c) {
    c.addEventListener('mouseover', onMouseOver);
    c.addEventListener('mouseleave', onMouseLeave);
    c.addEventListener('click', onClick);
  }
  // Hash navigation — 弹窗模式直接打开 Modal，tooltip 模式滚动定位
  const hash = window.location.hash.slice(1);
  if (hash && /^[a-f0-9]{8}$/.test(hash)) {
    setTimeout(() => {
      const item = itemMap.get(hash);
      if (!item) return;
      if (dm.value === 'modal') {
        setModalItem(item);
      } else {
        const el = document.querySelector(`.iceberg-item[data-id="${hash}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.classList.add('tooltip-active');
          setTimeout(() => showTooltip(el, item), 400);
        }
      }
    }, 600);
  }
});

onUnmounted(() => {
  searchWorker.terminate()
  clearTimeout(hoverTimer.value);
  const c = document.getElementById('items-container');
  if (c) {
    c.removeEventListener('mouseover', onMouseOver);
    c.removeEventListener('mouseleave', onMouseLeave);
    c.removeEventListener('click', onClick);
  }
  document.removeEventListener('open-item-modal', openModalHandler);
});
</script>

<template>
  <ItemTooltip ref="tipRef" v-bind="tip" @enter="currentItemEl = null" @leave="hideTooltip" />
  <ItemModal :item="modalItem" @close="modalItem = null" @navigate="onModalNav" />
  <MobileSheet :item="sheetItem" @close="sheetItem = null" @navigate="onModalNav" />
</template>
