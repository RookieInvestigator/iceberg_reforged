import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory('/iceberg_reforged/'),
  routes: [
    { path: '/',             component: () => import('../views/IndexView.vue') },
    { path: '/minimal',      redirect: '/' },
    { path: '/on-this-day',  component: () => import('../views/OnThisDayView.vue') },
    { path: '/ancient-book', component: () => import('../views/AncientBookView.vue') },
    { path: '/artbook',      component: () => import('../views/DarkArtbookView.vue') },
    { path: '/3d',           component: () => import('../views/Iceberg3DView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
})
