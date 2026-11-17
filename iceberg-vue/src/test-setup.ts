/**
 * vitest 全局 setup。
 *
 * 与 `main.ts` 对齐：那里用 `app.component('MirrorText', …)` 注册的词条标题渲染器，
 * 单测直接 mount 组件时不会经过 main.ts，所以这里补一次注册。
 * 以后新增全局组件，两处都要加（这是唯一需要同步的地方）。
 */
import { config } from '@vue/test-utils'
import MirrorText from './components/ui/MirrorText.vue'

config.global.components = { ...(config.global.components || {}), MirrorText }
