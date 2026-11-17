import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { reportError } from './lib/report'
import MirrorText from './components/ui/MirrorText.vue'
import './styles/global.css'

const app = createApp(App)

// F08：全局错误边界 —— 组件渲染/生命周期异常统一上报（记录版本/路由/信息，不采集正文）
app.config.errorHandler = (err, _instance, info) => {
  reportError('vue', err, { info })
}
// 路由级异常（懒加载 chunk 失败、导航错误等）
router.onError((err) => reportError('router', err))

// 词条标题的统一渲染入口：镜像字（「廻戮戈」）等显示规则都只在 MirrorText 里改，
// 各页面直接 <MirrorText :text="…" />，不再各自 import。
app.component('MirrorText', MirrorText)

app.use(router)
app.mount('#app')
