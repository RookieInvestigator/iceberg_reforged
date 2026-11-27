<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import { useI18n } from '../../lib/useI18n'
import { V3_CTX_KEY, type V3Item } from '../../lib/v3/keys'
import { resolveV3Id } from '../../lib/v3/dataSource'
import {
  buildWall, applyFilter, applyReadAll, applyFavAll, applyNewAll,
  markReadOne, markFavOne, setTooltipActive,
  type WallHandles, type WallBuilder,
} from '../../lib/v3/wall'
import { sortTier, type V3Sort } from '../../lib/v3/entryView'
import {
  sortMode, filterMode, showReadMark, showNewMark, scatterMode,
  colorblindMode, favorites, readItems, NEW_MARK_WINDOW_DAYS,
} from '../../lib/v3/store'

const ctx = inject(V3_CTX_KEY)
if (!ctx) throw new Error('[V3Wall] 缺少 V3_CTX_KEY')

const { t, lang } = useI18n()
const hostRef = ref<HTMLElement | null>(null)
let builder: WallBuilder | null = null
let wall: WallHandles | null = null

const ds = computed(() => ctx.dataset.value)
const matched = computed(() => ctx.filter.value.matched)

const sort = useStore(sortMode)
const fltMode = useStore(filterMode)
const showRead = useStore(showReadMark)
const showNew = useStore(showNewMark)
const scatter = useStore(scatterMode)
const cb = useStore(colorblindMode)
const favList = useStore(favorites)
const readList = useStore(readItems)

const readIdSet = computed(() => new Set(readList.value.map((id) => resolveV3Id(ds.value, id))))
const favIdSet = computed(() => new Set(favList.value.map((id) => resolveV3Id(ds.value, id))))
const newCutoff = () => Date.now() / 1000 - NEW_MARK_WINDOW_DAYS * 86400

function effectiveMode(): 'hide' | 'dim' {
  return fltMode.value === 'dim' ? 'dim' : 'hide'
}

function tierPayload(): Array<{ name: string; items: V3Item[] }> {
  return ds.value.tierOrder.map((name) => ({
    name,
    items: sortTier(ds.value.tiers[name] || [], sort.value as V3Sort),
  }))
}

function rebuild() {
  const host = hostRef.value
  if (!host) return
  builder?.destroy()
  const filtered = matched.value !== null
  builder = buildWall(host, {
    tiers: tierPayload(),
    categoryColors: ds.value.categoryColors,
    drift: true,
    scatter: scatter.value,
    colorblind: cb.value,
    tierEmptyText: t('tierEmpty'),
    initialTiers: filtered ? undefined : 2,
    readIds: readIdSet.value,
    favIds: favIdSet.value,
    showRead: showRead.value,
    showNew: showNew.value,
    newCutoff: newCutoff(),
    matched: matched.value,
    filterMode: effectiveMode(),
  })
  wall = builder.handles
}

function patchFilter() {
  if (!wall || !builder) return
  const mode = effectiveMode()
  builder.setInitialFilter(matched.value, mode)
  if (matched.value !== null) builder.flush()
  applyFilter(wall, matched.value, mode)
}

function patchMarks() {
  if (!wall || !builder) return
  const cutoff = newCutoff()
  builder.setInitialMarks({
    readIds: readIdSet.value,
    favIds: favIdSet.value,
    showRead: showRead.value,
    showNew: showNew.value,
    newCutoff: cutoff,
  })
  applyReadAll(wall, readIdSet.value, showRead.value)
  applyFavAll(wall, favIdSet.value)
  applyNewAll(wall, cutoff, showNew.value)
}

watch([() => sort.value, () => scatter.value, () => cb.value], rebuild)
watch(ds, rebuild)
watch([matched, () => fltMode.value], patchFilter)
watch([() => showRead.value, () => showNew.value], patchMarks)
watch(readIdSet, (s) => {
  if (!wall || !builder) return
  builder.setInitialMarks({ readIds: s })
  applyReadAll(wall, s, showRead.value)
})
watch(favIdSet, (s) => {
  if (!wall || !builder) return
  builder.setInitialMarks({ favIds: s })
  applyFavAll(wall, s)
})
watch(lang, () => { builder?.setTierEmptyText(t('tierEmpty')) })

onMounted(() => { rebuild() })

onBeforeUnmount(() => {
  builder?.destroy()
  builder = null
  wall = null
})

function flush() {
  builder?.flush()
}

function getEl(id: string): HTMLElement | null {
  if (!wall) return null
  const idx = wall.indexOf.get(id)
  if (idx !== undefined) return wall.els[idx]
  builder?.flush()
  const idx2 = wall.indexOf.get(id)
  return idx2 !== undefined ? wall.els[idx2] : null
}

defineExpose({
  flush,
  markRead: (id: string) => {
    if (!wall || !showRead.value) return
    markReadOne(wall, resolveV3Id(ds.value, id), true)
  },
  markFav: (id: string) => {
    if (!wall) return
    const rid = resolveV3Id(ds.value, id)
    markFavOne(wall, rid, favIdSet.value.has(rid))
  },
  setTooltipActive: (id: string | null) => {
    setTooltipActive(wall, id ? resolveV3Id(ds.value, id) : null)
  },
  getEl,
  getWall: () => wall,
})
</script>

<template>
  <div id="v3-strata" ref="hostRef" class="v3-strata-host" />
</template>

<style scoped>
.v3-strata-host { position: relative; }
</style>
