<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { renderMd, parseFM } from '../lib/md'
import { normalizeData } from '../lib/data'
import { useI18n } from '../lib/useI18n'
import rawData from '../data/iceberg.json'
import EntryDetailCardNext from '../components/items/EntryDetailCardNext.vue'

const { t } = useI18n()

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const route = useRoute()
const router = useRouter()
const slug = computed(() => route.params.slug as string)

const data = normalizeData(rawData)
const allItems = Object.entries(data.tiers).flatMap(([tierName, items]) =>
  items.map((i: any) => markRaw({ ...i, tier: tierName }))
)
const itemMap = new Map(allItems.map(i => [i.id, i]))

const feature = ref<any>(null)
const bodyHtml = ref('')
const cardRefs = ref<Map<string, HTMLElement>>(new Map())
const modalItem = ref<any>(null)

const modules = import.meta.glob('../data/features/*.md', { query: '?raw', import: 'default', eager: true })

function pickRelated(item: any, excludeIds: Set<string>) {
  return allItems
    .filter(i => !excludeIds.has(i.id))
    .map(i => { let s = 0; if (i.category === item.category) s += 3; for (const t of item.tags || []) if (i.tags.includes(t)) s += 2; return { id: i.id, title: i.title, score: s } })
    .filter(r => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

onMounted(() => {
  const key = `../data/features/${slug.value}.md`
  const raw = (modules as any)[key]
  if (!raw) { router.replace('/features'); return }

  const m = (raw as string).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!m) { router.replace('/features'); return }

  const fm = parseFM(m[1])
  let ids: string[] = []
  if (Array.isArray(fm.items)) ids = fm.items.filter(Boolean)

  const items: any[] = []
  for (const id of ids) {
    const it = itemMap.get(id)
    if (!it) continue
    items.push({ id, title: it.title, tier: it.tier, category: it.category, categoryColor: (it as any).categoryColor || '#fff', desc: (it as any).desc || '', tags: it.tags || [], link: (it as any).link || '' })
  }

  feature.value = { title: fm.title, date: fm.date, description: fm.description, items }

  // 渲染正文，[item:ID] → 内联卡片 HTML
  // [item:ID] → 占位符，避免被 renderMd 转义
  const cards: Record<string, string> = {}
  let text = m[2].trim()
  text = text.replace(/\[item:([a-f0-9]+)\]/g, (_, id: string) => {
    const it = items.find((i: any) => i.id === id)
    if (!it) return `[未知词条: ${id}]`
    const desc = it.desc ? `<span class="fic-desc">${escapeHtml(it.desc.slice(0, 120))}${it.desc.length > 120 ? '…' : ''}</span>` : ''
    const ph = `\x00CARD_${id}\x00`
    cards[ph] = `<span class="fi-card" data-item-id="${id}"><span class="fic-title" style="color:${escapeHtml(it.categoryColor)}">${escapeHtml(it.title)}</span><span class="fic-cat">${escapeHtml(it.category)}</span>${desc}</span>`
    return ph
  })

  let html = renderMd(text)
  for (const [ph, card] of Object.entries(cards)) {
    html = html.replaceAll(ph, card)
  }
  bodyHtml.value = html
})

// 弹窗
const idSet = computed(() => new Set<string>((feature.value?.items || []).map((i: any) => i.id)))
function openModal(id: string) {
  const items = feature.value!.items as any[]
  const idx = items.findIndex((i: any) => i.id === id)
  if (idx === -1) return
  const item = items[idx]
  modalItem.value = {
    ...item,
    related: pickRelated(item, idSet.value),
    recommended: [],
    prevId: idx > 0 ? items[idx - 1].id : null,
    nextId: idx < items.length - 1 ? items[idx + 1].id : null,
  }
}
function onNavigate({ id }: { id: string }) { openModal(id) }
function closeModal() { modalItem.value = null }

// 委托点击：卡片在 v-html 里，用事件委托
function onBodyClick(e: MouseEvent) {
  const card = (e.target as HTMLElement).closest('.fi-card') as HTMLElement | null
  if (card) { const id = card.dataset.itemId; if (id) openModal(id) }
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && modalItem.value) closeModal() }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="min-h-screen max-w-[720px] mx-auto px-4 pt-8 pb-20 sm:px-8 sm:pt-12 sm:pb-32">
    <button class="inline-block bg-transparent border-none text-white-20 text-xs cursor-pointer pb-8 tracking-[0.04em] transition-colors duration-200 hover:text-white-50" @click="router.push('/features')">{{ t('backToFeatures') }}</button>

    <template v-if="feature">
      <header class="mb-12">
        <time class="text-tiny text-white-14 tracking-[0.1em]">{{ feature.date }}</time>
        <h1 class="text-[clamp(1.6rem,4vw,2.2rem)] font-black text-white-88 mt-2 mb-3 tracking-[0.02em] leading-[1.3]">{{ feature.title }}</h1>
        <p class="text-sm text-white-28 leading-[1.7] max-w-[520px]">{{ feature.description }}</p>
      </header>

      <main class="fr-body text-white-55 text-base leading-[2.1]" v-html="bodyHtml" @click="onBodyClick" />
    </template>

    <div v-else class="text-center text-white-10 py-32">{{ t('loading') }}</div>

    <EntryDetailCardNext v-if="modalItem" :item="modalItem" @close="closeModal" @navigate="onNavigate" />
  </div>
</template>

<style scoped>
/* v-html 渲染的 markdown 正文与内联词条卡片（运行时生成，无法用模板工具类标注，保留 :deep 样式） */
.fr-body :deep(h1), .fr-body :deep(h2) {
  font-size: 1.15rem; font-weight: 700; color: var(--white-70); margin: 2.5rem 0 0.8rem;
}
.fr-body :deep(p) { margin-bottom: 1.1rem; }
.fr-body :deep(strong) { color: var(--white-72); font-weight: 700; }
.fr-body :deep(ol), .fr-body :deep(ul) { padding-left: 1.2rem; margin-bottom: 1.1rem; }
.fr-body :deep(li) { margin-bottom: 0.3rem; }

/* ---- 内联词条卡片 ---- */
.fr-body :deep(.fi-card) {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.6rem;
  width: 100%;
  margin: 1.6rem 0;
  padding: 1rem 1.2rem;
  border: 1px solid var(--white-06);
  border-left: 2px solid var(--white-15);
  border-radius: 6px;
  background: var(--white-015);
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
}
.fr-body :deep(.fi-card:hover) {
  background: var(--white-035);
  border-color: var(--white-10);
  border-left-color: var(--white-30);
}
.fr-body :deep(.fi-card .fic-title) {
  font-size: 1rem; font-weight: 800;
}
.fr-body :deep(.fi-card .fic-cat) {
  font-size: var(--font-tiny); color: var(--white-18); letter-spacing: 0.04em;
}
.fr-body :deep(.fi-card .fic-desc) {
  width: 100%; font-size: var(--font-xs); color: var(--white-25); line-height: 1.65; margin-top: 0.1rem;
}
.fr-body :deep(.fi-missing) {
  color: var(--white-15); font-size: var(--font-sm); font-style: italic;
}
</style>
