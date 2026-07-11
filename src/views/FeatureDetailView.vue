<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { renderMd } from '../lib/md'
import { normalizeData } from '../lib/data'
import rawData from '../data/iceberg.json'
import ItemModal from '../components/items/ItemModal.vue'

const route = useRoute()
const router = useRouter()
const slug = computed(() => route.params.slug as string)

const data = normalizeData(rawData)
const allItems = Object.values(data.tiers).flat().map((i: any) => markRaw({ ...i }))
const itemMap = new Map(allItems.map(i => [i.id, i]))

const feature = ref<any>(null)
const bodyHtml = ref('')
const cardRefs = ref<Map<string, HTMLElement>>(new Map())
const modalItem = ref<any>(null)

const modules = import.meta.glob('../data/features/*.md', { query: '?raw', import: 'default', eager: true })

function parseFM(yaml: string): Record<string, any> {
  const fm: Record<string, any> = {}
  const lines = yaml.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const sep = line.indexOf(':')
    if (sep === -1) { i++; continue }
    const key = line.slice(0, sep).trim()
    let val: any = line.slice(sep + 1).trim()
    if (val === '' || val === '[]') {
      const list: string[] = []
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) { i++; list.push(lines[i].replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, '').trim()) }
      if (list.length > 0) val = list
    }
    fm[key] = val
    i++
  }
  return fm
}

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

  const m = (raw as string).match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) { router.replace('/features'); return }

  const fm = parseFM(m[1])
  let ids: string[] = []
  if (Array.isArray(fm.items)) ids = fm.items.filter(Boolean)

  const items: any[] = []
  for (const id of ids) {
    const it = itemMap.get(id)
    if (!it) continue
    items.push({ id, title: it.title, category: it.category, categoryColor: (it as any).categoryColor || '#fff', desc: (it as any).desc || '', tags: it.tags || [], link: (it as any).link || '' })
  }

  feature.value = { title: fm.title, date: fm.date, description: fm.description, items }

  // 渲染正文，[item:ID] → 内联卡片 HTML
  // [item:ID] → 占位符，避免被 renderMd 转义
  const cards: Record<string, string> = {}
  let text = m[2].trim()
  text = text.replace(/\[item:([a-f0-9]+)\]/g, (_, id: string) => {
    const it = items.find((i: any) => i.id === id)
    if (!it) return `[未知词条: ${id}]`
    const desc = it.desc ? `<span class="fic-desc">${it.desc.slice(0, 120)}${it.desc.length > 120 ? '…' : ''}</span>` : ''
    const ph = `\x00CARD_${id}\x00`
    cards[ph] = `<span class="fi-card" data-item-id="${id}"><span class="fic-title" style="color:${it.categoryColor}">${it.title}</span><span class="fic-cat">${it.category}</span>${desc}</span>`
    return ph
  })

  let html = renderMd(text)
  for (const [ph, card] of Object.entries(cards)) {
    html = html.replace(ph, card)
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
  <div class="fr">
    <button class="fr-back" @click="router.push('/features')">← 专题列表</button>

    <template v-if="feature">
      <header class="fr-head">
        <time>{{ feature.date }}</time>
        <h1>{{ feature.title }}</h1>
        <p>{{ feature.description }}</p>
      </header>

      <main class="fr-body" v-html="bodyHtml" @click="onBodyClick" />
    </template>

    <div v-else class="fr-loading">加载中…</div>

    <ItemModal v-if="modalItem" :item="modalItem" @close="closeModal" @navigate="onNavigate" />
  </div>
</template>

<style scoped>
.fr { max-width: 720px; margin: 0 auto; padding: 3rem 2rem 8rem; min-height: 100vh; }

.fr-back {
  display: inline-block; background: none; border: none;
  color: rgba(255,255,255,0.2); font-size: 0.76rem; cursor: pointer;
  padding: 0 0 2rem; transition: color 0.25s; letter-spacing: 0.04em;
}
.fr-back:hover { color: rgba(255,255,255,0.5); }

.fr-head { margin-bottom: 3rem; }
.fr-head time { font-size: 0.68rem; color: rgba(255,255,255,0.14); letter-spacing: 0.1em; }
.fr-head h1 {
  font-size: clamp(1.6rem, 4vw, 2.2rem); font-weight: 900;
  color: rgba(255,255,255,0.88); margin: 0.5rem 0 0.7rem; letter-spacing: 0.02em; line-height: 1.3;
}
.fr-head p {
  font-size: 0.85rem; color: rgba(255,255,255,0.28); line-height: 1.7; max-width: 520px;
}

/* ---- 正文 ---- */
.fr-body {
  color: rgba(255,255,255,0.55); font-size: 0.92rem; line-height: 2.1;
}
.fr-body :deep(h1), .fr-body :deep(h2) {
  font-size: 1.15rem; font-weight: 700; color: rgba(255,255,255,0.7); margin: 2.5rem 0 0.8rem;
}
.fr-body :deep(p) { margin-bottom: 1.1rem; }
.fr-body :deep(strong) { color: rgba(255,255,255,0.72); font-weight: 700; }
.fr-body :deep(ol), .fr-body :deep(ul) { padding-left: 1.2rem; margin-bottom: 1.1rem; }
.fr-body :deep(li) { margin-bottom: 0.3rem; }

/* ---- 内联词条卡片 ---- */
.fr-body :deep(.fi-card) {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.6rem;
  width: 100%;
  margin: 1.6rem 0;
  padding: 1rem 1.2rem;
  border: 1px solid rgba(255,255,255,0.06);
  border-left: 2px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  background: rgba(255,255,255,0.015);
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
}
.fr-body :deep(.fi-card:hover) {
  background: rgba(255,255,255,0.035);
  border-color: rgba(255,255,255,0.1);
  border-left-color: rgba(255,255,255,0.3);
}
.fr-body :deep(.fi-card .fic-title) {
  font-size: 1rem; font-weight: 800;
}
.fr-body :deep(.fi-card .fic-cat) {
  font-size: 0.68rem; color: rgba(255,255,255,0.18); letter-spacing: 0.04em;
}
.fr-body :deep(.fi-card .fic-desc) {
  width: 100%; font-size: 0.78rem; color: rgba(255,255,255,0.25); line-height: 1.65; margin-top: 0.1rem;
}
.fr-body :deep(.fi-missing) {
  color: rgba(255,255,255,0.15); font-size: 0.8rem; font-style: italic;
}

.fr-loading { text-align: center; color: rgba(255,255,255,0.1); padding: 8rem 0; }

@media (max-width: 640px) {
  .fr { padding: 2rem 1rem 5rem; }
}
</style>
