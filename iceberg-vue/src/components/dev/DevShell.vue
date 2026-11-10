<script setup lang="ts">
// DEV 页面外壳：一条细顶栏（DEV 徽章 + 页面切换 + 返回）、紧凑页头、内容区。
// 两种布局：
//  - page：整页滚动（数据总览这类长页面）
//  - fill：满高不滚动，内容自己管滚动（编辑器 / 工作台）
// 只在 import.meta.env.DEV 注册的路由里使用，生产构建整块被摇掉。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import '../../styles/dev.css'

withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    layout?: 'page' | 'fill'
  }>(),
  { layout: 'page', subtitle: '' },
)

const route = useRoute()

const PAGES = [
  { path: '/dev-data', label: '数据总览' },
  { path: '/words', label: '词条星图' },
  { path: '/appendix-edit', label: '副表编辑' },
  { path: '/appendix-tables', label: '整表编辑' },
  { path: '/feedback-review', label: '反馈审核' },
  { path: '/dive', label: '深潜巡游' },
] as const

const isActive = computed(() => (path: string) => route.path === path)
</script>

<template>
  <main class="dev-page" :class="`dev-shell--${layout}`">
    <!-- 顶栏压成一行：徽章 + 页面切换 + 返回，不单独占一块 -->
    <div class="dev-content dev-topbar">
      <span class="dev-badge">DEV</span>
      <nav class="dev-tabs" aria-label="DEV 页面">
        <router-link
          v-for="p in PAGES"
          :key="p.path"
          :to="p.path"
          class="dev-tab"
          :class="{ 'is-active': isActive(p.path) }"
        >{{ p.label }}</router-link>
      </nav>
      <router-link to="/home" class="dev-back">← 返回首页</router-link>
    </div>

    <div class="dev-content dev-body">
      <div class="dev-head-row">
        <header class="dev-head">
          <h1 class="dev-title">{{ title }}</h1>
          <p v-if="subtitle || $slots.subtitle" class="dev-sub">
            <slot name="subtitle">{{ subtitle }}</slot>
          </p>
        </header>
        <div v-if="$slots.actions" class="dev-head-actions">
          <slot name="actions" />
        </div>
      </div>
      <slot />
    </div>
  </main>
</template>
