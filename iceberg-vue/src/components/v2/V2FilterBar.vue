<script setup lang="ts">
// V2FilterBar（/v2 专用）：搜索 + 筛选 + 层级指示三合一 morphing 导航。
// 顶部全宽透明大条（h-16），滚过 160px 收成
// 居中浮动小丸（毛玻璃 + ring + 阴影），过渡统一 var(--ease-emphatic) 700ms。
// 层级指示器（TierNav 逻辑内迁：scroll-spy 当前层 + 下拉跳转）并入右侧，
// v2 不再挂载 TierNav。功能与 v1 侧边栏 1:1（防抖/右键隐藏/AND-OR/特殊/收藏/恢复/摘要/清除）。
import { computed, inject, onMounted, onUnmounted } from 'vue'
import { useStore } from '@nanostores/vue'
import {
  activeCategories, activeTags, searchQuery, toggleCategory, toggleTag,
  tagFilterMode, searchMode, hiddenCategories, hiddenTags, specialFilter,
  favFilter, hideCategory, hideTag, hasActiveFilter,
} from '../../lib/filterStore'
import { wallMatched } from '../../lib/iceberg/wallState'
import { useI18n } from '../../lib/useI18n'
import {
  CATEGORY_COLORS_KEY, TAG_MAP_KEY, DEFAULT_COLOR_KEY, TIER_ORDER_KEY,
} from '../../lib/injectionKeys'
import { FACET_COUNTS_KEY, type FacetCounts } from '../../lib/iceberg/v2/keys'
import { useV2NavVisibility } from '../../lib/iceberg/v2/useV2NavVisibility'
import { tierDisplayName, totalTiersText } from '../../lib/iceberg/tierDisplay'
import { useV2SearchSuggest } from '../../lib/iceberg/v2/useV2SearchSuggest'

const { t } = useI18n()
const colors = inject(CATEGORY_COLORS_KEY, {} as Record<string, string>)
const tMap = inject(TAG_MAP_KEY, {} as Record<string, string>)
const defColor = inject(DEFAULT_COLOR_KEY, '#FFFFFF')
const tierOrder = inject(TIER_ORDER_KEY, [] as string[])
const facet: FacetCounts = inject(FACET_COUNTS_KEY, { cats: {}, tags: {} })
const cats = Object.entries(colors)
const tagList = Object.entries(tMap)

const activeCats = useStore(activeCategories)
const activeT = useStore(activeTags)
const query = useStore(searchQuery)
const tagMode = useStore(tagFilterMode)
const sMode = useStore(searchMode)
const hiddenCats = useStore(hiddenCategories)
const hiddenT = useStore(hiddenTags)
const splFilter = useStore(specialFilter)
const favF = useStore(favFilter)
const hasActive = computed(() => hasActiveFilter({
  query: query.value, cats: activeCats.value, tags: activeT.value,
  hCats: hiddenCats.value, hTags: hiddenT.value, spl: splFilter.value, favF: favF.value,
}))
const total = computed(() => Object.values(facet.cats).reduce((n, c) => n + c, 0))
// wallMatched：管线产出的命中集；null = 尚未计算，按全量显示
const visibleText = computed(() => {
  const hit = wallMatched.value?.size
  if (!hasActive.value || hit == null) return String(total.value)
  return `${hit} / ${total.value}`
})

// C3：滚动帧/显隐/面板开关/层级跳转见 useV2NavVisibility，搜索速查见 useV2SearchSuggest。
// 本组件只保留筛选域（分类/标签/特殊/收藏）+ 召唤入口 + 模板。
const {
  suggestOpen, suggestIdx, suggestRows, searchInputRef,
  onSearchInputEvent, onSearchFocus, onSuggestKey, chooseSuggest,
} = useV2SearchSuggest()
const {
  expanded, searchFocus, barVisible, stuck, curTier, atTop, tierOpen,
  barRef, progressEl, togglePanel, scrollToTier,
} = useV2NavVisibility({ tierOrder, suggestOpen })
// 层级指示文案：顶部显示总数（共八层），其余显示序数（第一层…）
const curTierText = computed(() => {
  if (atTop.value) return totalTiersText(tierOrder.length)
  return curTier.value ? tierDisplayName(curTier.value) : t('entries')
})
const tierItemText = (name: string) => tierDisplayName(name)
defineExpose({ togglePanel })
// （滚动帧状态机已迁入 useV2NavVisibility，本组件只消费其返回的状态与函数）

