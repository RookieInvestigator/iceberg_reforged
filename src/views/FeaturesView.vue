<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface FeatureMeta {
  slug: string
  title: string
  date: string
  description: string
}

const modules = import.meta.glob('../data/features/*.md', { query: '?raw', import: 'default', eager: true })

const features = computed<FeatureMeta[]>(() =>
  Object.entries(modules)
    .map(([path, raw]) => {
      const m = (raw as string).match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!m) return null
      const fm: Record<string, string> = {}
      for (const line of m[1].split(/\r?\n/)) {
        const sep = line.indexOf(':')
        if (sep === -1) continue
        fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim()
      }
      const slug = path.split('/').pop()!.replace('.md', '')
      return { slug, title: fm.title, date: fm.date, description: fm.description } as FeatureMeta
    })
    .filter(Boolean)
    .sort((a, b) => b!.date.localeCompare(a!.date)) as FeatureMeta[]
)

const router = useRouter()
function go(slug: string) { router.push(`/features/${slug}`) }
</script>

<template>
  <div class="features-page">
    <header class="features-header">
      <h1>专题</h1>
      <p>编辑精选，串联词条，深入探索中文互联网怪谈的隐秘脉络。</p>
    </header>

    <div class="features-grid">
      <article
        v-for="f in features"
        :key="f.slug"
        class="feature-card"
        tabindex="0"
        @click="go(f.slug)"
        @keydown.enter="go(f.slug)"
        @keydown.space.prevent="go(f.slug)"
      >
        <time class="feature-date">{{ f.date }}</time>
        <h2 class="feature-title">{{ f.title }}</h2>
        <p class="feature-desc">{{ f.description }}</p>
        <span class="feature-link">阅读 →</span>
      </article>
    </div>

    <div v-if="features.length === 0" class="features-empty">
      暂无专题文章。
    </div>
  </div>
</template>

<style scoped>
.features-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 3rem 2rem 6rem;
  min-height: 100vh;
}
.features-header {
  margin-bottom: 3rem;
}
.features-header h1 {
  font-size: 2rem;
  font-weight: 900;
  color: rgba(255,255,255,0.92);
  margin-bottom: 0.5rem;
  letter-spacing: 0.03em;
}
.features-header p {
  color: rgba(255,255,255,0.35);
  font-size: 0.95rem;
  line-height: 1.6;
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}
.feature-card {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 1.5rem;
  cursor: pointer;
  transition: border-color 0.25s, background 0.25s;
}
.feature-card:hover {
  border-color: rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
}
.feature-date {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.2);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.feature-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
  margin: 0.5rem 0 0.6rem;
  line-height: 1.4;
}
.feature-desc {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.35);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.feature-link {
  display: inline-block;
  margin-top: 0.8rem;
  font-size: 0.8rem;
  color: rgba(255,255,255,0.25);
  transition: color 0.2s;
}
.feature-card:hover .feature-link { color: rgba(255,255,255,0.55); }
.features-empty {
  text-align: center;
  color: rgba(255,255,255,0.2);
  padding: 4rem 0;
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .features-page { padding: 1.5rem 1rem 4rem; }
  .features-grid { grid-template-columns: 1fr; }
}
</style>
