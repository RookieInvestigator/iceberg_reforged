<script setup>
import { ref, reactive, computed, watch, watchEffect, onMounted, onUnmounted, nextTick } from 'vue';
import { useStore } from '@nanostores/vue';
import { activeCategories, activeTags, searchQuery, tagFilterMode, searchMode, hiddenCategories, hiddenTags, specialFilter } from '../lib/filterStore';
import { floatMode, filterMode } from '../lib/settingsStore';
import { useI18n } from '../lib/useI18n';
import ItemTooltip from './ItemTooltip.vue';

import Fuse from 'fuse.js';

const props = defineProps({ allItems: String });
const allItems = JSON.parse(props.allItems);
const itemMap = new Map(allItems.map(i => [i.id, i]));

const { t } = useI18n();

const activeCats = useStore(activeCategories);
const activeT = useStore(activeTags);
const query = useStore(searchQuery);

// Lazy Fuse index — only build when user first searches
let fuseFull = null;
let fuseTitle = null;
function getFuse(mode) {
  if (mode === '标题') {
    if (!fuseTitle) fuseTitle = new Fuse(allItems, { keys: ['title'], threshold: 0.3, minMatchCharLength: 1, distance: 100 });
    return fuseTitle;
  }
  if (!fuseFull) fuseFull = new Fuse(allItems, { keys: ['title', 'desc', 'category', 'tags'], threshold: 0.3, minMatchCharLength: 1, distance: 100 });
  return fuseFull;
}

const searchResults = computed(() => {
  if (!query.value) return null;
  return getFuse(sMode.value).search(query.value).map(r => r.item);
});

const tip = reactive({ show: false, anchor: null, desc: '', noDesc: false, category: '', color: '', tags: '' });
const tipRef = ref(null);
const hoverTimer = ref(0);
let currentItemEl = null;
let activeItemEl = null;

const fm = useStore(floatMode);
const fltMode = useStore(filterMode);
const tagMode = useStore(tagFilterMode);
const sMode = useStore(searchMode);
const hiddenCats = useStore(hiddenCategories);
const hiddenT = useStore(hiddenTags);
const spl = useStore(specialFilter);

const maxModified = Math.max(...allItems.map(i => i.modifiedAt || 0));
const newThreshold = maxModified - 30 * 86400;


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
      if (results && !results.some(r => r.id === item.id)) return false;
      return true;
    });
    if (pool.length === 0) pool = allItems;
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
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
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const cx = rect.left + rect.width / 2;

  let align = 'center';
  if (cx < vw * 0.25) align = 'left';
  else if (cx > vw * 0.75) align = 'right';

  if (activeItemEl && activeItemEl !== el) activeItemEl.classList.remove('tooltip-active');
  activeItemEl = el;
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
    activeItemEl = null;
  }
  tip.show = false;
  tip.anchor = null;
}

// Event delegation
function onMouseOver(e) {
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
  if (item?.link) window.open(item.link, '_blank', 'noopener');
}