// （搜索输入/速查下拉已迁入 useV2SearchSuggest）
// 召唤语义：展开面板 + 立刻解除 auto-hide + 聚焦。
// barVisible 只在滚动/鼠标帧里重算，程序化 focus() 不会触发重算，
// 必须这里直接置 true，否则焦点落在透明顶栏里（"按了没反应"）。
// 顶栏是 sticky，几何上恒在视口内，无需 scrollIntoView。
function focusSearch() {
  expanded.value = true
  barVisible.value = true
  searchInputRef.value?.focus()
  if (query.value.trim()) suggestOpen.value = true
}
function onGlobalKey(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  // ⌘K / Ctrl+K：速查直达（与 `/` 聚焦同入口，打开即下拉匹配）
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focusSearch()
    return
  }
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

// （Fuse 速查索引/下拉导航已迁入 useV2SearchSuggest）

// （吸顶/层级指示/跳转已迁入 useV2NavVisibility）
// （外部点击关闭已迁入 useV2NavVisibility）
onMounted(() => {
  document.addEventListener('keydown', onGlobalKey)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKey)
})

function clearAll() {
  searchQuery.set(''); activeCategories.set([]); activeTags.set([])
  hiddenCategories.set([]); hiddenTags.set([]); specialFilter.set('all'); favFilter.set(false)
}
// 特殊筛选四项：值与 i18n key 配对，模板 v-for 渲染（原四组手写按钮）
// 右键隐藏直接显示在原位（删除线 + 变暗，点即恢复），无需翻找恢复区
function pillCls(hidden: boolean, active: boolean): string {
  if (hidden) return 'off'
  return active ? 'on' : ''
}
const catPillCls = (cat: string) =>
  pillCls(hiddenCats.value.includes(cat), activeCats.value.length === 0 || activeCats.value.includes(cat))
const tagPillCls = (emoji: string) =>
  pillCls(hiddenT.value.includes(emoji), activeT.value.length === 0 || activeT.value.includes(emoji))
const specialPills: Array<[filter: string, labelKey: string]> = [
  ['hasLink', 'hasLink'],
  ['hasDesc', 'hasDesc'],
  ['isNew', 'isNew'],
  ['noLinkNoDesc', 'needComplete'],
]
function toggleSpecial(key: string) {
  specialFilter.set(splFilter.value === key ? 'all' : key)
}
</script>

