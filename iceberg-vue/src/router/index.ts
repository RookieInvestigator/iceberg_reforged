import { createRouter, createWebHistory } from 'vue-router'
import { redirectGuard } from '../lib/redirectGuard'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/',             component: () => import('../views/IndexView.vue') },
    { path: '/home',         component: () => import('../views/HomeView.vue') },
    { path: '/handbook',     component: () => import('../views/HandbookView.vue') },
    { path: '/features',     component: () => import('../views/FeaturesView.vue') },
    { path: '/features/:slug', component: () => import('../views/FeatureDetailView.vue') },
    { path: '/minimal',      redirect: '/' },
    { path: '/on-this-day',  component: () => import('../views/OnThisDayView.vue') },
    { path: '/ancient-book', component: () => import('../views/AncientBookView.vue') },
    { path: '/3d',           component: () => import('../views/Iceberg3DView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
})

// 开发专用路由：构建时 tree-shake 掉
if (import.meta.env.DEV) {
  router.addRoute({ path: '/appendix-edit', component: () => import('../views/AppendixEditView.vue') })
}

// P1-13：消费 404.html 重定向携带的 ?r=（原始 path + search + hash 的一次 encodeURIComponent），
// 还原为目标路由并 replace 跳转；r 参数同时从地址栏移除，避免二次匹配。
// 非法/空 r 仅清理参数、停留在当前路径，不产生跳转循环。
router.beforeEach(redirectGuard)

// P1-2：canonical / og:url 跟随当前路由，但 origin 强制指向主站（主从镜像策略）。
// 无论用户访问 Cloudflare（主站）还是 GitHub Pages（镜像），canonical 都指向主站，
// 让搜索引擎把权重归并到主站。镜像通过构建期 noindex meta 做双保险。
// 模板不写死这两个标签：构建期预渲染按路由注入，浏览器端不存在时由这里创建。
const MASTER_ORIGIN = 'https://iceberg-reforged.pages.dev'
router.afterEach((to) => {
  const url = new URL(to.fullPath, MASTER_ORIGIN).href
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.appendChild(canonical)
  }
  canonical.href = url

  let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
  if (!ogUrl) {
    ogUrl = document.createElement('meta')
    ogUrl.setAttribute('property', 'og:url')
    document.head.appendChild(ogUrl)
  }
  ogUrl.content = url
})

export default router
