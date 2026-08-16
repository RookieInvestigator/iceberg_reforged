<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { parseFM } from '../lib/md'
import { useI18n } from '../lib/useI18n'

const { t } = useI18n()

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
      // 复用 lib/md.ts 的 parseFM（与 FeatureDetailView 同源，正确处理含冒号值与列表值，P1-43）
      const fm = parseFM(m[1])
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
  <div class="min-h-screen max-w-[900px] mx-auto px-4 pt-6 pb-16 sm:px-8 sm:pt-12 sm:pb-24">
    <header class="mb-12">
      <h1 class="text-[2rem] font-black text-white-92 mb-2 tracking-[0.03em]">{{ t('featuresTitle') }}</h1>
      <p class="text-white-35 text-base leading-[1.6]">{{ t('featuresIntro') }}</p>
    </header>

    <div class="grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      <article
        v-for="f in features"
        :key="f.slug"
        class="group bg-white-02 border border-white-05 rounded-lg p-6 cursor-pointer transition-colors duration-200 hover:border-white-12 hover:bg-white-04"
        role="button"
        tabindex="0"
        @click="go(f.slug)"
        @keydown.enter="go(f.slug)"
        @keydown.space.prevent="go(f.slug)"
      >
        <time class="text-xs text-white-20 uppercase tracking-[0.08em]">{{ f.date }}</time>
        <h2 class="text-[1.15rem] font-bold text-white-85 my-2 leading-[1.4]">{{ f.title }}</h2>
        <p class="text-sm text-white-35 leading-[1.6] line-clamp-3">{{ f.description }}</p>
        <span class="inline-block mt-3 text-sm text-white-25 transition-colors duration-200 group-hover:text-white-55">{{ t('featuresRead') }}</span>
      </article>
    </div>

    <div v-if="features.length === 0" class="text-center text-white-20 py-16 text-base">
      {{ t('featuresEmpty') }}
    </div>
  </div>
</template>