<template>
  <div ref="barRef" class="v2navwrap" :class="{ stuck, 'v2-hidden': !barVisible }">
    <nav class="v2nav" aria-label="filter">
      <div class="v2nav-tier">
        <button type="button" class="v2nav-tool v2nav-tierbtn" :aria-expanded="tierOpen" @click.stop="tierOpen = !tierOpen">
          {{ curTierText }}
        </button>
        <transition name="tier-fade">
          <div v-if="tierOpen" class="v2nav-tierlist no-scrollbar">
            <button v-for="name in tierOrder" :key="name" type="button" class="v2nav-tieritem" :class="{ on: name === curTier }" @click="scrollToTier(name)">{{ tierItemText(name) }}</button>
          </div>
        </transition>
      </div>
      <span class="v2nav-sep" aria-hidden="true" />
      <div class="v2nav-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 opacity-40" aria-hidden="true"><circle cx="10" cy="10" r="7"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
        <input
          ref="searchInputRef" type="text" :value="query" @input="onSearchInputEvent"
          :placeholder="t('search')" autocomplete="off" aria-label="search" role="combobox"
          :aria-expanded="suggestOpen && suggestRows.length > 0"
          aria-controls="v2nav-suggest-list"
          :aria-activedescendant="suggestOpen && suggestIdx >= 0 ? 'v2nav-opt-' + suggestIdx : undefined"
          class="v2nav-input" @focus="onSearchFocus" @blur="searchFocus = false" @keydown="onSuggestKey"
        />
        <span class="v2nav-count" aria-live="polite">{{ visibleText }}</span>
        <span class="v2nav-kbd" aria-hidden="true">/</span>
        <transition name="tier-fade">
          <div v-if="suggestOpen && query.trim()" id="v2nav-suggest-list" class="v2nav-suggest no-scrollbar" role="listbox">
            <button v-for="(row, i) in suggestRows" :key="row.id" type="button" role="option" :id="'v2nav-opt-' + i" :aria-selected="i === suggestIdx"
              class="v2nav-sugrow" :class="{ on: i === suggestIdx }"
              @click="chooseSuggest(row)" @mousemove="suggestIdx = i">
              <span class="v2nav-sugtitle">{{ row.title }}</span>
              <span class="v2nav-sugcat">{{ row.category }}</span>
            </button>
            <p v-if="!suggestRows.length" class="v2nav-sugempty">{{ t('noResults') }}</p>
          </div>
        </transition>
      </div>
      <div class="v2nav-tools">
        <button type="button" class="v2nav-tool v2nav-tool-dim v2nav-hide-sm" :aria-pressed="sMode === 'full'" @click="searchMode.set(sMode === 'full' ? 'title' : 'full')">
          {{ sMode === 'full' ? t('searchFullText') : t('searchTitleOnly') }}
        </button>
        <span class="v2nav-sep v2nav-hide-sm" aria-hidden="true" />
        <button type="button" class="v2nav-tool v2nav-tool-dim v2nav-hide-sm" @click="focusSearch" aria-label="command palette">⌘K</button>
        <span class="v2nav-sep v2nav-hide-sm" aria-hidden="true" />
        <button type="button" class="v2nav-tool" :class="{ on: expanded || hasActive }" :aria-expanded="expanded" @click="togglePanel('bar')">
          {{ t('filter') }}<span v-if="hasActive" class="v2bar-dot" aria-hidden="true" />
        </button>
      </div>
      <span ref="progressEl" class="v2nav-progress" aria-hidden="true" />
      <transition name="v2expand">
      <div v-if="expanded" class="v2nav-panel no-scrollbar" role="group" :aria-label="t('filter')">
      <section class="v2bar-group">
        <h3 class="v2bar-h">{{ t('categories') }}</h3>
        <div class="v2bar-grid">
          <button v-for="[cat, color] in cats" :key="cat" @click="toggleCategory(cat)" @contextmenu.prevent="hideCategory(cat)"
            class="v2bar-pill" :class="catPillCls(cat)"
            :title="cat" :aria-pressed="activeCats.length === 0 || activeCats.includes(cat)">
            <span class="v2bar-cdot" :style="{ backgroundColor: color }" /><span>{{ cat }}</span><span class="v2bar-n">{{ facet.cats[cat] ?? 0 }}</span>
          </button>
        </div>
      </section>
      <section class="v2bar-group">
        <div class="v2bar-hrow">
          <h3 class="v2bar-h">{{ t('tags') }}</h3>
          <button type="button" class="v2nav-tool" :aria-pressed="tagMode === 'AND'" @click="tagFilterMode.set(tagMode === 'OR' ? 'AND' : 'OR')">{{ tagMode }}</button>
        </div>
        <div class="v2bar-grid">
          <button v-for="[emoji, name] in tagList" :key="emoji" @click="toggleTag(emoji)" @contextmenu.prevent="hideTag(emoji)"
            class="v2bar-pill" :class="tagPillCls(emoji)"
            :title="name" :aria-pressed="activeT.length === 0 || activeT.includes(emoji)">
            <span>{{ emoji }}</span><span>{{ name }}</span><span class="v2bar-n">{{ facet.tags[emoji] ?? 0 }}</span>
          </button>
        </div>
      </section>
      <section class="v2bar-group">
        <h3 class="v2bar-h">{{ t('special') }}</h3>
        <div class="v2bar-grid">
          <button v-for="[key, labelKey] in specialPills" :key="key" class="v2bar-pill" :class="{ on: splFilter === key }" @click="toggleSpecial(key)">{{ t(labelKey) }}</button>
          <button class="v2bar-pill" :class="{ on: favF }" @click="favFilter.set(!favF)">{{ favF ? '★ ' + t('unfavorite') : '☆ ' + t('favorite') }}</button>
        </div>
      </section>
      <!-- F6：小屏收纳 —— 顶栏放不下的次级工具（全文/标题、速查）收进面板，仅 ≤640px 显示 -->
      <section class="v2bar-group v2bar-group-sm">
        <h3 class="v2bar-h">{{ t('search') }}</h3>
        <div class="v2bar-grid">
          <button type="button" class="v2bar-pill" :class="{ on: sMode === 'full' }" :aria-pressed="sMode === 'full'" @click="searchMode.set(sMode === 'full' ? 'title' : 'full')">
            {{ sMode === 'full' ? t('searchFullText') : t('searchTitleOnly') }}
          </button>
          <button type="button" class="v2bar-pill" @click="focusSearch">⌘K {{ t('search') }}</button>
        </div>
      </section>
    </div>
    </transition>
    </nav>

    <transition name="v2expand">
    <div v-if="hasActive && !expanded && !suggestOpen" class="v2bar-active">
      <button v-if="query" @click="searchQuery.set('')" class="v2chip"><span class="truncate max-w-[120px]">{{ query }}</span><span class="v2chip-x" aria-hidden="true">×</span></button>
      <button v-for="cat in activeCats" :key="cat" @click="toggleCategory(cat)" class="v2chip"><span class="block w-2 h-2 shrink-0 rounded-sm" :style="{ backgroundColor: colors[cat] || defColor }" /><span>{{ cat }}</span><span class="v2chip-x" aria-hidden="true">×</span></button>
      <button v-for="tag in activeT" :key="tag" @click="toggleTag(tag)" class="v2chip"><span class="opacity-50">{{ tag }}</span><span>{{ tMap[tag] || tag }}</span><span class="v2chip-x" aria-hidden="true">×</span></button>
      <span v-if="(query || activeCats.length || activeT.length) && (hiddenCats.length || hiddenT.length)" class="v2chip-sep" aria-hidden="true" />
      <button v-for="cat in hiddenCats" :key="'h' + cat" @click="hideCategory(cat)" class="v2chip v2chip-off" :title="t('filter')"><span aria-hidden="true">⊘</span><span class="block w-2 h-2 shrink-0 rounded-sm opacity-30" :style="{ backgroundColor: colors[cat] || defColor }" /><span>{{ cat }}</span><span class="v2chip-x" aria-hidden="true">×</span></button>
      <button v-for="tag in hiddenT" :key="'h' + tag" @click="hideTag(tag)" class="v2chip v2chip-off" :title="t('filter')"><span aria-hidden="true">⊘</span><span class="opacity-30">{{ tag }}</span><span>{{ tMap[tag] || tag }}</span><span class="v2chip-x" aria-hidden="true">×</span></button>
      <button type="button" class="v2chip v2chip-clear" @click="clearAll">{{ t('clearAll') }}</button>
    </div>
    </transition>
  </div>
