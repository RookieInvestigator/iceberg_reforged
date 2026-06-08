import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/global.css'

// GitHub Pages SPA fallback: 404.html → sessionStorage redirect
const saved = sessionStorage.getItem('redirect')
if (saved) {
  sessionStorage.removeItem('redirect')
  const url = new URL(saved, location.origin)
  const base = '/iceberg_reforged'
  const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : '/'
  router.replace(path + url.search + url.hash).catch(() => router.replace('/'))
}

const app = createApp(App)
app.use(router)
app.mount('#app')
