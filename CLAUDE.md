# CLAUDE.md

`iceberg-vue` 项目协作指引。

## 仓库根（2026-08-16 仓储治理 + 深度重整理后）

**工作区根 = git 仓库根**（原 `iceberg-vue/.git` 已上移，历史/分支/remote 无损；git 路径前缀 `iceberg-vue/`）。

```text
Iceberg/                  ← git 仓库根
├── .github/workflows/deploy.yml   ← CI（working-directory: iceberg-vue）
├── package.json          ← 根构建 shim（CF Pages：构建 iceberg-vue 并镜像 dist 到根）
├── CLAUDE.md / docs/     ← 协作指引 + 文档（docs/plans/ 规划、docs/audits/ 巡检为内部文档，git 忽略）
├── scripts/              ← 数据管线脚本（7 个 Python + build-cf.mjs；Python 路径基于脚本位置推导，任意 cwd 可运行）
├── data/                 ← 数据工作区（git 忽略）
│   ├── work/             ← 词条工作文件（config.json + items/*.md）
│   ├── archive/          ← 历史快照 + legacy-2026-08 + tools-2026-08 归档
│   └── reports/          ← quality_report.py 输出（时间戳 CSV）
└── iceberg-vue/          ← 前端代码（唯一活跃项目）
```

根 `.gitignore` 规则：`scripts/` 与 `docs/` 的 `CHANGELOG.md`、`DATA_WORKFLOW.md`、`STYLE_GUIDE.md` 纳入版本控制；`docs/TODO.md`、`docs/plans/`、`docs/audits/` 为内部开发文档，git 忽略；`data/`、`iceberg.yaml`、`font/`、历史项目、工具产物忽略。内部治理计划详见本地 `docs/plans/REPO_GOVERNANCE_PLAN.md`。

> ⚠️ 历史项目 `iceberg-astro/`、`iceberg-react/` 已压缩归档至 `data/archive/legacy-2026-08/` 并删除原目录；工具产物（`.shots/` 等）归档于 `data/archive/tools-2026-08/`。

## 协作规则

- **Git 提交**：仅在用户明确要求时执行，不要自动提交或推送。
- **更新日志**：有意义的改动实时追加到 `docs/CHANGELOG.md`，按「新增 / 改进 / 修复 / 移除」分类。

## 项目概述

"中文兔子洞冰山图" — 社区共建的冰山图，将中文互联网怪谈、都市传说等条目按冷门程度分层排列。

`iceberg-vue` 是 Vue 3 重写版，替代旧 React 版本，当前活跃开发中。astro版本和react版本都是历史内容，无需参考。

### 技术栈

Vue 3.5 + Vite 7 + Vue Router 4 + Tailwind CSS v4 + TypeScript 5.7 (strict) + Nano Stores + Fuse.js + GSAP + Three.js

### 开发命令

```bash
cd iceberg-vue
npm install        # 安装依赖
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建 → dist/
npm run preview    # 预览生产构建
```

### 数据管线

**优先使用 API 方式**（自动从 icebergthreads.com 获取最新数据）：

```bash
python scripts/build_data_api.py
```

零外部依赖（仅 Python 标准库）。从 `https://icebergthreads.com/api/iceberg/fel4BTCqlMAGSa2gelRJ` 获取 JSON，输出 `iceberg.json`。

**备用 HTML 方式**（从浏览器保存的 HTML 文件刮取）：

```bash
python scripts/build_data.py [html_file]   # 默认 iceberg.html
```

依赖 `beautifulsoup4`，`pypinyin` 可选（缺失时排序回退 Unicode 序）。适用于 API 不可用时的手动回退方案（「相关词条」交叉引用解析已移除，由副表 related.csv 承担）。工作流：SingleFile 浏览器插件保存页面 → 运行脚本。

**输出文件**（两种方式一致）：

| 文件 | 用途 |
| ---- | ---- |
| `iceberg-vue/src/data/iceberg.json` | Vue 前端主数据源（~900KB，构建时静态导入） |
| `iceberg-vue/src/data/id_history.json` | ID 持久化历史（API uuid → 8 位 ID 锚点，标题/层级修订不换 ID，见 F30） |

**ID 稳定性（F30）**：API 词条自带稳定 UUID，构建脚本仅将其作为 `id_history.json` 的内部锚点，输出的 8 位 MD5 ID 在标题/层级修订时保持不变；变更条目输出 `idAliases`（旧 → 新）写入 `iceberg.json`，前端分享 hash / 深链 / 收藏 / 已读解析时自动重定向。

**API 数据包含**：条目标题/描述/链接、分类名+颜色、emoji标签映射、条目级 `createdAt` / `modifiedAt` 时间戳（直接来自 icebergthreads，不自己算）。

## 项目结构

