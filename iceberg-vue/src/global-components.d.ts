/**
 * 全局组件的类型声明。
 *
 * 组件在 main.ts 里用 app.component() 注册；这里补一份声明，
 * 否则 vue-tsc 不认识模板里的 `<MirrorText />`。
 */
declare module 'vue' {
  export interface GlobalComponents {
    MirrorText: typeof import('./components/ui/MirrorText.vue')['default']
  }
}

export {}
