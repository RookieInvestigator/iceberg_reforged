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
  <div class="min-h-screen max-w-[780px] mx-auto flex flex-col sm:flex-row pt-8 px-4 pb-20 sm:pt-16 sm:pr-8 sm:pb-32 sm:pl-16">
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
    <main class="flex-1 min-w-0">
      <h1 class="text-[1.6rem] font-extrabold text-white-85 tracking-[0.02em] mb-10">手册</h1>

      <div v-for="letter in Object.keys(groups).sort()" :key="letter" class="mb-6">
        <h2 :id="`hb-${letter}`" class="sticky top-0 max-sm:top-[57px] bg-surface z-[2] text-[1.3rem] font-extrabold text-white-18 pt-3 pb-2 mb-3 border-b border-white-05">{{ letter }}</h2>

        <article v-for="e in groups[letter]" :key="e.name" class="mb-6">
          <h3 class="text-base font-bold text-white-70 mb-1.5 leading-[1.4] flex items-baseline gap-1.5 flex-wrap">
            <span v-if="e.emoji" class="text-sm leading-none">{{ e.emoji }}</span>
            <span :style="e.color ? { color: e.color } : {}">{{ e.name }}</span>
            <small class="text-micro font-normal text-white-12 tracking-[0.06em] ml-0.5">{{ e.kind }}</small>
          </h3>
          <p class="text-sm text-white-40 leading-[1.85] max-w-[620px]">{{ e.desc }}</p>
        </article>
      </div>

      <footer class="mt-16 pt-4 border-t border-white-03 text-micro text-white-08">
        {{ new Date(data.generatedAt * 1000).toLocaleDateString('zh-CN') }} · {{ allItems.length }} 词条 · {{ entries.length }} 条目
      </footer>
    </main>
  </div>
</template>

<style scoped>
/* A-Z 侧栏导航：桌面固定左侧（calc 定位随 780px 版心对齐），移动端 sticky 顶部；
   .hb-nav-btn 的 on/now 状态为动态类 + 复合 hover，保留 scoped 以保证优先级确定性 */
.hb-nav {
  position: fixed;
  top: 50%; transform: translateY(-50%);
  left: max(6px, calc((100vw - 780px) / 2 - 44px));
  display: flex; flex-direction: column;
  z-index: 30;
}
.hb-nav-btn {
  width: 24px; height: 20px;
  border: none; background: none;
  font-size: var(--font-tiny); font-weight: 600; color: var(--white-08);
  border-radius: 3px; cursor: default; transition: color 0.15s, background 0.15s;
  display: flex; align-items: center; justify-content: center;
}
.hb-nav-btn.on { color: var(--white-22); cursor: pointer; }
.hb-nav-btn.on:hover { color: var(--white-55); background: var(--white-05); }
.hb-nav-btn.now { color: var(--white-80); background: var(--white-08); }

@media (max-width: 640px) {
  .hb-nav {
    position: sticky; top: 0; left: auto; transform: none; z-index: 10;
    flex-direction: row; width: calc(100% + 2rem); margin: 0 -1rem;
    padding: 0.4rem 0.5rem; overflow-x: auto;
    background: var(--color-surface); border-bottom: 1px solid var(--white-04);
  }
  /* 触摸目标 ≥44px，视觉文字大小不变 */
  .hb-nav-btn { width: auto; height: 44px; padding: 0 0.25rem; font-size: var(--font-micro); }
}
</style>