```text
iceberg-vue/
├── index.html / vite.config.ts / tsconfig{,.base,.app,.test}.json
├── public/                         # 静态资源 + 404.html（SPA 回退）+ _headers（CF Pages 安全头）+ robots.txt / sitemap.xml / og-cover.png
└── src/
    ├── main.ts / App.vue
    ├── prerender.ts                 # 构建期预渲染脚本（vite-prerender-plugin 调用，Node 内生成各路由静态快照）
    ├── router/index.ts             # 10+1 条路由（10 正式 + 1 DEV；懒加载 + keep-alive）
    ├── data/                       # iceberg.json, on-this-day.csv, bulletins/
    ├── lib/                        # data.ts, filterStore.ts, settingsStore.ts, i18nStore.ts,
    │                               # useI18n.ts, search.worker.ts, csv.ts, baseUrl.ts,
    │                               # supabase.ts, supabaseData.ts, authStore.ts, userState.ts,
    │                               # injectionKeys.ts, useEntryInteractions.ts, overlayLock.ts,
    │                               # report.ts, liquidGradient.ts, shaderCanvas.ts, md.ts, pinyin.ts
    ├── lib/ancient-book/           # 古籍模式（types / engine / layout / render + SpreadView/SpreadPage）
    ├── lib/iceberg/                # 冰山图 composables（搜索 Worker / 相关索引 / 筛选管线 / tooltip）
    ├── lib/iceberg3d/              # 3D 引擎（engine / picking / materials / cameraFlight / prng）
    ├── lib/i18n/                   # 翻译字典（zh / en / ja，222×3 key）
    ├── styles/                     # global.css, index.css, bg.css, modal.css, ancient-book.css, themes/
    ├── views/                      # IndexView, HomeView, HandbookView, FeaturesView, FeatureDetailView,
    │                               # OnThisDayView, AncientBookView, Iceberg3DView,
    │                               # AppendixEditView, NotFoundView
    └── components/
        ├── layout/                 # AppShell, IcebergBg, LiquidBg, LiquidGradient, FooterSection
        ├── iceberg/                # IcebergApp, Header, HeroSection（暂时下线）, TierNav, FloatingButtons, ScatterField
        ├── items/                  # ItemInteractivity, ItemTooltip, EntryDetailCardNext, MobileSheet,
        │                           # CommentPanel, EntryMetaBadges, EntryRelatedLinks
        ├── modals/                 # BaseModal, SettingsPanel, AboutModal, ContactModal, LinksModal, BulletinModal, UserModal, GeoAvatar
        ├── calendar/               # OnThisDayApp, OnThisDayModal
        └── home/                   # IcebergParticles
```

`docs/` 目录含 CHANGELOG.md、AESTHETIC_GUIDE.md、TODO.md、STYLE_GUIDE.md 等设计与开发日志。

## 测试与类型检查约定

- **测试文件 colocated**：`*.test.ts` 与被测文件同目录（如 `src/lib/supabaseData.test.ts`、`src/components/items/CommentPanel.test.ts`），vitest include 为 `src/**/*.test.ts`。
- **tsconfig 分层**：`tsconfig.base.json` 存共享 compilerOptions；`tsconfig.app.json`（构建类型检查，排除 `*.test.ts`）与 `tsconfig.test.json`（测试类型检查，带 `vitest/globals`）均 extends base；根 `tsconfig.json` 仅供 IDE 全量索引。
- **运行**：`npm run typecheck`（-p tsconfig.app.json）/ `npm run typecheck:test` / `npm run test`。

## 路由

| 路径 | 视图 | 说明 |
| ---- | ---- | ---- |
| `/` | `IndexView.vue` | 主冰山图 |
| `/home` | `HomeView.vue` | 首页导航 |
| `/handbook` | `HandbookView.vue` | 术语表 |
| `/features` | `FeaturesView.vue` | 功能特性列表 |
| `/features/:slug` | `FeatureDetailView.vue` | 功能特性详情 |
| `/minimal` | redirect → `/` | 极简模式入口 |
| `/on-this-day` | `OnThisDayView.vue` | 历史上的今天 |
| `/ancient-book` | `AncientBookView.vue` | 古籍线装书模式 |
| `/3d` | `Iceberg3DView.vue` | Three.js 3D 冰山 |
| `/:pathMatch(.*)*` | `NotFoundView.vue` | 404 |
| `/appendix-edit` | `AppendixEditView.vue` | 副表编辑器（仅 DEV） |

**`?r=` 深链（P1-13）**：部署层 `public/404.html` 把原始 `path+search+hash` 编码进 `?r=` 跳回 SPA；router 全局守卫（`lib/redirectGuard.ts` + `lib/deepLink.ts`）还原目标路由并 replace 跳转，地址栏 `r` 参数同时移除。

## 数据流

`IndexView.vue` 构建时静态导入 `iceberg.json`（~900KB），经 `normalizeData()`（层级重命名、标点规范化、emoji/颜色注入）后通过 `provide/inject` 下发。`desc` 字段与 `renderItems` 分离存入 `Map`，降低 `v-memo` diff 开销。

`IcebergApp.vue` 注入数据，通过 filterStore / settingsStore 管理筛选与设置，Web Worker（Fuse.js）异步搜索，`ItemInteractivity.vue` 统一处理 tooltip / modal。

