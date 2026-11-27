<script setup lang="ts">
import { computed, inject, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import { useI18n } from '../../lib/useI18n'
import { useFadeInOnShow } from '../../lib/iceberg/useFadeInOnShow'
import { buildCategoryShapeMap } from '../../lib/v3/wall'
import { colorblindMode } from '../../lib/v3/store'
import { V3_CTX_KEY } from '../../lib/v3/keys'
import RichText from '../ui/RichText.vue'
import type { EntryView } from '../../lib/iceberg/entryView'

const props = defineProps<{
  view: EntryView | null
  anchorEl: HTMLElement | null
  categoryColors?: Record<string, string>
}>()

const emit = defineEmits<{
  enter: []
  leave: []
}>()

const { t } = useI18n()
const v3Ctx = inject(V3_CTX_KEY, null)
const cb = useStore(colorblindMode)
const catShapes = computed(() => buildCategoryShapeMap(v3Ctx?.dataset.value.categoryColors || props.categoryColors || {}))
const rootEl = ref<HTMLElement | null>(null)
const teleported = useFadeInOnShow(() => !!props.view)

const lastView = ref<EntryView | null>(null)
watch(() => props.view, (v) => {
  if (v) lastView.value = v
})
const shown = computed(() => props.view || lastView.value)

const dotStyle = computed(() => {
  const c = shown.value?.categoryColor || '#fff'
  return c.toLowerCase() === '#ffffff'
    ? { color: c, WebkitTextStroke: '1px #000' }
    : { color: c }
})

const tagsText = computed(() => (shown.value?.tags || []).join(' | '))

let ro: ResizeObserver | null = null
let raf = 0

function place() {
  const tp = rootEl.value
  const el = props.anchorEl
  if (!tp || !el || !props.view) return

  const M = 8
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  tp.style.maxHeight = ''
  const h = tp.offsetHeight || 80
  const w = tp.offsetWidth || 0

  const spaceAbove = rect.top - M
  const spaceBelow = vh - rect.bottom - M
  let below = false
  let maxH = 0
  if (spaceAbove < h && spaceBelow >= h) below = true
  else if (spaceAbove < h && spaceBelow < h) {
    below = spaceBelow > spaceAbove
    maxH = Math.max(below ? spaceBelow : spaceAbove, 80)
    tp.style.maxHeight = `${maxH}px`
  }

  const cx = rect.left + rect.width / 2
  const align = cx < vw * 0.25 ? 'left' : cx > vw * 0.75 ? 'right' : 'center'
  let x = align === 'left' ? rect.left : align === 'right' ? rect.right - w : cx - w / 2
  x = Math.min(Math.max(x, M), Math.max(M, vw - w - M))
  const y = below
    ? Math.min(rect.bottom, Math.max(M, vh - maxH - M))
    : Math.min(Math.max(rect.top - h, M), Math.max(M, vh - h - M))

  tp.style.transform = 'none'
  tp.style.left = `${Math.round(x)}px`
  tp.style.top = `${Math.round(y)}px`
  tp.classList.toggle('tooltip-below', below)
  tp.classList.toggle('tooltip-left', align === 'left')
  tp.classList.toggle('tooltip-right', align === 'right')
}

function stopObserve() {
  if (ro) { ro.disconnect(); ro = null }
  if (raf) { cancelAnimationFrame(raf); raf = 0 }
}

watch(() => [props.view?.id, props.anchorEl] as const, async ([id, el]) => {
  stopObserve()
  if (!id || !el) return
  await nextTick()
  const tp = rootEl.value
  if (!tp) return
  place()
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { raf = 0; place() })
    })
    ro.observe(tp)
    ro.observe(el)
  }
}, { immediate: true })

onScopeDispose(stopObserve)
defineExpose({ rootEl })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="shown"
      ref="rootEl"
      class="tooltip-box v2tip v3-hovercard floating"
      :class="{ show: !!view && teleported }"
      role="tooltip"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <p class="v2tip-cat">
        <span
          v-if="cb"
          class="v3-cmark"
          :class="'cm-' + (catShapes.get(shown.category) ?? 0)"
          :style="{ '--mark-color': shown.categoryColor || '#fff' }"
          aria-hidden="true"
        />
        <span v-else :style="dotStyle">●</span>
        {{ shown.category }}
        <span v-if="shown.link" class="v2tip-link" :title="t('hasLink')" :aria-label="t('hasLink')">
          <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
            <path d="M3 9 L9 3 M4.5 3 H9 V7.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </p>
      <p class="v2tip-desc" :class="{ 'tooltip-desc-empty': !shown.desc }">
        <RichText inline :text="shown.desc || t('noDesc')" />
      </p>
      <p v-if="tagsText" class="v2tip-tags">{{ tagsText }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.v2tip { padding: 16px 18px; border-radius: var(--v2-r-md); max-width: min(380px, 88vw); color: var(--color-tooltip-text); }
.v2tip-cat { display: flex; align-items: center; gap: 0.25rem; margin: 0 0 6px; font-size: var(--font-tiny); font-weight: 700; letter-spacing: 0.18em; color: var(--color-tooltip-meta); }
.v2tip-cat > span:first-child:not(.v3-cmark) { font-size: 8px; vertical-align: 1px; margin-right: 2px; }
.v2tip-cat .v3-cmark { width: 8px; height: 8px; min-width: 8px; min-height: 8px; margin-right: 2px; }
.v2tip-link { display: inline-flex; align-items: center; margin-left: 2px; color: var(--color-tooltip-meta); opacity: 0.75; vertical-align: 0; }
.v2tip-link svg { display: block; }
.v2tip-desc { margin: 0; font-size: var(--font-sm); line-height: 1.65; color: var(--color-tooltip-text); overflow-wrap: anywhere; }
.v2tip-tags { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid var(--color-tooltip-border); font-size: var(--font-tiny); color: var(--color-tooltip-meta); }
</style>
