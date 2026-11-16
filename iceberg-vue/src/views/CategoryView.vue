<script setup lang="ts">
/**
 * 分类聚合页（`/category/<slug>/`）。
 *
 * 为什么需要这一页：词条本身没有独立 URL（深链是 `/#<id>` 的 hash，hash 不参与
 * HTTP 请求，对搜索引擎等于不存在），于是全站可索引的正文一度只有 8 个页面。
 * 分类聚合页把「同一分类下的全部词条标题 + 正文」放进一个真实 URL：
 * 1461 条正文 100% 进 HTML，而页面数只有 15 个（体积约为逐条预渲染的 1/22）。
 *
 * 数据装配走 `useIcebergDataSource()`（与主图同一条链路），因此副表订正过的
 * 标题/正文、`categories.csv` 的副分类、`overrides.csv` 的覆盖值都会一致生效；
 * 用原始 `item.category` 筛选会漏掉副表里挂了副分类的词条。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, TriangleAlert } from '@lucide/vue'
import { useIcebergDataSource } from '../lib/iceberg/useIcebergDataSource'
import { categoryFromSlug, categorySlug } from '../lib/iceberg/categorySlug'
import { itemCategories } from '../lib/iceberg/extraCategories'
import { useI18n } from '../lib/useI18n'
import FlowBackground from '../components/layout/FlowBackground.vue'
import RichText from '../components/ui/RichText.vue'

const route = useRoute()
const { t } = useI18n()
const { allItemsRaw, data } = useIcebergDataSource()

const category = computed(() => categoryFromSlug(String(route.params.slug || '')))

/** 分类导航：顺序与 meta.json 的 categoryColors 一致（= 主图筛选栏顺序） */
const categories = computed(() =>
  Object.keys(data.categoryColors || {}).map((name) => ({
    name,
    slug: categorySlug(name),
    count: allItemsRaw.filter((it) => itemCategories(it).includes(name)).length,
  })),
)

const items = computed(() => {
  const name = category.value
  if (!name) return []
  return allItemsRaw
    .filter((it) => itemCategories(it).includes(name))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
})

const color = computed(() => (category.value ? data.categoryColors[category.value] : '') || data.defaultColor)

function entryHash(id: string) {
  return `#${id}`
}

/** 分类下没有描述的词条：正文空着会变成薄内容页，统一给一句可读的说明 */
const noDesc = computed(() => t('noDescShort'))
</script>

<template>
  <!-- 未知 slug：不渲染任何词条，只给一句「页面不存在」。
       静态产物层由 prerender 输出 404 语义（canonical 跟随请求 URL），
       这里保证客户端接管后不会把乱码地址显示成有效分类页。 -->
  <div v-if="!category" class="fixed inset-0 flex items-center justify-center bg-surface font-sans">
    <div class="p-8 text-center">
      <h1 class="mb-4 text-8xl font-black leading-none text-white-03">404</h1>
      <p class="mb-8 text-base text-white-60">{{ t('notFoundText') }}</p>
      <router-link
        to="/"
        class="inline-block rounded-lg border border-white-12 px-8 py-2.5 text-sm text-white-80 no-underline transition-colors duration-200 hover:border-white-25 hover:bg-white-05 hover:text-white-60"
      >{{ t('notFoundBack') }}</router-link>
    </div>
  </div>

  <div v-else class="relative min-h-screen bg-surface">
    <FlowBackground />

    <div class="relative z-10 mx-auto max-w-[1040px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-24">
      <header class="mb-8">
        <router-link to="/" class="mb-2 inline-flex items-center gap-1.5 text-xs text-white-40 transition-colors hover:text-white-85">
          <ArrowLeft :size="14" :stroke-width="2" aria-hidden="true" />
          <span>{{ t('navIceberg') }}</span>
        </router-link>
        <h1 class="h1-display flex items-center gap-3">
          <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: color }" aria-hidden="true"></span>
          {{ category }}
        </h1>
        <p class="max-w-2xl text-sm leading-[1.7] text-white-35 sm:text-base">
          {{ t('categoryCount').replace('{count}', String(items.length)) }}
        </p>
      </header>

      <!-- 分类导航：15 个分类互相链接，避免聚合页成为孤岛（爬虫靠内链发现 + 分权） -->
      <nav class="mb-10 flex flex-wrap gap-2" :aria-label="t('categories')">
        <router-link
          v-for="cat in categories"
          :key="cat.slug"
          :to="`/category/${cat.slug}/`"
          class="rounded-full border px-3 py-1 text-xs transition-colors"
          :class="cat.name === category
            ? 'border-white-30 bg-white-12 text-white-92'
            : 'border-white-08 bg-white-03 text-white-45 hover:border-white-20 hover:text-white-85'"
          :aria-current="cat.name === category ? 'page' : undefined"
        >
          {{ cat.name }}<span class="ml-1.5 text-white-25">{{ cat.count }}</span>
        </router-link>
      </nav>

      <div class="divide-y divide-white-05">
        <article v-for="item in items" :key="item.id" class="py-6 first:pt-0">
          <h2 class="flex items-baseline gap-2 text-base font-bold leading-[1.4] text-white-92">
            <router-link :to="{ path: '/', hash: entryHash(item.id) }" class="transition-colors hover:text-accent-soft">
              {{ item.title }}
            </router-link>
          </h2>
          <p class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-tiny text-white-30">
            <span>{{ item.tier }}</span>
            <span v-for="(tag, i) in item.tags" :key="tag" class="text-white-35">
              {{ item.emojis?.[i] || '·' }} {{ tag }}
            </span>
          </p>
          <RichText v-if="item.desc" class="mt-2.5 max-w-[680px] text-sm leading-[1.85] text-white-65" :text="item.desc" />
          <p v-else class="mt-2.5 text-sm text-white-25">{{ noDesc }}</p>
        </article>
      </div>

      <p v-if="!items.length" class="rounded-xl border border-dashed border-white-08 bg-white-02 px-6 py-12 text-center text-sm text-white-35">
        {{ t('noResults') }}
      </p>

      <footer class="mt-14 flex items-center gap-2 border-t border-white-04 pt-4 text-xs text-white-30">
        <TriangleAlert :size="12" :stroke-width="2.2" aria-hidden="true" />
        <span>{{ t('markWarn') }}</span>
      </footer>
    </div>
  </div>
</template>
