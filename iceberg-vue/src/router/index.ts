import { createRouter, createWebHistory } from 'vue-router'
import { redirectGuard } from '../lib/redirectGuard'
import { canonicalUrl } from '../lib/site'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/',             component: () => import('../views/v2/IndexNextView.vue') },
    // 第一代主图入口保留为重定向，老书签不 404（归档见 data/archive/legacy-v1-2026-10/）
    { path: '/legacy',       redirect: '/' },
    { path: '/home',         component: () => import('../views/HomeView.vue') },
    { path: '/handbook',     component: () => import('../views/HandbookView.vue') },
    { path: '/features',     component: () => import('../views/FeaturesView.vue') },
    { path: '/features/:slug', component: () => import('../views/FeatureDetailView.vue') },
    // 分类聚合页：词条没有独立 URL（深链是 #id 的 hash），全站可索引正文一度只有 8 页。
    // 按 15 个分类聚合后，1461 条正文全部落在真实 URL 上（体积约等于逐条预渲染的 1/22）。
    { path: '/category/:slug',   component: () => import('../views/CategoryView.vue') },
    // 词条星图（/words）已降级为 DEV 专用页面，只在 import.meta.env.DEV 区块注册
    { path: '/minimal',      redirect: '/' },
    { path: '/v2',           redirect: '/' },
    { path: '/on-this-day',  component: () => import('../views/OnThisDayView.vue') },
    { path: '/ancient-book', component: () => import('../views/AncientBookView.vue') },
    // 沉浸式全屏画面：AppShell 据此隐藏公告条与自动弹窗（3D 冰山）
    { path: '/3d',           component: () => import('../views/Iceberg3DView.vue'), meta: { immersive: true } },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
  // 不配置的话浏览器保持原 scrollY：从长长的分类页滚到底点另一个分类，新页面直接停在
  // 34000px 处（实测），用户看到的是中段而非标题。三条例外各有理由：
  // - savedPosition：浏览器前进/后退还原原位置，这是「返回」该有的语义
  // - to.hash：词条深链是 #<8hex> 的会话态，页面里没有对应元素，交给 V2Interactivity
  //   弹窗；这里若返回 { top: 0 } 会抢走深链的落点
  // - path 相同（只换查询串）：页面内容没换，重排到顶部会打断正在看的位置
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return false
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

// 开发专用路由：构建时 tree-shake 掉
if (import.meta.env.DEV) {
  router.addRoute({ path: '/appendix-edit', component: () => import('../views/AppendixEditView.vue'), meta: { devTool: true } })
  // 副表整表编辑：按表组织（不按词条），直接铺开一张副表改行
  router.addRoute({ path: '/appendix-tables', component: () => import('../views/AppendixTablesView.vue'), meta: { devTool: true } })
  // 反馈审核工作台：读 entry_feedback（Supabase 或 CSV），决定落 data/feedback/decisions.json，
  // 再由 scripts/apply_feedback.py 写副表。生产构建不产出该路由与 chunk。
  // 开发模式：词条数据总览（分布 / 质量 / 手册覆盖），生产构建不产出
  router.addRoute({ path: '/dev-data', component: () => import('../views/DevDataView.vue'), meta: { devTool: true } })
  router.addRoute({ path: '/feedback-review', component: () => import('../views/FeedbackReviewView.vue'), meta: { devTool: true } })
  // 深潜巡游（/dive）：实验性 WebGL 页面，仅限本地开发访问，生产构建不产出路由与 chunk
  router.addRoute({ path: '/dive', component: () => import('../views/SubmarineDiveView.vue') })
  // 词条星图：把词条按「同分类 / 共标签」的关系摊在一张无限画布上。
  // 原本是正式路由，现降级为开发工具（外套 DevShell 顶栏，见 DEV 页面导航），
  // 生产构建不产出路由与 chunk，站内也不再有任何入口指向它。
  router.addRoute({ path: '/words', component: () => import('../views/WordsView.vue'), meta: { devTool: true } })
}

// P1-13：消费 404.html 重定向携带的 ?r=（原始 path + search + hash 的一次 encodeURIComponent），
// 还原为目标路由并 replace 跳转；r 参数同时从地址栏移除，避免二次匹配。
// 非法/空 r 仅清理参数、停留在当前路径，不产生跳转循环。
router.beforeEach(redirectGuard)

// canonical / og:url 跟随路由，origin 取 lib/site.ts（唯一来源 site.config.json）。
// 模板不写死这两个标签：构建期预渲染按路由注入，浏览器端不存在时由这里创建。
router.afterEach((to) => {
  // A3：?trail= 是会话态（探索轨迹分享），不进 canonical/og:url，避免同一内容多 URL 分权
  const cleanFullPath = to.fullPath.replace(/([?&])trail=[^&]*&?/, '$1').replace(/[?&]$/, '')
  const url = canonicalUrl(cleanFullPath)
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