## 状态管理（Nano Stores）

- **filterStore**：9 个 atoms（分类/标签/搜索/筛选），`toggleCategory()` / `toggleTag()` 辅助函数
- **settingsStore**：13 个 `storedAtom`（字号/浮动/详情/筛选/沉浸/随机按钮/排序/背景/收藏/已读/已读标记/NEW 标记/无层级），`applySimpleMode()` / `applyStandardMode()` 预设
- **i18nStore**：`lang` atom（默认 `zh`，持久化，切换时同步 `document.documentElement.lang`），`t(key)` 翻译回退 `zh → key`，`useI18n()` composable 响应式绑定

### storedAtom 工厂

```ts
function storedAtom<T>(key: string, fallback: T) {
  let val = fallback
  try { const v = localStorage.getItem(key); if (v != null) val = JSON.parse(v) } catch {}
  const a = atom<T>(val)
  a.listen((v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} })
  return a
}
```

## 关键设计点

- **Hero 页面**：已暂时下线（`IndexView.vue` 中 TEMP 注释保留组件与挂载点，恢复时还原三处注释即可）；恢复时需一并处理响应式背景图与 preload
- **古籍模式**：独立子系统，声明式 Vue 渲染（`SpreadView` / `SpreadPage`），分 4 模块（types / engine / layout / render），两种模式（分类/层级）
- **公告板**：`bulletins/*.md`，YAML frontmatter，构建时 `import.meta.glob` 自动加载
- **主题**：仅暗色主题，`base.css` + `dark.css`，CSS 变量体系
- **设计令牌**：白色透明度统一用 `var(--white-XX)`（XX = 百分比整数，定义于 `themes/base.css` 的 White-alpha ramp，如 `--white-30` = 30% 白）；强调色统一 `--color-accent` / `--color-accent-bright` / `--color-accent-soft`，收藏 `--color-fav`，NEW `--color-new`；小字号只允许 `--font-micro/tiny/xs/sm/base` 五个阶梯（最小 10px）；过渡曲线统一 `--ease-out/standard/emphatic/hero/float`；焦点环 `--focus-ring`。禁止新写 `rgba(255,255,255,α)` 或任意字号硬编码（canvas JS 颜色除外）
- **焦点与动效**：全局 `:focus-visible` 统一焦点环，组件不得裸写 `outline: none`；`prefers-reduced-motion` 由 global.css 全站屏蔽 CSS 动画/过渡，3D 自动旋转与相机飞行在 JS 侧同步关闭/瞬移
- **搜索**：Web Worker Fuse.js，双索引（标题/全文），threshold 0.3，防抖 150ms
- **Tooltip**：200ms 悬停延迟，滚动时阻止误触发
- **NEW 标记**：`modifiedAt` 距最新 30 天内
- **SEO**：`index.html` 含 description / robots / OG / Twitter 与 WebSite JSON-LD（CSP 按 `sha256-…` 哈希放行数据块）；构建期预渲染（`src/prerender.ts`）为 `/ /home /handbook /features /features/:slug /on-this-day` 注入静态内容快照与 per-route title/canonical/og:url；`router.afterEach` 浏览器端动态更新 canonical 与 og:url；favicon 使用 `%BASE_URL%` 前缀；`public/` 提供 robots.txt / sitemap.xml / og-cover.png
- **加载页（#app-shield）**：视觉由 `index.html` 内联样式负责（网站 icon + 标题 + 副标题 + 三点），AppShell 只负责生命周期——路由 path 变化显示、afterEach+nextTick 淡出、`vue-ready` 幂等确认、2500ms 兜底、bfcache 恢复；`<noscript>` 提供无 JS 静态说明

## 关键常量

| 常量 | 值 |
| ---- | ---- |
| 站点路径 | `/iceberg_reforged/`（GH Pages）；CF Pages 为根路径（`CF_PAGES_BRANCH` 自动切换） |
| 词条总数 | 1400（API 实时同步） |
| 层级 / 分类 / tagMap | 8 / 15 / 67 |
| iceberg.json 体积 | ~960KB |
| i18n 字典 | 222 key × 3 语言 |
| 搜索防抖 / 阈值 | 150ms / 0.3 |
| Tooltip 延迟 | 200ms |

## 构建配置

```ts
// vite.config.ts
base: process.env.CF_PAGES_BRANCH ? '/' : '/iceberg_reforged/'
alias: { '@': '/src' }
esbuild: { drop: ['debugger'], pure: ['console.log', 'console.info', 'console.debug'] }  // 构建时生效，保留 error/warn
plugins: [vue(), tailwindcss(), compression(), first-screen-preload, spaFallback(), vitePrerenderPlugin({ renderTarget: '#app', prerenderScript: 'src/prerender.ts' })]
manualChunks: 函数式分包（vue+vue-router / three / three-examples / gsap；fuse 仅 search.worker 内嵌，无独立 chunk）
```

`spa-fallback` 插件构建后将 `index.html` 复制为 `dist/404.html`。
