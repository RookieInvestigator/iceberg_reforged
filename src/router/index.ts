import { createRouter, createWebHistory } from 'vue-router'

export default createRouter({
  history: createWebHistory('/iceberg_reforged/'),
  routes: [
    { path: '/',             component: () => import('../views/IndexView.vue') },
    { path: '/minimal',      redirect: '/' },
    { path: '/on-this-day',  component: () => import('../views/OnThisDayView.vue') },
    { path: '/ancient-book', component: () => import('../views/AncientBookView.vue') },
  ],
})