</template>

<style scoped>
.v2navwrap {
  --ease-morph: cubic-bezier(0.16, 1, 0.3, 1);
  position: sticky; top: 12px; z-index: 40;
  margin-top: 2.25rem; margin-bottom: 3rem;
  transition: opacity 0.25s ease, transform 0.25s ease, visibility 0s;
}
.v2navwrap.v2-hidden {
  opacity: 0; transform: translateY(-8px); visibility: hidden;
  transition: opacity 0.25s ease, transform 0.25s ease, visibility 0s 0.25s;
}
.v2navwrap.v2-hidden > * { pointer-events: none !important; }
/* 同一条变形：常态全宽透明，贴住后缩成居中浮动小丸（内容不变，只换皮） */
.v2nav {
  position: relative;
  display: flex; align-items: center; gap: 1rem;
  max-width: 80rem; margin: 0 auto; min-height: 4rem; padding: 0.5rem 1rem;
  border: 1px solid transparent; border-radius: 0;
  transition: max-width 0.7s var(--ease-morph), min-height 0.7s var(--ease-morph),
    background-color 0.7s var(--ease-morph), border-color 0.7s var(--ease-morph),
    border-radius 0.7s var(--ease-morph), box-shadow 0.7s var(--ease-morph),
    padding 0.7s var(--ease-morph);
}
.stuck .v2nav {
  max-width: 52rem; padding: 0.5rem 1rem;
  background: var(--v2-surface);
  border: 1px solid var(--white-10); border-radius: var(--v2-r-lg);
  box-shadow: var(--v2-shadow-sm);
  backdrop-filter: var(--v2-blur); -webkit-backdrop-filter: var(--v2-blur);
}
.v2nav-search {
  flex: 1; min-width: 0;   display: flex; align-items: center; gap: 0.6rem;
  max-width: 36rem; margin: 0 auto;
  border: 1px solid var(--white-08); border-radius: 0.75rem;
  padding: 0 0.8rem; height: 2.5rem; color: var(--white-45);
  background: rgba(255, 255, 255, 0.03);
  transition: border-color 0.2s;
}
.v2nav-search:focus-within { border-color: var(--white-20); }
.v2nav-input {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--white-90); font-size: var(--font-base); font-weight: 400; padding: 0.25rem 0; caret-color: var(--color-accent-soft);
}
.v2nav-input::placeholder { color: var(--white-25); }
.v2nav-kbd {
  flex: none; font-size: var(--font-tiny); font-weight: 500; color: var(--white-40);
  border: 1px solid var(--white-12); border-radius: var(--v2-r-sm); padding: 1px 7px; line-height: 1.5;
}
.v2nav-count { flex: none; font-size: var(--font-tiny); font-weight: 500; color: var(--white-30); font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }
.v2nav-tools { flex: none; display: flex; align-items: center; gap: 0.15rem; }
.v2nav-tool {
  background: transparent; border: none; cursor: pointer; padding: 0.375rem 0.75rem; border-radius: 0.5rem;
  font-size: var(--font-xs); font-weight: 500; color: var(--white-45);
  transition: color 0.2s, background-color 0.2s, transform 0.12s ease; white-space: nowrap;
}
.v2nav-tool:hover { color: var(--white-90); background: var(--white-06); }
.v2nav-tool:active { transform: scale(0.94); }
.v2nav-tool.on { color: var(--white-90); }
/* 次级工具（全文/标题切换）：更小更淡，与层级/筛选主工具拉开层级 */
.v2nav-tool-dim { font-size: var(--font-tiny); font-weight: 400; color: var(--white-30); padding: 0.375rem 0.5rem; }
.v2nav-tool-dim:hover { color: var(--white-60); background: transparent; }
/* 层级指示：固定最小宽，curTier 变化不顶动右侧布局 */
.v2nav-tierbtn { min-width: 4.5em; text-align: center; color: var(--white-60); }
/* 面板/摘要显隐：简单淡入下沉（reduced-motion 由全局禁用） */
.v2expand-enter-active, .v2expand-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.v2expand-enter-from, .v2expand-leave-to { opacity: 0; transform: translateY(-6px); }
.v2bar-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--color-accent); margin-left: 5px; vertical-align: 2px; }
.v2nav-sep { width: 1px; height: 1rem; background: var(--white-10); margin: 0 0.35rem; flex: none; }
/* 阅读进度发丝线：钉在导航底部，scaleX 由滚动驱动（rAF 直写，无过渡）；
   左右内收 + 自身圆角，保证不探出容器圆角之外 */
