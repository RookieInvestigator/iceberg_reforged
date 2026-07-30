<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import csvRaw from '../data/on-this-day.csv?raw'
import { parseCSV } from '../lib/csv'
import raw from '../data/iceberg.json'
import { normalizeData } from '../lib/data'

const router = useRouter()

const sections = [
  { path: '/features',     label: '专题', sub: '编辑精选' },
  { path: '/handbook',     label: '手册', sub: '术语索引' },
  { path: '/ancient-book', label: '古籍', sub: '线装书' },
  { path: '/3d',           label: '3D',   sub: '立体冰山' },
]

const data = normalizeData(raw)
const entryCount = computed(() => Object.values(data.tiers).flat().length)
const tierCount = computed(() => data.tierOrder.length)
const categoryCount = computed(() => Object.keys(data.categoryColors).length)

const allEvents = parseCSV(csvRaw)
const today = new Date()
const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const todayEvent = computed(() => allEvents.find((e: any) => e.date === mmdd) || null)

function goItem(itemId: string) {
  if (itemId) router.push({ path: '/', query: { item: itemId } })
}
</script>

<template>
  <div class="home">
    <!-- 标题 -->
    <header>
      <h1>中文兔子洞冰山图</h1>
      <p>Chinese Oddities Iceberg</p>
    </header>

    <!-- 冰山图大卡 -->
    <button class="iceberg" @click="router.push('/')">
      <div class="iceberg-inner">
        <span>▲</span>
        <h2>冰山图</h2>
        <p>{{ entryCount }} 个词条 · {{ tierCount }} 个层级 · {{ categoryCount }} 种分类</p>
      </div>
    </button>

    <!-- 入口 -->
    <nav class="nav">
      <button v-for="s in sections" :key="s.path" @click="router.push(s.path)">
        <span>{{ s.label }}</span>
        <small>{{ s.sub }}</small>
      </button>
    </nav>

    <!-- 历史上的今天 -->
    <article class="otd" v-if="todayEvent">
      <div class="otd-meta">
        <span>{{ today.getMonth() + 1 }} 月 {{ today.getDate() }} 日</span>
        <router-link to="/on-this-day">历史上的今天</router-link>
      </div>
      <p class="otd-year">{{ todayEvent.year }}</p>
      <h3 :class="{ link: todayEvent.item }" tabindex="0" role="button" @click="goItem(todayEvent.item)" @keydown.enter="goItem(todayEvent.item)" @keydown.space.prevent="goItem(todayEvent.item)">{{ todayEvent.title }}</h3>
      <p class="otd-desc">{{ todayEvent.desc }}</p>
    </article>

    <article class="otd" v-else>
      <div class="otd-meta">
        <span>{{ today.getMonth() + 1 }} 月 {{ today.getDate() }} 日</span>
        <router-link to="/on-this-day">历史上的今天</router-link>
      </div>
      <p class="otd-desc" style="opacity:0.4">今天暂无记录。</p>
    </article>

    <footer>社区共建项目</footer>
  </div>
</template>

<style scoped>
/* ═══════ 整体 ═══════ */
.home {
  min-height: 100dvh;
  max-width: 820px;
  margin: 0 auto;
  padding: 3rem 2.5rem 4rem;
  display: flex; flex-direction: column;
  justify-content: center;
  gap: 1.6rem;
}

/* ═══════ 标题 ═══════ */
.home header { text-align: center; }
.home header h1 {
    font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 300;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.08em;
}
.home header p {
  margin-top: 0.35rem;
  font-size: 0.68rem;
  color: rgba(255,255,255,0.12);
  letter-spacing: 0.16em;
}

/* ═══════ 冰山图大卡 ═══════ */
.iceberg {
  width: 100%;
  aspect-ratio: 3 / 1;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 14px;
  cursor: pointer;
  background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.025) 0%, transparent 70%);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.4s, background 0.4s;
  position: relative; overflow: hidden;
}
.iceberg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 80% at 50% 50%, rgba(255,255,255,0.015) 0%, transparent 70%);
  opacity: 0; transition: opacity 0.4s;
}
.iceberg:hover {
  border-color: rgba(255,255,255,0.12);
  background: radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,255,255,0.04) 0%, transparent 70%);
}
.iceberg:hover::after { opacity: 1; }

.iceberg-inner {
  position: relative; z-index: 1; text-align: center;
}
.iceberg-inner span {
  font-size: 2.4rem; line-height: 1;
  color: rgba(255,255,255,0.05);
  display: block; margin-bottom: 0.5rem;
}
.iceberg-inner h2 {
  font-size: 1.4rem; font-weight: 500; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.7);
  }
.iceberg-inner p {
  margin-top: 0.4rem;
  font-size: 0.72rem; color: rgba(255,255,255,0.18);
  letter-spacing: 0.06em;
}

/* ═══════ 入口导航 ═══════ */
.nav {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;
}
.nav button {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.25rem; padding: 1rem 0.5rem;
  background: transparent; border: 1px solid rgba(255,255,255,0.035); border-radius: 8px;
  cursor: pointer; transition: border-color 0.25s, background 0.25s;
}
.nav button:hover { border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.015); }
.nav button span {
  font-size: 0.82rem; font-weight: 500; color: rgba(255,255,255,0.55);
}
.nav button small {
  font-size: 0.6rem; color: rgba(255,255,255,0.15);
}

/* ═══════ 历史上的今天 ═══════ */
.otd {
  border-top: 1px solid rgba(255,255,255,0.04);
  padding-top: 1.2rem;
}
.otd-meta {
  display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.8rem;
}
.otd-meta span {
  font-size: 0.7rem; color: rgba(255,255,255,0.22); letter-spacing: 0.04em;
}
.otd-meta a {
  font-size: 0.62rem; color: rgba(255,255,255,0.12); text-decoration: none;
  letter-spacing: 0.06em; margin-left: auto; transition: color 0.2s;
}
.otd-meta a:hover { color: rgba(255,255,255,0.3); }

.otd-year {
  font-size: 0.7rem; color: rgba(255,255,255,0.16);
  letter-spacing: 0.08em; margin-bottom: 0.25rem;
}
.otd h3 {
  font-size: 1.1rem; font-weight: 500; color: rgba(255,255,255,0.6);
  line-height: 1.45; letter-spacing: 0.02em;
  }
.otd h3.link { cursor: pointer; transition: color 0.25s; }
.otd h3.link:hover { color: rgba(255,255,255,0.85); }

.otd-desc {
  margin-top: 0.5rem;
  font-size: 0.82rem; color: rgba(255,255,255,0.28); line-height: 1.75;
  max-width: 600px;
}

/* ═══════ 底部 ═══════ */
.home > footer {
  text-align: center;
  font-size: 0.6rem; color: rgba(255,255,255,0.06);
  letter-spacing: 0.06em;
}

@media (max-width: 640px) {
  .home { padding: 2rem 1.25rem 3rem; gap: 1.25rem; justify-content: flex-start; }
  .iceberg { aspect-ratio: 2 / 1; }
  .nav { grid-template-columns: repeat(2, 1fr); }
}
</style>
