<script setup lang="ts">
import { computed, ref } from 'vue'
import { normalizeData } from '../lib/data'
import rawData from '../data/iceberg.json'
import rawMd from '../data/handbook.md?raw'
import { getFirstInitial } from '../lib/pinyin'

const data = normalizeData(rawData)
const allItems = Object.values(data.tiers).flat()

function parseSections(md: string) {
  const result: Record<string, Record<string, string>> = {}
  const parts = md.split(/\r?\n## /)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const sectionName = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const subs: Record<string, string> = {}
    const blocks = body.split(/\r?\n### /)
    for (const block of blocks) {
      const sn = block.indexOf('\n')
      if (sn === -1) continue
      const name = block.slice(0, sn).trim()
      const rest = block.slice(sn + 1)
      const end = rest.search(/\n(?:### |## )/)
      const desc = end === -1 ? rest.trim() : rest.slice(0, end).trim()
      if (name && desc) subs[name] = desc
    }
    if (Object.keys(subs).length > 0) result[sectionName] = subs
  }
  return result
}

const sections = parseSections(rawMd)
const catDescs = sections['分类'] || {}
const tagDescs = sections['标签'] || {}

interface Entry { initial: string; name: string; desc: string; color?: string; emoji?: string; kind: string }

const entries = computed<Entry[]>(() => {
  const list: Entry[] = []

  for (const [name, color] of Object.entries(data.categoryColors)) {
    if (catDescs[name]) list.push({ initial: getFirstInitial(name), name, desc: catDescs[name], color, kind: '分类' })
  }
  for (const [emoji, name] of Object.entries(data.tagMap)) {
    if (tagDescs[name]) list.push({ initial: getFirstInitial(name), name, desc: tagDescs[name], emoji, kind: '标签' })
  }
  const termsMatch = rawMd.match(/## 名词\n([\s\S]*)$/)
  if (termsMatch) {
    const blocks = termsMatch[1].split(/\n### /)
    for (const block of blocks) {
      const sn = block.indexOf('\n')
      if (sn === -1) continue
      const name = block.slice(0, sn).trim()
      const rest = block.slice(sn + 1)
      const end = rest.search(/\n(?:### |## )/)
      const desc = end === -1 ? rest.trim() : rest.slice(0, end).trim()
      if (name && desc) list.push({ initial: getFirstInitial(name), name, desc, kind: '名词' })
    }
  }

  list.sort((a, b) => a.initial.localeCompare(b.initial) || a.name.localeCompare(b.name))
  return list
})

const groups = computed(() => {
  const map: Record<string, Entry[]> = {}
  for (const e of entries.value) {
    if (!map[e.initial]) map[e.initial] = []
    map[e.initial].push(e)
  }
  return map
})

const letters = computed(() => {
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(l => ({
    letter: l, active: !!groups.value[l]
  }))
})

const activeLetter = ref('')
function scrollTo(l: string) {
  activeLetter.value = l
  document.getElementById(`hb-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="hb-root">
    <!-- A-Z 跳转栏 -->
    <nav class="hb-nav">
      <button
        v-for="l in letters" :key="l.letter"
        :class="['hb-nav-btn', { on: l.active, now: activeLetter === l.letter }]"
        :disabled="!l.active"
        @click="scrollTo(l.letter)"
      >{{ l.letter }}</button>
    </nav>

    <!-- 正文 -->
    <main class="hb-body">
      <h1>手册</h1>

      <div v-for="letter in Object.keys(groups).sort()" :key="letter" class="hb-group">
        <h2 :id="`hb-${letter}`">{{ letter }}</h2>

        <article v-for="e in groups[letter]" :key="e.name" class="hb-entry">
          <h3>
            <span v-if="e.emoji" class="hb-emoji">{{ e.emoji }}</span>
            <span :style="e.color ? { color: e.color } : {}">{{ e.name }}</span>
            <small>{{ e.kind }}</small>
          </h3>
          <p>{{ e.desc }}</p>
        </article>
      </div>

      <footer>
        {{ new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN') }} · {{ allItems.length }} 词条 · {{ entries.length }} 条目
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* ── 整体 ── */
.hb-root {
  display: flex;
  max-width: 780px;
  margin: 0 auto;
  padding: 4rem 2rem 8rem 4rem;
  min-height: 100vh;
}

/* ── A-Z 侧栏 ── */
.hb-nav {
  position: fixed;
  top: 50%; transform: translateY(-50%);
  left: max(6px, calc((100vw - 780px) / 2 - 44px));
  display: flex; flex-direction: column; gap: 0;
  z-index: 30;
}
.hb-nav-btn {
  width: 24px; height: 20px;
  border: none; background: none;
  font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.08);
  border-radius: 3px; cursor: default; transition: color 0.15s, background 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.hb-nav-btn.on { color: rgba(255,255,255,0.22); cursor: pointer; }
.hb-nav-btn.on:hover { color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.05); }
.hb-nav-btn.now { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.08); }

/* ── 正文区 ── */
.hb-body { flex: 1; min-width: 0; }
.hb-body > h1 {
  font-size: 1.6rem; font-weight: 800; color: rgba(255,255,255,0.85);
  letter-spacing: 0.02em; margin-bottom: 2.5rem;
}

/* ── 字母分组 ── */
.hb-group { margin-bottom: 1.5rem; }
.hb-group > h2 {
  font-size: 1.3rem; font-weight: 800; color: rgba(255,255,255,0.18);
  padding: 0.8rem 0 0.5rem; margin-bottom: 0.8rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  position: sticky; top: 0; background: #0a0a0a; z-index: 2;
}

/* ── 条目 ── */
.hb-entry { margin-bottom: 1.6rem; }
.hb-entry h3 {
  font-size: 0.95rem; font-weight: 700; color: rgba(255,255,255,0.7);
  margin-bottom: 0.4rem; line-height: 1.4;
  display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap;
}
.hb-entry h3 small {
  font-size: 0.58rem; font-weight: 400; color: rgba(255,255,255,0.12);
  letter-spacing: 0.06em; margin-left: 0.15rem;
}
.hb-emoji { font-size: 0.85rem; line-height: 1; }

.hb-entry p {
  font-size: 0.85rem; color: rgba(255,255,255,0.4); line-height: 1.85;
  max-width: 620px;
}

/* ── 底部 ── */
.hb-body > footer {
  margin-top: 4rem; padding-top: 1rem;
  border-top: 1px solid rgba(255,255,255,0.03);
  font-size: 0.62rem; color: rgba(255,255,255,0.08);
}

/* ── 移动端 ── */
@media (max-width: 860px) {
  .hb-root { flex-direction: column; padding: 2rem 1rem 5rem; }
  .hb-nav {
    position: sticky; top: 0; left: auto; transform: none; z-index: 10;
    flex-direction: row; width: calc(100% + 2rem); margin: 0 -1rem;
    padding: 0.4rem 0.5rem; overflow-x: auto; gap: 0;
    background: #0a0a0a; border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .hb-nav-btn { width: auto; height: 22px; padding: 0 0.25rem; font-size: 10px; }
  .hb-group > h2 { top: 30px; }
}
</style>