.v2nav-progress {
  position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-bright));
  transform-origin: left; transform: scaleX(0); pointer-events: none;
}
.v2nav-tier { position: relative; flex: none; }
.v2nav-tierlist {
  position: absolute; top: calc(100% + 8px); left: 0; z-index: 50;
  display: flex; flex-direction: column; min-width: 8.5rem; max-height: 50vh; overflow-y: auto;
  background: var(--v2-surface); border: 1px solid var(--white-12); border-radius: var(--v2-r-md); padding: 6px;
  box-shadow: var(--v2-shadow-lg);
  backdrop-filter: var(--v2-blur); -webkit-backdrop-filter: var(--v2-blur);
}
.v2nav-tieritem {
  background: transparent; border: none; cursor: pointer;
  display: flex; align-items: center; gap: 0.6rem;
  font-size: var(--font-sm); color: var(--white-50); padding: 0.55rem 0.7rem; border-radius: var(--v2-r-sm);
  transition: color 0.12s, background-color 0.12s; white-space: nowrap; text-align: left;
}
.v2nav-tieritem:hover { color: var(--white-90); background: var(--white-06); }
.v2nav-tieritem.on { color: var(--white-90); background: var(--white-06); }
.v2nav-tieritem.on::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--color-accent); flex: none; }
.v2nav-panel {
  /* 相对 wrapper 绝对浮层：任何状态下开关都不顶动墙体 */
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 50;
  max-width: 52rem; margin: 0 auto;
  background: var(--v2-surface);
  border: 1px solid var(--white-10); border-radius: var(--v2-r-lg);
  box-shadow: var(--v2-shadow-lg);
  backdrop-filter: var(--v2-blur); -webkit-backdrop-filter: var(--v2-blur);
  padding: 1.25rem 1.25rem 1.4rem;
  display: flex; flex-direction: column; gap: 1.2rem;
  max-height: min(70vh, 560px); overflow-y: auto;
  pointer-events: auto;
}
.v2bar-group { display: flex; flex-direction: column; gap: 0.7rem; min-width: 0; }
.v2bar-hrow { display: flex; align-items: center; gap: 0.75rem; }
.v2bar-h { margin: 0; font-size: var(--font-tiny); font-weight: 400; text-transform: uppercase; letter-spacing: 0.14em; color: var(--white-30); display: flex; align-items: center; gap: 0.5rem; }
.v2bar-h::before { content: ""; width: 3px; height: 3px; border-radius: 50%; background: var(--color-accent); flex: none; }
.v2bar-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.v2bar-pill {
  display: inline-flex; align-items: center; gap: 0.45rem;
  background: var(--white-03); border: 1px solid var(--white-10); border-radius: var(--v2-r-sm);
  color: var(--white-55); font-size: var(--font-xs); font-weight: 400; padding: 0.5rem 0.875rem; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s, transform 0.12s ease; white-space: nowrap;
}
.v2bar-pill:hover { color: var(--white-90); border-color: var(--white-25); background: var(--white-06); transform: translateY(-1px); }
.v2bar-pill:active { transform: translateY(0) scale(0.96); }
.v2bar-pill.on { color: var(--v2-on-fg); background: var(--v2-on-bg); border-color: var(--v2-on-bg); font-weight: 700; }
.v2bar-pill.on .v2bar-n { color: color-mix(in srgb, var(--v2-on-fg) 55%, transparent); }
.v2bar-pill.off { text-decoration: line-through; color: var(--white-30); }
.v2bar-cdot { display: block; width: 7px; height: 7px; border-radius: 50%; flex: none; }
.v2bar-n { font-size: var(--font-tiny); font-weight: 500; color: var(--white-30); font-variant-numeric: tabular-nums; }
/* 当前筛选：与顶栏同一套变形规则（透明全宽 ↔ 毛玻璃小丸），只动水平与表面 */
.v2bar-active {
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 45;
  display: flex; align-items: center; justify-content: safe center; flex-wrap: wrap;
  gap: 0.35rem 0.9rem; width: fit-content; max-width: 80rem; margin: 0 auto; padding: 0.45rem 1rem;
  background: transparent;
  border: 1px solid transparent; border-radius: 0;
  pointer-events: none; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
  transition: max-width 0.7s var(--ease-morph), background-color 0.7s var(--ease-morph),
    border-color 0.7s var(--ease-morph), border-radius 0.7s var(--ease-morph),
    box-shadow 0.7s var(--ease-morph), padding 0.7s var(--ease-morph);
}
.stuck .v2bar-active {
  max-width: 52rem;
  background: var(--v2-surface);
  border: 1px solid var(--white-08); border-radius: var(--v2-r-lg);
  box-shadow: var(--v2-shadow-lg);
  backdrop-filter: var(--v2-blur); -webkit-backdrop-filter: var(--v2-blur);
}
.v2bar-active > * { pointer-events: auto; }
.v2chip {
  flex: none; display: inline-flex; align-items: center; gap: 0.35rem;
  background: transparent; border: none; cursor: pointer; padding: 0.1rem 0;
  color: var(--white-55); font-size: var(--font-tiny); font-weight: 400; letter-spacing: 0.04em;
  transition: color 0.15s;
}
.v2chip:hover { color: var(--white-90); }
.v2chip-x { opacity: 0.35; font-size: var(--font-tiny); line-height: 1; transition: opacity 0.15s; }
.v2chip:hover .v2chip-x { opacity: 0.9; }
.v2chip-off { text-decoration: line-through; color: var(--white-30); border: 1px dashed var(--white-15); border-radius: 999px; padding: 0.1rem 0.6rem; }
.v2chip-off:hover { color: var(--white-60); border-color: var(--white-25); }
.v2chip-sep { flex: none; width: 1px; height: 12px; background: var(--white-12); margin: 0 0.25rem; }
.v2chip-clear { color: var(--white-30); margin-left: 0.5rem; }
.v2chip-clear:hover { color: var(--white-70); }
@media (max-width: 640px) {
  .v2navwrap { margin-top: 1.5rem; margin-bottom: 1.25rem; }
  .v2nav { gap: 0.5rem; }
  .v2nav-kbd, .v2nav-count { display: none; }
  .v2nav-hide-sm { display: none; }
  .v2nav-panel { left: 12px; right: 12px; }
}
/* 面板内小屏收纳组：桌面隐藏 */
.v2bar-group-sm { display: none; }
@media (max-width: 640px) {
  .v2bar-group-sm { display: block; }
}
/* F10 平板：吸顶小丸不再定宽 52rem（768px 下几乎满宽），改流式边距 */
@media (max-width: 820px) {
  .stuck .v2nav { max-width: calc(100vw - 24px); }
}
/* F10 触屏：pill 内边距提到触控尺寸 */
@media (hover: none) {
  .v2bar-pill { padding-top: 0.625rem; padding-bottom: 0.625rem; }
}
/* 输入框速查下拉：挂在搜索框下，与层级下拉同语言 */
.v2nav-search { position: relative; }
.v2nav-suggest {
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 60;
  background: var(--v2-surface); border: 1px solid var(--white-12); border-radius: var(--v2-r-md);
  box-shadow: var(--v2-shadow-lg);
  padding: 6px; max-height: 320px; overflow-y: auto;
}
.v2nav-sugrow {
  display: flex; align-items: baseline; gap: 0.6rem; width: 100%;
  background: transparent; border: none; border-radius: var(--v2-r-sm); cursor: pointer;
  color: var(--white-70); font-size: var(--font-sm); text-align: left; padding: 0.55rem 0.7rem;
}
.v2nav-sugrow.on { background: var(--white-08); color: var(--white-90); }
.v2nav-sugtitle { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v2nav-sugcat { flex: none; font-size: var(--font-tiny); color: var(--white-30); }
.v2nav-sugempty { margin: 0; padding: 0.8rem; text-align: center; font-size: var(--font-xs); color: var(--white-30); }
</style>
