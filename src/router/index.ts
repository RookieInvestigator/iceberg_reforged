import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/iceberg_reforged/'),
  routes: [
    { path: '/',             component: () => import('../views/IndexView.vue') },
    { path: '/home',         component: () => import('../views/HomeView.vue') },
    { path: '/handbook',     component: () => import('../views/HandbookView.vue') },
    { path: '/features',     component: () => import('../views/FeaturesView.vue') },
    { path: '/features/:slug', component: () => import('../views/FeatureDetailView.vue') },
    { path: '/minimal',      redirect: '/' },
    { path: '/on-this-day',  component: () => import('../views/OnThisDayView.vue') },
    { path: '/ancient-book', component: () => import('../views/AncientBookView.vue') },
    { path: '/artbook',      component: () => import('../views/DarkArtbookView.vue') },
    { path: '/3d',           component: () => import('../views/Iceberg3DView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
})

// 开发专用路由：副表编辑器，构建时 tree-shake 掉
if (import.meta.env.DEV) {
  router.addRoute({ path: '/appendix-edit', component: () => import('../views/AppendixEditView.vue') })
}

export default router