// Filter
watchEffect(() => {
  if (typeof document === 'undefined') return;
  const cats = activeCats.value, tags = activeT.value, results = searchResults.value;
  void fltMode.value, void tagMode.value, void sMode.value, void hiddenCats.value, void hiddenT.value, void spl.value;
  const tierEmptyMsg = t('tierEmpty');
  const noResultsMsg = t('noResults');
  requestAnimationFrame(() => {
    const c = document.getElementById('items-container');
    if (!c) return;
    const items = c.querySelectorAll('.iceberg-item');
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      let match = true;
      const sMode = spl.value;
      if (sMode === 'hasLink') { const item = itemMap.get(el.dataset.id); if (!item?.link) match = false; }
      else if (sMode === 'hasDesc') { const item = itemMap.get(el.dataset.id); if (!item?.desc) match = false; }
      else if (sMode === 'isNew') { const item = itemMap.get(el.dataset.id); if (!item || (item.modifiedAt || 0) < newThreshold) match = false; }
      else if (sMode === 'noLinkNoDesc') { const item = itemMap.get(el.dataset.id); if (!item || item.link || item.desc) match = false; }
      const hCats = hiddenCats.value, hTags = hiddenT.value;
      if (hCats.length > 0 && hCats.includes(el.dataset.category)) { match = false; }
      if (match && hTags.length > 0) {
        const eTags2 = (el.dataset.tagEmojis || '').split(',');
        if (hTags.some(t => eTags2.includes(t))) match = false;
      }
      if (match && cats.length > 0) match = cats.includes(el.dataset.category);
      if (match && tags.length > 0) {
        const eTags = (el.dataset.tagEmojis || '').split(',');
        match = tagMode.value === 'AND'
          ? tags.every(t => eTags.includes(t))
          : tags.some(t => eTags.includes(t));
      }
      if (match && results) match = results.some(i2 => i2.id === el.dataset.id);
      if (fltMode.value === 'hide') {
        el.style.display = match ? '' : 'none';
      } else {
        el.style.display = '';
        el.classList.toggle('dimmed', !match);
      }
    }
    let totalVisible = 0;
    const tiers = c.querySelectorAll('.iceberg-tier');
    tiers.forEach((tier) => {
      let visible = 0;
      tier.querySelectorAll('.iceberg-item').forEach((el) => {
        if (el.style.display !== 'none' && !el.classList.contains('dimmed')) visible++;
      });
      totalVisible += visible;
      let msg = tier.querySelector('.tier-empty');
      if (visible === 0) {
        if (!msg) {
          msg = document.createElement('div');
          msg.className = 'tier-empty text-center text-white/15 text-sm py-8 italic';
          msg.textContent = tierEmptyMsg;
          tier.appendChild(msg);
        }
      } else if (msg) {
        msg.remove();
      }
    });
    let globalMsg = document.getElementById('items-empty');
    if (totalVisible === 0) {
      if (!globalMsg) {
        globalMsg = document.createElement('div');
        globalMsg.id = 'items-empty';
        globalMsg.className = 'text-center text-white/20 text-lg py-40 italic';
        globalMsg.textContent = noResultsMsg;
        c.appendChild(globalMsg);
      }
      tiers.forEach(t => { t.style.display = 'none'; });
    } else {
      if (globalMsg) globalMsg.remove();
      tiers.forEach(t => { t.style.display = ''; });
    }
    const bg = document.getElementById('iceberg-bg');
    if (bg) {
      const h = Math.max(document.documentElement.scrollHeight, bg.getBoundingClientRect().height);
      bg.style.setProperty('--bg-hf', Math.max(h / 1000, 1));
    }
  });
});

onMounted(() => {
  const c = document.getElementById('items-container');
  if (c) {
    c.addEventListener('mouseover', onMouseOver);
    c.addEventListener('mouseleave', onMouseLeave);
    c.addEventListener('click', onClick);
  }
  // Hash navigation from on-this-day
  const hash = window.location.hash.slice(1);
  if (hash && /^[a-f0-9]{8}$/.test(hash)) {
    setTimeout(() => {
      const el = document.querySelector(`.iceberg-item[data-id="${hash}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.classList.add('tooltip-active');
        const item = findItem(el);
        if (item) setTimeout(() => showTooltip(el, item), 400);
      }
    }, 600);
  }
});
onUnmounted(() => {
  clearTimeout(hoverTimer.value);
  const c = document.getElementById('items-container');
  if (c) {
    c.removeEventListener('mouseover', onMouseOver);
    c.removeEventListener('mouseleave', onMouseLeave);
    c.removeEventListener('click', onClick);
  }
});
</script>

<template>
  <ItemTooltip ref="tipRef" v-bind="tip" @enter="currentItemEl = null" @leave="hideTooltip" />

</template>
