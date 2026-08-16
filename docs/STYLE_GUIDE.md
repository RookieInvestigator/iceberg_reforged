# 代码规范

## 文件

### 行数上限

| 类型 | 上限 |
| ---- | ---- |
| 组件文件（纯 `<script setup>` + `<template>`） | 300 行 |
| 组件文件（含 `<style scoped>`） | 400 行 |
| Lib / Composable / Store 文件 | 200 行 |
| CSS 文件 | 400 行 |

超过上限应拆分：组件拆子组件，CSS 拆独立文件或按 `@layer` 分离。

### 命名

| 对象 | 风格 | 示例 |
| ---- | ---- | ---- |
| 组件文件 / 组件名 | PascalCase | `IcebergItem.vue` → `IcebergItem` |
| Composable 文件 | camelCase，use 前缀 | `useI18n.ts` |
| Lib 文件 | camelCase | `constants.ts`、`data.ts` |
| Store 文件 | camelCase，Store 后缀 | `filterStore.ts` |
| CSS 文件 | kebab-case | `base.css`、`dark.css` |
| 函数 / 变量 | camelCase | `handleOpenDetail`、`heroExiting` |
| 常量 | UPPER_SNAKE_CASE | `SLOT_COUNT`、`EXIT_MS` |
| CSS 类 / 动画 | kebab-case | `.iceberg-item`、`fade-in-up` |
| CSS 自定义属性 | kebab-case | `--color-surface`、`--sidebar-width` |
| Ref | camelCase，El 后缀（DOM） | `heroRef`、`spotEl`、`bgLayerEl` |
| 事件处理器 | handle 前缀 或 on 前缀 | `handleClose`、`onMouseMove` |

### 目录结构

```text
src/
  components/
    iceberg/        # 冰山图核心
    items/          # 词条交互（tooltip/modal/sheet）
    layout/         # 页面外壳
    modals/         # 通用弹窗
    calendar/       # 历史上的今天
  views/            # 路由页面
  lib/              # 工具函数 / Store / Composable
  styles/
    themes/         # 主题 CSS 变量
  data/             # 静态数据（JSON/CSV/Markdown）
```

## 组件

### 导出

Vue 3 使用 `<script setup>` 无需显式导出，文件名即组件名：

```vue
<script setup>
// HeroSection.vue
</script>
```

### 一个文件一个组件

禁止在一个文件里定义多个顶级组件。内部辅助子组件不导出，直接放在同一文件即可。

## Vue 约定

### 响应式

- 大型静态数据用 `shallowRef` 而非 `ref`
- 跨组件状态用 Nano Stores（`filterStore.ts`、`settingsStore.ts`）
- 顶层共享数据用 `provide` / `inject`
- 避免不必要的 `reactive` 深度代理

### 事件与定时器

- `onMounted` 中注册的事件监听器必须在 `onUnmounted` 中移除
- 定时器用 `let` 变量存引用，卸载时 `clearTimeout` / `clearInterval`
- `requestAnimationFrame` 用 `cancelAnimationFrame` 清理
- 事件监听标注 `{ passive: true }` 或 `{ passive: false }`

### DOM 操作

- 优先用 Vue 模板绑定（`v-if`、`v-show`、`:class`、`:style`）
- 高频更新（rAF 循环）用原生 DOM API 直接操作，绕过 Vue 响应式
- 大量 DOM 操作用 `DocumentFragment` 批量插入

## 样式

### 优先级

1. Tailwind 工具类 — 首选
2. 全局组件类（`index.css` 的 `@layer components`）— 复用样式
3. 内联 `:style` — 仅用于动态值
4. `<style scoped>` — 页面级动画和特定组件样式

### 禁止

- `@apply` 指令
- CSS-in-JS 库
- 全局 `transition: all`
- 在大量重复元素上使用 `backdrop-filter` 或大半径 `blur()`

### keyframes

keyframes 加前缀避免冲突（如 `hero-`、`bg-`）：

```css
@keyframes hero-reveal { ... }
@keyframes bg-bi { ... }
```

scoped 样式中的 keyframes 需移至非 scoped 块或全局 CSS 文件，否则会被 hash 导致内联 animation 无法引用。

### 主题

主题变量定义在 `src/styles/themes/` 下，由 `global.css` 通过 `@import` 加载。

## 注释

### 原则

- 写中文
- 简短（一行即可）
- 解释代码**在做什么**以及**为什么这样做**
- 代码自解释的场景不加注释

### 文件头注释

每个代码文件开头写一行模块简介：

```js
// 冰山图主视图 — 按层级渲染所有词条
```

### 不需要注释

- `// 设置 loading 状态为 true` — 代码已说明
- `// 渲染标题` — 组件名已说明
- 多行 docstring / JSDoc — 本项目不要求

### CSS 注释

大段用分隔标记：

```css
/* ===== Hero 退出后的入场动画 ===== */
```

## 安全

- 所有外部数据（URL 参数、localStorage）使用前做校验
- 不硬编码密钥、Token、内部 URL
- `v-html` / `innerHTML` 仅用于项目内可控字符串

## 杂项

- 不提交 `console.log` 调试代码
- 不引入未使用的依赖
- 已弃用的旧代码直接删除，不做注释保留
- `!important` 仅用于覆盖第三方样式或动画状态冲突
