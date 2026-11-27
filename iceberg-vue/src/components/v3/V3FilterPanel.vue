<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useStore } from '@nanostores/vue'
import PinyinMatch from 'pinyin-match'
import { Search } from '@lucide/vue'
import { useI18n } from '../../lib/useI18n'
import { V3_CTX_KEY } from '../../lib/v3/keys'
import { buildCategoryShapeMap } from '../../lib/v3/wall'
import {
  activeCategories, activeTags, tagFilterMode, hiddenCategories, hiddenTags,
  specialFilter, favFilter, searchMode, searchFuzzyMode, colorblindMode,
  toggleCategory, toggleTag, hideCategory, hideTag,
} from '../../lib/v3/store'

const ctx = inject(V3_CTX_KEY)
if (!ctx) throw new Error('[V3FilterPanel] 缺少 V3_CTX_KEY')

const { t } = useI18n()

const cats = useStore(activeCategories)
const tags = useStore(activeTags)
const tagMode = useStore(tagFilterMode)
const hideCats = useStore(hiddenCategories)
const hideTags = useStore(hiddenTags)
const special = useStore(specialFilter)
const favOnly = useStore(favFilter)
const sMode = useStore(searchMode)
const fMode = useStore(searchFuzzyMode)
const cb = useStore(colorblindMode)

const tagQuery = ref('')

const ds = computed(() => ctx.dataset.value)
const catList = computed(() => Object.entries(ds.value.categoryColors))
const catShapes = computed(() => buildCategoryShapeMap(ds.value.categoryColors))
const tagList = computed(() =>
  Object.entries(ds.value.tagMap).filter(([e]) => (ds.value.facetTags[e] || 0) > 0),
)

const matchedTagSet = computed(() => {
  const q = tagQuery.value.trim()
  const out = new Set<string>()
  if (!q) return out
  const qLower = q.toLowerCase()
  for (const [emoji, name] of tagList.value) {
    if (
      emoji.includes(q)
      || name.toLowerCase().includes(qLower)
      || !!PinyinMatch.match(name, q)
    ) {
      out.add(emoji)
    }
  }
  return out
})

function onTagSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && tagQuery.value) {
    e.stopPropagation()
    tagQuery.value = ''
  }
}

function catCls(name: string): string {
  if (hideCats.value.includes(name)) return 'off'
  return cats.value.includes(name) ? 'on' : ''
}

function tagCls(emoji: string): string {
  if (hideTags.value.includes(emoji)) return 'off'
  return tags.value.includes(emoji) ? 'on' : ''
}

const specialPills: Array<{ key: string; labelKey: string }> = [
  { key: 'hasLink', labelKey: 'hasLink' },
  { key: 'hasDesc', labelKey: 'hasDesc' },
  { key: 'isNew', labelKey: 'isNew' },
  { key: 'noLinkNoDesc', labelKey: 'needComplete' },
]
</script>

<template>
  <div class="v3-nav-panel no-scrollbar" role="group" :aria-label="t('filter')">
    <section class="v3-bar-group">
      <h3 class="v3-bar-h">{{ t('categories') }}</h3>
      <div class="v3-bar-grid">
        <button
          v-for="[cat, color] in catList"
          :key="cat"
          type="button"
          class="v3-bar-pill"
          :class="catCls(cat)"
          :title="cat"
          :aria-pressed="cats.includes(cat)"
          @click="toggleCategory(cat)"
          @contextmenu.prevent="hideCategory(cat)"
        >
          <span
            v-if="cb"
            class="v3-cmark"
            :class="'cm-' + (catShapes.get(cat) ?? 0)"
            :style="{ '--mark-color': color }"
            aria-hidden="true"
          />
          <span v-else class="v3-bar-cdot" :style="{ backgroundColor: color }" />
          <span>{{ cat }}</span>
          <span class="v3-bar-n">{{ ds.facetCats[cat] ?? 0 }}</span>
        </button>
      </div>
    </section>

    <section class="v3-bar-group">
      <div class="v3-bar-hrow">
        <h3 class="v3-bar-h">{{ t('tags') }}</h3>
        <div class="v3-tag-search">
          <Search :size="11" :stroke-width="2" class="shrink-0 opacity-50" aria-hidden="true" />
          <input
            v-model="tagQuery"
            type="text"
            class="v3-tag-search-input"
            :placeholder="t('filterTagSearchPlaceholder')"
            :aria-label="t('filterTagSearchPlaceholder')"
            autocomplete="off"
            spellcheck="false"
            @keydown="onTagSearchKey"
          />
          <button
            v-if="tagQuery"
            type="button"
            class="v3-tag-search-clear"
            :aria-label="t('clearAll')"
            @click="tagQuery = ''"
          >×</button>
        </div>
        <button
          type="button"
          class="v3-nav-tool v3-tag-mode-btn"
          :aria-pressed="tagMode === 'AND'"
          @click="tagFilterMode.set(tagMode === 'OR' ? 'AND' : 'OR')"
        >{{ tagMode }}</button>
      </div>
      <div class="v3-bar-grid">
        <button
          v-for="[emoji, name] in tagList"
          :key="emoji"
          type="button"
          class="v3-bar-pill"
          :class="[tagCls(emoji), { 'is-match': matchedTagSet.has(emoji) }]"
          :title="name"
          :aria-pressed="tags.includes(emoji)"
          @click="toggleTag(emoji)"
          @contextmenu.prevent="hideTag(emoji)"
        >
          <span>{{ emoji }}</span><span>{{ name }}</span>
          <span class="v3-bar-n">{{ ds.facetTags[emoji] ?? 0 }}</span>
        </button>
      </div>
    </section>

    <section class="v3-bar-group">
      <h3 class="v3-bar-h">{{ t('special') }}</h3>
      <div class="v3-bar-grid">
        <button
          v-for="p in specialPills"
          :key="p.key"
          type="button"
          class="v3-bar-pill"
          :class="{ on: special === p.key }"
          @click="specialFilter.set(special === p.key ? 'all' : p.key)"
        >{{ t(p.labelKey) }}</button>
        <button
          type="button"
          class="v3-bar-pill"
          :class="{ on: favOnly }"
          @click="favFilter.set(!favOnly)"
        >{{ favOnly ? '★ ' + t('unfavorite') : '☆ ' + t('favorite') }}</button>
      </div>
    </section>

    <section class="v3-bar-group v3-bar-group-sm">
      <h3 class="v3-bar-h">{{ t('search') }}</h3>
      <div class="v3-bar-grid">
        <button
          type="button"
          class="v3-bar-pill"
          :class="{ on: sMode === 'full' }"
          :aria-pressed="sMode === 'full'"
          @click="searchMode.set(sMode === 'full' ? 'title' : 'full')"
        >{{ sMode === 'full' ? t('searchFullText') : t('searchTitleOnly') }}</button>
        <button
          type="button"
          class="v3-bar-pill"
          :class="{ on: fMode === 'fuzzy' }"
          :aria-pressed="fMode === 'fuzzy'"
          @click="searchFuzzyMode.set(fMode === 'fuzzy' ? 'exact' : 'fuzzy')"
        >{{ fMode === 'fuzzy' ? t('searchFuzzy') : t('searchExact') }}</button>
      </div>
    </section>
  </div>
</template>
