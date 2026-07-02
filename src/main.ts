import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/global.css'

// 404.html 重定向恢复：?r=/path → router.replace
const params = new URLSearchParams(location.search)
const r = params.get('r')
if (r) {
  const url = new URL(r, location.origin)
  const history = window.history
  const clean = location.pathname + (location.search ? location.search.replace(/[?&]r=[^&]*/, '').replace(/^\?$/, '') : '')
  if (clean !== location.pathname + location.search) {
    history.replaceState(null, '', clean || '/iceberg_reforged/')
  }
  const base = '/iceberg_reforged'
  const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : '/'
  router.replace(path + url.search + url.hash).catch(() => router.replace('/'))
}

const app = createApp(App)
app.use(router)
app.mount('#app')
