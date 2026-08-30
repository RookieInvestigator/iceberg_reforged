# 更新日志


## 2026-08-30 — 路由级数据分层：meta.json / id-index.json

### 改进

- **问题**：`iceberg.json`（~1MB）被 7 个模块静态导入，Rollup 合并为 ~788KB（gzip 325KB）的
  chunk，并被 `first-screen-preload` 注入根 `index.html` 首屏关键路径。但其中 `HomeView`
  只用到 4 个标量、`HandbookView` 只用到分类色与标签表 —— 为约 3.5KB 的内容下载了 800KB。
- **`build_data_api.py` 增产出两份派生数据**（与 `iceberg.json` 同批原子写入）：
  - `meta.json`（3.5KB）：`generatedAt` / `tierOrder` / `categoryColors` / `tagMap` /
    `tierCounts` / `total`
  - `id-index.json`（106KB）：`id → { t: 标题, c: 分类 }`
- **消费方改造**：`HomeView.vue`、`HandbookView.vue` 改导入 `meta.json`；`UserModal.vue`
  改导入 `id-index.json`（原为查收藏分类而建全量 id→item 的 Map）
- **收益**（gzip 传输量）：`/home` 首屏 JS 约 372KB → 约 49KB（-87%）；
  `/handbook` 约 432KB → 约 109KB（-75%）；`/home` 打开用户面板 约 339KB → 45KB（-87%）
- **导入纪律**（已写入 CLAUDE.md）：统计口径 → `meta.json`；按 id 查标题/分类 →
  `id-index.json`；只有需要正文（`desc`/`link`/`related`）才导入 `iceberg.json`

### 修复

- **`first-screen-preload` 重复注入**：`vite.config.ts` 该插件的 `closeBundle` 在一次构建中
  被触发多次（预渲染插件每写一个路由 HTML 触发一次），缺少幂等守卫导致 9 个
  `modulepreload` 标签被重复注入 4 次（37 个标签 / 仅 10 个唯一）。加 `preloadInjected`
  标记 + 内容二次校验；现为 9 个标签 9 个唯一
- **`SettingsPanel.vue` 焦点环**：移除 textarea 上的内联 `style="outline:none"`
  （违反项目「不得裸写 outline:none」约定），回归全局 `:focus-visible` 焦点环

### 移除

- **死重资源 1.88MB**：`public/assets/annie-spratt-*.webp`（1.44MB，唯一引用在已下线的
  `HeroSection.vue`）、`中文兔子洞冰山图-oc.png`（0.59MB，与 `og-cover.png` 字节完全相同、
  零引用）。`public/assets/` 由 2.6MB 降至 612KB，`dist/` 由 5.96MB 降至 4.08MB（-32%）
  ⚠️ 恢复 Hero 前需 `git restore` 取回 `annie-spratt-*.webp`（已记入 CLAUDE.md）
- 清理空的 `public/assets/_unused/` 及其 `.gitignore` 条目

### 测试

- 新增 `src/data/meta.test.ts`（6 项）：守卫两份派生数据与 `iceberg.json` 一致
  （total / tierOrder / tierCounts / categoryColors / tagMap / generatedAt，以及
  id-index 全覆盖且标题分类匹配）。全套件 17 文件 / 103 用例通过，双 typecheck 通过

### 其他

- `.gitignore` 新增 `/iceberg.txt`、`/outputs/`（此前长期占据 `git status` 未跟踪噪音）
- 注：`HandbookView` chunk 仍有 65KB（gzip），主要由 `lib/pinyin.ts`（2728 行）贡献，
  与本次数据分层无关，留作后续优化项


## 2026-08-30 — GSAP 替换为 @tweenjs/tween.js（/3d 省 23.2KB）

### 改进

- **背景**：GSAP 在生产构建里占 70KB / **27.4KB gzip**，但 `iceberg3d` 只用到
  `to` / `fromTo` / `killTweensOf` / `isTweening` 四个方法和 4 条缓动曲线
  （`power2.out` / `power2.in` / `power3.inOut` / `back.out(1.4)`），
  没有时间轴、插件、SVG、ScrollTrigger
- **新增 `src/lib/iceberg3d/tween.ts`**：基于 `@tweenjs/tween.js`（3.6KB gzip）的薄封装，
  对外暴露与 GSAP 同名的 4 个 API，语义逐条对齐：
  - `duration` / `delay` 用**秒**（tween.js 原生毫秒，封装层统一换算）
  - `killTweensOf()` **不触发** onComplete（GSAP 语义；若误触发会让聚焦环退出时被重新点亮）
  - `to()` 不自动 kill 同目标旧 tween（GSAP 3 默认 `overwrite: false`），调用侧显式先 kill
  - 自带 rAF 循环且空闲自动停止（等同 GSAP 自有 ticker 的懒启动行为）
  - `back.out(1.4)` 手写：tween.js 内置 `Back.Out` 的 overshoot 固定为 1.70158，
    与 GSAP 的 1.4 不同，为保持视觉一致单独实现
- **收益**：`/3d` 路由 JS 传输量 215.9KB → **192.6KB gzip（-23.2KB，-10.8%）**；
  `dist/` 3.98MB → 3.90MB
- **依赖**：移除 `gsap`，新增 `@tweenjs/tween.js@^25`

### 测试

- 新增 `src/lib/iceberg3d/tween.test.ts`（13 项，用 fake timers 驱动）：锁住
  duration/delay 单位、onUpdate/onComplete 触发次数、`killTweensOf` 不触发 onComplete、
  `isTweening` 完成后归零、`fromTo` 同步写入初值、缓动映射（power1/2/3 对应二/三/四次，
  `back.out(1.4)` 锚点 1.0704 且与内置 1.70158 可区分）
- 全套件 19 文件 / 159 用例通过，双 typecheck 通过，生产构建通过


## 2026-08-30 — 拼音表压缩 · 静态壳日期冻结修复 · i18n 死词条清理

### 改进

- **`lib/pinyin.ts` 表压缩 218KB → 25.8KB**：原为 20,901 条对象字面量，是 `HandbookView`
  chunk 体积的主要来源。改为**定长字符串查表**（索引 = 码点 − 0x4E00，`'-'` 表示码点空位）。
  转换脚本 `scripts/compact_pinyin.py`（幂等，任意 cwd 可运行，含重新导出说明）。
  `HandbookView` chunk **gzip 64KB → 17.4KB（-73%）**；`/handbook` 首屏 JS 传输量
  约 432KB → 约 61KB（-86%，含上一节的数据分层收益）
- 转换正确性：与转换前的对象字面量表做 **20,901 条全量比对，0 处不一致、0 处越界**

### 修复

- **`/on-this-day` 静态壳日期冻结**：`prerender.ts` 原用构建期 `new Date()` 取 MM-DD，
  静态 HTML 的「今天」被冻结在构建日，非每日部署即长期错误且与 hydrate 结果不一致。
  改为渲染**全年档案**（205 条 / 163 个日期，按 MM-DD 升序、同一天按年份倒序）——
  内容永不过期、全部记录可被索引、无 JS 用户可查任意日期。
  客户端仍是「日历 + 默认选中今天」，交互语义不变。该页 HTML 8.5KB → 92KB（gzip 20KB）
- **`i18n` 死词条清理 66 条**：三语各 230 → 208 key，仍完全对齐（无缺失/多余）。
  含 `bgDynamic`/`bgDynamicWarn`（液态背景重构遗留）、`fullMode`/`ancientBook`/
  `backToIceberg`/`edition`/`monthYearFmt`（古籍模式重构遗留）、`homeCta1Title`/
  `footerExplore`/`recordsFound`/`noRecordsToday`/`foldComments` 等
  ⚠️ `fontXs`/`fontLg`/`sortDefault`/`sortTitleAsc` 等 11 个**不是死 key**——
  它们在 `SettingsPanel.vue` 通过 `t('font'+…)` / `t('sort'+…)` 动态拼接调用，已保留

### 测试

- 新增 `src/lib/pinyin.test.ts`（43 项）：抽样校验拼音表（覆盖全表首尾与 A–Z 各区段）、
  边界行为（拉丁字母/数字/空值/表外码点）、`getFirstInitial` 的装饰符跳过与名称级覆盖。
  防止定长字符串错位/截断导致术语表 A-Z 分组静默错乱
- 全套件 18 文件 / 146 用例通过，双 typecheck 通过，生产构建通过

### 其他

- `dist/` 累计 5.96MB → **3.98MB（-33%）**


## 2026-08-21 — 词条弹窗复制交互调整 + 复制反馈可视化

### 改进 / 修复

- **点击标题 = 复制标题文字**（桌面弹窗 + 移动抽屉一致）：`useEntryInteractions` 新增
  `copyTitle`/`titleCopied`（独立于链接复制状态，1.5s 自动复原）；标题文本临时切换为
  「已复制标题」；底部动作条复制按钮保持**复制链接**（原语义不动）
- **「已复制链接」反馈可视化**（反馈太弱修复）：此前仅原生 `title` 悬浮 + 微变色，几乎
  不可见；改为复制成功时按钮**图标变勾 + 左侧出现「已复制链接」小字 + 背景提亮**，
  1.5s 复原（桌面/移动两处同步）；i18n 新增 `titleCopied`/`copyTitle` 两键 ×3 语


## 2026-08-21 — 持久化写入节流（storedAtom 防抖落盘）

### 改进

- **`storedAtom` 写盘防抖（500ms）**：热路径写入（已读/收藏/设置切换）合并为批量落盘——
  每次 markRead / 收藏切换不再同步 JSON.stringify + localStorage.setItem；latest-wins
  （防抖期内连续 set 只写最后一次）；页面隐藏/卸载（pagehide / visibilitychange /
  beforeunload）统一 flush，丢失上限 = 最后一批（无跨标签同步语义，可接受）
- **外部直读护栏**：`flushPersistedWrites()` 导出——`SettingsPanel.exportData`（导出含最新值）
  与 `authStore.runFavoritesSync`（收藏直读前落盘）接入；`cancelPersistedWrites()`——`clearData`
  清除前丢弃待写入，防防抖定时器把旧值写回
- **测试**：settingsStore 新增 6 项（防抖期不写/到期写入/latest-wins/flush/cancel/pagehide 与
  visibilitychange 自动 flush）；authStore 冲突矩阵按新语义适配（直写种子前 flush 待写入 +
  afterEach 落盘，防跨用例残留定时器污染）；全套件 97/97


## 2026-08-21 — 词条墙派生状态单一化完成（研究一 P2+P3）

### 改进

- **`lib/iceberg/wallState.ts`（单一事实源）**：`docOrder`（IndexView 按 sortMode 重建写入）、
  `navIndex`（可见文档序位置索引，管线 watchEffect 线性重建）、`wallMatched`（匹配集，
  hide/dim 皆产出）；生产点仅 IndexView + 管线两处，消费方零计算
- **弹窗前后导航 O(1)**：`navIdsFor` 改查 `navIndex` 位置表（id→index + 顺序数组），
  替代每次打开弹窗的可见过滤；`WALL_ORDER_KEY` 注入键删除（链条收敛为模块）
- **随机入口 O(1)**：`showRandom` 走 `wallMatched`（管线单遍产出），移除每次点击的
  1420 词条 matchesFilter 全量扫描；语义与管线判定同源（F15 保证不变）
- **测试**：`buildNavIndex` 4 项纯函数单测（无过滤/hide 过滤/全空/空序防御）；全套件 92/92
- 研究文档 `docs/plans/WALL_STATE_UNIFICATION.md` 收尾：P1-P3 完成，P4（marks 并入
  reactive 派生链）评估结论**不做**——定向 classList 通道是正确设计，避免 1420 chips
  绑定 readItems 响应性


## 2026-08-21 — 词条墙派生状态收敛（研究一 · P1）与交互热路径去 O(n)

### 改进

- **层可见数收敛**（`lib/iceberg/wallCounts.ts`）：IndexView 独立的 1420 词条扫描删除，
  层空/全空提示改消费管线**单遍产出**（hide 模式 Map / dim 模式 null）——每次筛选少一次
  全量遍历
- **dim 集合单遍构建**：`useFilterPipeline` 匹配循环内顺手收集未命中 id，删除二次全量过滤
- **`hasActiveFilter` 单一判定源**（`filterStore.ts`）：替代 IcebergApp 手写同义 computed；
  新增 3 项纯函数单测（全套件 88/88）
- **已读/NEW 标记热路径去 O(n)**：`markRead` 改为**定向翻转**（有元素即 `classList.add('read')`，
  O(1)），管线不再监听 readItems（每次开弹窗不再 1400 节点全量重扫）；管线仅对「开关变化」
  全量扫描，且开关全关时零扫描（关闭瞬间清理一次残留类）
- 研究文档：`docs/plans/WALL_STATE_UNIFICATION.md`（单一事实源设计 + P1 已完成 / P2-P4 候选
  与不做项：chips 不得响应式绑定 readItems）
- 顺带修复：上一轮 `Set-Content -Encoding utf8` 给 package.json/lock 写入 **BOM**，
  导致 PostCSS 配置探测解析失败（vitest 2 套件加载崩溃）；已重写为无 BOM（首字节 EF BB BF → `{`）


## 2026-08-21 — 描边语义最终拍板：唯一 stroke-glow + 两模式 hover 分离

### 变更（用户拍板，两轮收敛）

- **方案收敛为唯一 stroke-glow**：删除多方案开关（`outlineStyle` storedAtom / 设置面板 UI /
  `html[data-outline]` 分叉 / i18n 4 key×3 语）。最终形态：`-webkit-text-stroke` 伪元素镜像
  外描边（每字形 2 次绘制）+ `4px 3px 4px` 光晕单层；`data-text` 属性保留（镜像层依赖）
- **两模式 hover 语义分离（最终裁定）**：
  - **tooltip 模式**（hover 有 marker 背景）：黑字**无需描边/阴影** —— 隐藏镜像描边层 +
    `text-shadow: none`（marker 纯色底承担对比度）；tooltip-active 同语义且带
    `data-detail` 守卫，不泄漏进 modal
  - **modal 模式**（hover 无背景，仅 α0.8 反馈）：描边/光晕**保持原样**（不隐藏、不移除）
  - 过程纠正记录：早前「hover 隐藏描边层」针对 tooltip 模式本就是对的，上一轮误判
    「描边消失是错误」而撤销；用户澄清后按语义恢复，并补 modal 模式分隔


## 2026-08-21 — 描边方案 hover 保留外描边（撤销「hover 隐藏描边层」）

### 修复（用户反馈：hover 后描边错误地消失）

- **stroke / stroke-glow 方案 hover 时不再隐藏镜像描边层**：此前为对齐「阴影换肤」语义
  （hover 黑字移除 text-shadow）把 `.item-title::after` 在 hover/tooltip-active 时
  `display: none`——对硬描边而言会在 marker 底上突然消失、产生明显视觉突跳，属错误取舍。
  已撤销该规则（index.css 注释记录）；黑字 + 外描边在 marker 上常驻是选定观感。
- 边界说明：阴影（现状）模式维持原设计（hover 移除 text-shadow，多年一致行为）；
  hover 的 `text-shadow: none` 同时作用于 stroke-glow 的残留光晕（与旧语义一致）；
  emoji 在描边方案下无描边（既知差异，未变）。
- 验证：双 typecheck + 85/85 测试 + 生产构建绿


## 2026-08-21 — 架构清场：canvas 实验归档 + 移除死掉的层级 hover z 提升

### 移除

- **canvas 实验堆栈整体归档**（用户拍板，方案二）—— `lib/icebergCanvas/`（双引擎/布局/命中/
  过滤器镜像/精灵缓存 + 3 测试）、`components/experiment/`（ReferenceWall/CanvasWall/ViewportWall
  + ReferenceWall.test）、`views/ExperimentCanvasView.vue`（893 行）、`scripts/perf-hover-probe.mjs`
  与 `probe-variants/` 移入 `data/archive/tools-2026-08/canvas-experiment/`（附 README：内容/还原
  方法/关键决策记录）。原因：已弃用 + 系统性重复（仓库第 4 套 tooltip 实现、双引擎、过滤器/命中
  镜像）；文件原为 untracked，归档保留可回退。`router/index.ts` 移除 `/experiment-canvas` DEV 路由
- **层级 hover z 提升（`.iceberg-tier` 的 `hover:z-[9999]`）** —— 为「tooltip 挂词条内、hover
  层需压过相邻层」设计的层序 hack；body 级浮动 tooltip（z 10000）上线后无消费者，仅剩整层
  提层的层序搅动。移除（保留 `z-[1]` 层级 stacking context）；chip hover `z-index: 10` 保留
  （仍承担浮动偏移下压过相邻词条的职责）
- 验证：双 typecheck + 85/85 测试（归档带走 58 项 canvas 测试，生产侧 0 损失）+ 生产构建绿；
  `scripts/tooltip-probe.mjs` 保留（生产 tooltip 几何验收仍用）


## 2026-08-21 — Tooltip 紧贴词条（0 间距）+ 锚点变化跟随

### 修复（用户反馈：定位没有紧贴）

- **词条间距归零**：`placeTip()` 的 8px 边距此前被误用作词条间距——现改为**与词条 0 间距
  紧贴**（上置 bottom = chip.top、下置 top = chip.bottom、左/右对齐贴边）；8px 仅作**视口
  安全边距**（只在将越界时才让出间距）；翻向判定仍用带边距的空间计算
- **定位类落在浮层盒上**：`tooltip-below/left/right` 现在同时加在 `.tooltip-box` 本体
  （tooltip 已不在词条内，chip 侧类仅实验页锚点路径用）；补 `.tooltip-box.floating.tooltip-below`
  零上侵阴影（`0 8px 16px`，此前规则随 tooltip 移出词条而失效，贴靠后 blur 上缘会洒到词条底）
- **锚点 chip 纳入观测**：ResizeObserver 同时观测 tooltip 与 chip——字体重排/布局变动导致
  锚点尺寸或位置变化时按最新矩形重定位（此前只观测 tooltip 本体）
- 实测（`scripts/tooltip-probe.mjs`，CDP 几何）：tier 5 左侧 / tier 2 右侧边缘 chip 两轮
  独立运行 aboveGap = 0.20px / −0.05px（仅取整误差），debug 定位时刻输入与最终几何逐位一致


## 2026-08-21 — Tooltip 架构重做：body 级浮动层（推翻「容器级修补」）

### 重构（用户拍板：不要修修补补，整体重来）

- **tooltip 改为 body 级浮动层**：`ItemTooltip` floating 模式 Teleport 到 `<body>`，
  `.tooltip-box.floating { position: fixed }`；`useTooltip` 以视口坐标定位 + 8px 硬钳制
  （x/y 都钳在 [8, vw/vh−8]，边缘自动左/右对齐）——tooltip 不再属于任何可裁剪祖先盒的
  后代，架构上不存在被截断的路径（tier 合成层 / content-visibility / capture-area
  overflow / body clip 全部免疫）
- **定位全量实测驱动**：`placeTip()` 每次执行都重新读取 chip 矩形 + tooltip 尺寸
  （offsoffetHeight/Width），无跨帧缓存；上/下放置与 maxHeight 夹逼逻辑收敛为单函数
- **内容/布局变动兜底**：ResizeObserver 监听 tooltip 尺寸（字体加载/换行/宽度变化）→
  rAF 合并按最新 chip 矩形重定位；隐藏时断开；滚动/窗口 resize（含 Ctrl+/− zoom）关闭
  tooltip（原滚动防误触语义保留）
- 明确没有被推翻的：200ms 延迟、fade 过渡、`tooltip-active` 词条高亮、已读/NEW 状态、
  实验页幽灵锚点路径（非 floating 时原 CSS/行为不变）
- 验证：`scripts/tooltip-probe.mjs`（CDP 实测定位）——tier2 右侧边缘 chip、tier5 左侧
  chip 两轮独立运行：定位误差 ≤0.4px（仅取整），debug 快照（定位时刻输入）与最终几何
  逐位一致、`position: fixed`、parent = BODY、可见；早前「提升一级」容器级方案的
  +87px 漂移经定位排查为字体/content-visibility 落定期探针伪影，非定位代码缺陷


## 2026-08-21 — Tooltip「提升一级」根治（层级容器级绝对定位）

### 改进（用户提议：临时提升 tooltip DOM 等级，放到上一级）

- **生产 tooltip 不再挂在词条内**：`ItemTooltip` Teleport 目标改为 `#items-container`
  （所有层级的父容器，「上一级」），`useTooltip.showTooltip` 以容器坐标 JS 绝对定位
  （left/right/transform 按 左/中/右 对齐，top 按上/下放置，maxHeight 夹逼不变）；
  `#items-container` 补 `position: relative` 作为定位坐标系
- **结构性免疫**：tooltip 从此与任意层级合成层/containment 无关（content-visibility、
  入场动画提升层、未来任何 will-change/transform）—— 2026-08-21「层级边缘截断」事故的根治，
  不再依赖「层级恰好不裁剪」这一脆弱前提
- **z-index 1000 → 10000**：容器级 tooltip 需压过 `.iceberg-tier` 的 hover:z-[9999]
  （原 1000 仅在词条内层上下文有效）；实验页幽灵锚点用法不变（其 z 受 ghost z:60 上下文约束，
  全局提升无影响）
- 隐藏时清理 inline 定位（ positioned 标志防残留）；滚动隐藏链路不变；实验页工具提示走
  原 anchor 路径不受影响（实验页 `#items-container` 自身带 relative + pt-6，幽灵锚点 CSS 原样）


## 2026-08-21 — 修复：入场合成层裁剪 tooltip（层级边缘截断）

### 修复

- **tooltip 被层级边缘截断** —— 根因：`will-change: transform, opacity`（为入场动画提升合成层）
  与 `.iceberg-tier` 的 `content-visibility: auto`（paint containment + 估算盒）叠加，导致
  合成层按边框盒裁剪溢出的 tooltip（tooltip 挂在 chip 内、可越过层级上/下边缘）。移除
  will-change，保留入场动画本身；同时保留 1.5s 后移除 `content-enter` 的逻辑（顺带释放
  `animation-fill-mode: both` 对 tier 变换层的持有）。index.css 注释记录该禁令，防回归。
- 历史对照：2026-08-16 曾记录「content-visibility 导致 tooltip/高亮失效」同族问题；
  本次为 will-change 引入的回归，移除即恢复（结构与视觉均不变）


## 2026-08-21 — 词条描边方案实验开关（text-shadow → -webkit-text-stroke）

### 新增

- **描边方案三档开关**（`outlineStyle` storedAtom + 设置面板实验区，默认「阴影」零风险回滚）：
  - `shadow` 现状：5 层 text-shadow 模拟描边（4×1px 对角 + 4px 3px 4px 大阴影 = 每字形 **5 次绘制**）
  - `stroke-glow`：`-webkit-text-stroke: 1px` 硬描边 + 保留大阴影（**2 次绘制**，观感最接近现状）
  - `stroke`：纯描边（**1 次绘制**；hover 换肤 5 层 → 0~1 层，重栅格成本降为现状 ~20%）
- 接线：`html[data-outline]` 属性（ItemInteractivity watchEffect，仿 `data-detail` 模式）驱动
  `index.css` 分叉；hover 黑字同语义清除描边；`--shadow-color` 令牌复用于描边色
- 视觉对照：`outputs/outline-compare.html`（真实分类色 × 三方案 × hover 态 × 2.4× 放大镜，
  headless Chrome 截图已生成）；观感差异（stroke 硬边 vs 阴影光晕、描边吃字形程度）由用户看图拍板
- 兼容：`-webkit-text-stroke` Chromium/Firefox 全支持；tooltip CSS 早已使用 `-webkit-text-stroke: 0`
  防御性重置（先例存在）；i18n 3 语各 +4 key

### 修复（用户反馈：居中描边吃字形 → 改为真·外部描边）

- **镜像外描边（pseudo-mirror）** —— `-webkit-text-stroke` 语义是**居中**描边（内外各 0.5px，
  吃字形），无法推出纯外描；改用「伪元素镜像」：`.item-title::after` 以 `attr(data-text)` 复制
  同文 + 绝对定位叠于原字之下（同字体同基线），镜像层画 2px 居中描边，原字 fill 天然盖住
  内半圈 → 可见部分 = **纯外圈 1px，真·外部描边**；每字形 2 次绘制（现状 5 层阴影的 40%），
  hover 换肤从 5 层重栅格降到 1 层。`data-text` 属性已加到 IndexView / ScatterField /
  ReferenceWall 的 `.item-title`；已知差异：emoji（.item-tag）在新方案下无描边（现状阴影会波及）
- 对照图 `outputs/outline-compare.html` 同步更新为镜像实现（B/C/放大镜行）；观感（外圈厚度、
  镜像对齐）由用户真机目检拍板


## 2026-08-21 — 生产词条墙抖动治理：分片挂载 / 数据化导航 / 背景与入场合成让位

### 新增

- **production**：**词条墙分片挂载**（`src/lib/iceberg/wallMount.ts` + `IndexView.vue`）——首屏只挂前 2 层（视口 + 缓冲），其余层级每 rAF 补齐一层（~6 帧内全量），首屏长任务从「一次性创建 1420 节点」拆碎；安全网：`pointerdown`/`keydown`（capture）或深链（`?item=`/`#hash`）/`open-item-modal` 立即 flush 全量（pointerdown 先于 click + Vue 微任务刷新保证事件时序内墙已完整），flush 后自动解绑；prerender 为手工快照零影响；`wallMount` 纯函数单测 5 项
- **production**：**弹窗前后导航数据化**（`WALL_ORDER_KEY` 注入键 + `ItemInteractivity.navIdsFor`）——替代每次开弹窗的 1400 节点 `querySelectorAll` 扫描；文档序 = tierOrder × 层内声明式排序（computed），与分片挂载兼容；注入缺失回退原 DOM 扫描
- **production**：**液态背景交互感知三档帧率**（`LiquidBg.vue`）——静止 60→24fps（历史设计意图回归，肉眼无差）、鼠标停在词条墙降 **12fps**（近静止，把合成器让位给 hover 记号笔/tooltip）、滚动 30fps（沉海跟随）；`pointerover` 委托判定进出墙区，离开 150ms 后才升档防跳档。归因：CDP 探针（`scripts/perf-hover-probe.mjs`，headless Chrome + longtask 观察，FLOOR 变体零交互仍见显著长任务、纯黑背景显著更低）佐证「全屏 shader 60fps 常驻与交互抢合成」——与 2026-08-19「冰山页卡顿、纯黑页不卡」历史归因同源
- **production**：**入场动画合成化**（`index.css` + `IndexView`）——`.content-enter .iceberg-tier` 加 `will-change: transform, opacity`（大层级动画走合成器不再霸占主线程），动画全部结束后定时移除 content-enter，释放 8 个巨型过渡层的 GPU 内存

### 指标（headless SwiftShader 软光栅，同环境 A/B；真机待复测）

- 液态背景 FLOOR（零交互）长任务账单 586-844ms/3s 窗口 → 三档降频后同窗口 343-563ms 且任务数减半；真机 GPU 路径的合成争抢削减大于该值（软光栅掩盖 GPU 差异）
- 分片挂载：首屏挂载从单任务（1420 节点）拆为 ~6 帧；数据化导航：弹窗打开零 DOM 扫描


## 2026-08-21 — 视口带渲染（变体 C）：实验页第三种模式

### 新增

- **视口带 canvas 引擎 `viewport.ts`（第三种模式 `?mode=viewport`）** —— 与全墙位图对偶的渲染路径：位图只覆盖「视口 ± overscan」一条带（可见 sticky canvas + 可选离屏带缓存），内存 O(视口) 恒定（实测 dpr2 桌面 ≈ 72MB = 可见 24 + 带 48，较全墙 dpr2 250MB 降 71%），任意 zoom 恒 1:1 物理像素（内存不随 zoom² 膨胀，DOM 级「任意放大清晰」的唯一 canvas 路径）
  - **几何一锤定音**：`drawY = w - max(0, scrollY - anchor)`，sticky canvas 吸附前后同一公式；命中 `wallY = clientY + scrollY - anchor` 与画布盒位置无关；anchor 挂载/窗口 resize/**`anchorTick`**（标签折叠/隐藏行/筛选摘要高度变化，页面传组件仅重测锚点）时刷新
  - **带内增量滚动**：重叠区从带缓存 blit + 新露条带重绘（纯函数 `bandWindow`/`bandMove` 决定，y 二分 `chipsInRange` 裁剪，每帧几十 chip）；跃出带（快滚/瞬移）整带重绘；`?band=0` / 控制台「band 缓存」复选框关闭带缓存 → 纯视口重绘（A/B 对照滚动成本与内存）
  - **交互/视觉等价**：tooltip 幽灵锚点/随机/深链/键盘全部沿用 layout2 像素网格 + hits 索引；hover 记号笔动画/hover/modal/recent/read/dim/空态/层级名带内自绘，状态翻转走区域修复（无整墙 clear）；探针读可见画布（首屏带不透明像素比，与全墙模式同口径）；stats 新增 `bandH`（当前带高）与 `paintMs`（带重绘耗时）
- **共享精灵缓存 `sprites.ts`** —— 精灵 LRU/字节预算/尺寸校验从 `engine.ts` 提取为独立 `SpriteCache`，全墙与视口带双引擎共用（内容键一致，滚动/重排零重复 measureText）；engine.ts 行为等价重构，28 项引擎测试全量回归
- **视口带测试 17 项** —— 纯函数（effectiveScroll/bandWindow/bandMove/chipsInRange/headersInRange/capViewportDpr）+ 引擎冒烟（首绘带内裁剪、带内滚动 blit vs 跃出整带重绘、anchor 前零重绘、hover 区域修复、read 增量、band 开关背板重建、精灵复用、mem/bandH 账本、destroy 防御）
- **测试类型收敛** —— `engine.test.ts` 既有漂移修复（chip 助手添加 `tagFont ?? null` 显式补位、`mountWall` 参数放宽 `ChipMeta[] | WallLayout`），`npm run typecheck:test` 恢复全绿（app/test 双 typecheck 通过，139 测试通过）

### 性能（dev headless 软渲染实测；真机待复测）

- 视口带账本与全墙对照见引擎头注释与 `docs/plans/CANVAS_HYBRID_PLAN.md §5.3`：全墙 = 滚动零重绘、内存 O(墙)；视口带 = 内存恒定、滚动每帧仅视口 chip 重绘（带缓存时重叠区零重绘）


## 2026-08-21 — Canvas 独立渲染引擎 P1+P2（方向切换：不再强求像素一致）

### 新增

- **独立布局引擎 `layout2.ts`（P1）** —— 纯函数 flex-wrap 推算（measureText 注入式、零 DOM 度量）：层级名行/词条行排/emoji 单元/超宽截断省略/float 哈希/基线预计算；单测 7 项（行排居中/换行/截断/scatter/float/emoji/byId）
- **层级名进 canvas（P1）** —— 层级标题由引擎自绘（近似 h2 样式 + letterSpacing），空态提示（层空/全空）也由 canvas 自绘；scatter 无层级名
- **渲染提速（P2）** —— ① 精灵缓存（chip 离屏精灵 LRU 3000，布局变化自动清空）；② 全量重绘统一 rAF 分片（8ms 时间片 + 重绘提示，首帧也渐进）；③ 画布高度分段（单段 ≤30000px，移动端超高墙自动多段，滚动仍零重绘）；④ 统计/probe 延迟到分片完成回调
- **交互坐标迁移（P1）** —— tooltip 幽灵锚点/随机/深链滚动全部读布局矩形；命中/键盘绑宿主容器（多段 canvas 时代单点坐标）；卡片/抽屉/搜索/收藏等 Store 链路零改动
- **模式收敛** —— `?mode=canvas|ref`（默认 canvas），移除 DOM+canvas 重叠（both）与 hideChips；canvas 模式**零 `.iceberg-item` DOM 节点**（冒烟实测 domItems=0）
- **过滤重排 + 过渡动画（morph）** —— hide 模式过滤后布局按可见集合**紧凑重建**（与生产 v-show 移除流内一致，不再留空洞；墙高随结果收缩，实测 11183→944）；重排带**位置插值过渡**（ease 300ms，剩余词条漂移到新位；freeze/reduced-motion 瞬移）；配套：文本测量缓存（重排复用，首次后不再 500ms 级 measureText）、精灵改**内容键缓存**（重排复用精灵，尺寸校验自动重建）、带 visible 集合的 `layoutWall2` 单测 + morph 冒烟（动画窗口捕获 ✓）

### 修复

- **recent 文字色回归** —— layout2 时代 recentText 置 null 后回退 #1a1a1a；生产 `.recently-updated{color:#1a1a1a}` 压不过模板 inline 分类色 → **recent 文字恒分类色**（视觉差异仅白底），断言收紧
- **首帧空白** —— CanvasWall 基线视图未补传（immediate watch 早于 engine 创建）→ paintSync 因 view null 早退；显式 `setView(基线, onSettled)` + 首帧分片渐进
- **「筛选未生效」排查** —— CDP 实测分类点击 1420→179、搜索"公交车"→2、引擎 visible Set 与画布像素联动；链路全通（疑似旧 server 代码缓存，已记录待用户复验）
- **筛选→恢复版面乱掉 / 无限重排风暴** —— CanvasWall 布局失效 watch 误用 `watch(() => [layoutKey, width])`：数组 getter 每次求值返回新引用 → 父组件任何渲染都触发 remeasure；改回两个按值 watch。实测：搜索 1420→4 → 恢复 1420、布局引用 600ms 稳定、无风暴
- **OOM 防护（dpr 封顶 + 精灵字节预算）** —— 墙位图内存 = 面积×dpr²×4：dpr2 桌面墙 250MB、移动 dpr3 墙 700MB+。新增 `capDpr(wallW, wallH, desired, budgetMB)`：桌面预算 128MB / 移动 64MB，dpr 自动降级（实测 --force-device-scale-factor=2：dpr 250MB→1×72MB，canvas.width 2800→1400）；精灵缓存新增字节预算 24MB LRU（此前只有张数上限）；stats 显示 `mem + spr`（精灵实时占用）；`effectiveDpr` 暴露真实封顶值
- **hover 黑边修复** —— hover/read 翻转的局部重绘此前「clear 带（+margin）后只重画 chip 自己」，浮动偏移让邻词条间距可 < margin → 邻 chip 的描边/阴影被擦成黑底一圈。新增 `repaintChipArea`：clear 影响带后**重画 chip + 与带相交的所有可见 chip**（y 二分取候选，开销 O(log n + 带内)），hover/restore/read 翻转统一走此入口；RESTORE_MARGIN 8→6（描边外扩 ~5px 足够，误擦面更小）；回归单测 +1（相交邻 chip 重画、不相交不动）
- **tooltip 彻底重写（按生产 useTooltip 结构）** —— ① 幽灵锚点**常驻**（display:none 隐藏替代 v-if 动态挂载）：Teleport 目标恒可解析，杜绝时序性 ghost 缺失；② 定位自适应延后到「teleport 完成 + 渲染一帧」（rAF×2）并高度兜底（h=0 时不再静默走错方向）；③ **基准修正**：`#items-container` 的 pt-6（24px）使 ghost（相对 padding 边缘）比画布（content 区）高 24px → tooltip 上方留 ~20px 空隙、下方遮盖词条——ghostStyle 动态补偿 `paddingTop`；④ 下方场景阴影零上侵（`0 8px 16px`——默认 `0 10px 30px` 的 blur 上缘会洒 5px 到词条底）；⑤ scrollBusy 竞态（滚动事件懒派发→滚动后 300ms 窗口内 hover 被吞）：窗口内只关 tooltip 保留锚点（微动即恢复）、时长 300→120ms；⑥ 下方判定 CDP 实测生效（y=95 hit-test 命中 canvas、below=true、tipTop=chipBottom 精确对齐）
- **像素网格统一（词条↔tooltip 黑线根治，底层方案）** —— 词条视觉（canvas 位图）与 tooltip 锚点（DOM ghost）本是**两个独立亚像素体系**，浮点尾数随词条不同 → 有的对齐有的留一条黑线（且粗细漂移）。根治：**取整下沉到布局唯一真相源** `layout2`——chip 的 x/y/w/h、float 偏移、层级名、wallH 全部产出整数像素网格；绘制/hit/幽灵锚点/tooltip 共用同一坐标，两个体系共享同一网格，缝在数学上闭合（无补丁逻辑）。`layout2.test` 新增「像素网格自洽」单测（float 开关双实例全整数断言），浮点断言放行至网格容差；CDP 多词条交叉验证：below 场景 tipTop=chipBottom、above 场景 tipBottom=chipTop 全部一致
- **词条↔tooltip 清晰度一致（dpr 档位化 + zoom 感知）** —— 词条是 canvas 位图、tooltip 是 DOM：此前位图 dpr 被预算压到 1.4/1，在 dpr2/zoom 屏幕上被放大渲染 → 词条边缘发虚。修复三件套：① `capDpr` 档位化 `[2, 1.5, 1.25, 1]`（优先贴近设备 dpr）；② **zoom 感知**——浏览器缩放会改 `devicePixelRatio` 但 computed 不追踪 → 新增 `dprTick`（resize 时递增，view.dpr 依赖它）+ layoutKey 并入 dpr，zoom 后强制按新分辨率重建位图；③ 桌面预算 128→320MB（1400×11183@dpr2=250MB / zoom200% 700×27000@dpr2=302MB 均可 2 档 1:1 物理像素）；移动 64MB 不变。测试：capDpr 单测重写 + zoom 场景用例
- **「像 DOM 一样任意放大清晰」的架构权衡（记录）** —— 全墙单张位图内存按 zoom² 增长（200%=4×、300%=9×），预算再大也追不上；DOM 永远清晰是因为浏览器只光栅化视口内的元素（内置虚拟化）。若要「任意放大永远清晰」，唯一底层路径是 **视口带渲染**（位图只覆盖视口 ±margin，滚动重绘视口带，每帧仅几十 chip）：任意 zoom 均可 1:1 物理像素，内存大幅下降；代价是放弃「滚动零重绘」特性。待用户拍板是否切换（P5 集成方向决策）
- **P1/P2 性能优化（morph 增量帧 / 公共绘制循环 / 命中行桶 / rAF 减半）** ——
  - morph 动画帧只重画「移动 chip + 新旧路径包围盒相交的静止 chip」：帧成本从全墙 ~10ms 降到 <1ms（受影响面 >4 且 >30% 才回退全墙帧；终帧全量收尾保干净）；MorphAnim 持 chip 引用，`clearRegion` 跨段任意矩形
  - 三条全量绘制循环收敛为公共 `paintChipsFor(pos)`（paintSync/分片/插值统一入口，防回归）
  - 命中检测行桶：chips 按 y 单调（layout2 保证），`pointToId` 二分定位 ±90px 邻域（O(log n + 带内）替代全量线性扫描）；新增 `clearRegion`/`paintChipsFor` 等其附带重构均经全量回归
  - withPaintHint 双 rAF → 单 rAF（重排响应延迟减半）；view resize 监听改为具名 handler 并在 onUnmounted 清理（防泄漏）
- 验证：117/117 测试（+morph 增量帧单测：无整墙 clear、移动插值位移、波及静止重画、不相交不动、终帧全量）；CDP 真实墙：命中→弹窗、搜索 1420→4、恢复→1420 且 wallH 初始=恢复（13555.2，无漂移）

### 性能（dev headless 软渲染实测；真机待复测）

- 全量重绘分片后：paint 10.6ms（精灵热身后）；首帧/布局重排 total ~500ms 大头是 CJK measureText ×5700 次（软光栅），下一步做文本测量缓存
- 背板：1400×11183 @dpr1 → 59.7MB（较 DOM 度量版 72MB 下降，布局更紧凑）


## 2026-08-21 — Canvas 混合渲染实验页（DEV-only · P0+P1+P2）

### 新增

- **`/experiment-canvas` 实验页（仅 DEV，生产 tree-shake，零改动现有方案）** —— 词条墙 Canvas 混合渲染实验（`docs/plans/CANVAS_HYBRID_PLAN.md` / `CANVAS_PARITY.md`）：
  - `src/lib/icebergCanvas/`：DOM 度量权威布局（char-step 换行、行盒基线、emoji 坐标）、6 重 text-shadow 描边复刻、hover 叠加层（marker+黑字）、命中检测、过滤纯函数镜像（同 Store 同判定）、像素探针；引擎 9 项单测全绿
  - P2 交互等价（实验页内自建，生产组件只复用不改）：幽灵锚点 Tooltip（复用 `.tooltip-box` 全部 CSS）、桌面弹窗/移动抽屉（异步组件 + 空闲预取）、随机入口、`#hash`/`?item=` 深链、前后导航（`navOrder` 文档序）、Enter/Space 键盘、scatter 变体、perf 中间账本（measure/paint/背板/可见数）
  - headless 差分探针实证：画布首屏 2400px 带不透明像素 34.14%，ref/canvas 对照图同级（~1.1MB）

### 修复

- **Canvas `ctx.font` 引号** —— computed font-family 含 `-apple-system` 等裸 token 时 canvas 整串拒绝字体，`fillText` 静默不画；新增 `quoteFontFamily()` 逐项加引号
- **首绘基线** —— CanvasWall 重测后显式基线绘制（深度 watcher 非 immediate，不能依赖它触发首次绘制）
- **点击弹窗延迟** —— 每次点击 `markRead` 会让 readSet 变化 → 引擎此前同步整墙 1420 芯片重绘，挡在弹窗首帧前；改为：引擎按芯片 diff 增量重绘（变化面 <40% 走单芯片局部 restore），状态重绘合并到 rAF（同 tick 多次变更只画一次）；新增 2 项单测覆盖增量/回退路径
- **P3 视觉复刻逐项收敛** ——
  - hover 记号笔：scaleX 0.25s 缓出动画（freeze/reduced-motion 直接终态）、recent 芯片层序修正（marker 实色在下 + `--white-80` 白底 80% 透出 20% 分类色）、modal 模式改为整体 α.8 无记号笔（生产 `html[data-detail=modal]` 分支）、hover 黑字去描边全宽
  - tag emoji：字号/字族从 `.item-tag` computed font 度量（此前用行盒高取整、差 0.5px），色恒 `tagColor`（生产 `.item-tag` 规则后声明，recent 芯片 emoji 不变黑，此前错误画成 #1a1a1a）
  - recent 白底补 `border-radius: 4px`（无 roundRect 环境降级直角）
  - dim 芯片命中排除（生产 `pointer-events:none`）
  - 焦点环（canvas `:focus-visible`，去掉误加的 `outline-none`）；cursor 按 detailMode（crosshair/pointer）
  - URL 参数新增 `?detail=modal|tooltip`；引擎测试新增 modal hover / recent 圆角+emoji 色 / dim 排除 / 整墙绘制恢复共 4 项（全量 96 通过）
  - **modal hover 移开不恢复**（回归修复）—— `paintHoverBand` modal 分支无视 progress 参数，leave 帧仍画 α.8；改为按 `enter` 标志分支（enter=0.8 / leave=常态 alpha），新增回归测试（97 通过）
  - **recent 文字描边缺失** —— 引擎此前对 recently-updated 芯片关闭 text-shadow（想当然）；生产 `.iceberg-item` 基类六重描边并未被 `.recently-updated` 覆盖，黑字#1a1a1a+黑描边在白底上可见；恢复为恒画 `SHADOW_COLOR`，测试断言描边填充出现
- **层级标题在 canvas 模式缺失** —— 层标题保持 DOM（决策 D，零复刻成本），把隐藏范围从"整个 reference 墙"收窄为"词条容器"（`hideChips` prop，visibility 保留布局，度量不受影响）；顺带修复 canvas 模式缺层级名
- **重绘加载提示** —— 全量 measure+paint（初次进入/切换字号/过滤）是同步阻塞；`withPaintHint` 先渲染指示器帧（nextTick + 双 rAF）再执行，CSS 转圈由合成器驱动阻塞期仍可动；墙右上角"重绘中…"胶囊（hover 单芯片/增量重绘不触发）
- **cursor 状态修正** —— canvas 是大单元素，静态 cursor 会让整墙（含空白）恒显点击手势；改为命中检测驱动：悬停词条才显示（tooltip=crosshair / modal=pointer），空白与离开恢复默认箭头，与生产元素级表现一致
- **hover 动画并发 + 恢复漂移修复** —— ① 退场动画改为「每 chip 独立动画 Map」：A 退场中切 B，A 继续回缩到常态（此前单例状态机 cancel 掉 A 的动画，progress 停在半路卡死）；② **leave 帧重放原常态**（`paintChip` 全量：alphaFor 标定 read/dim、圆角白底、阴影、emoji 色与常态完全一致，此前自组装常态会漂移成全亮/直角）；③ `cancelHoverAnims` 中断时先把进行中的 chip 收敛常态（全量重绘/布局变更不留中间态帧）；④ enter 帧白底改圆角 `fillChipBg`；⑤ hover enter 关闭文字阴影（生产元素级 `text-shadow:none`）且 emoji 同黑，leave 恢复阴影。测试 +4（并发/无阴影/α 重放/中断收敛），CDP 像素实测：常态 0 → hover 100 → leave 520ms 复原 0 ✓
- **全墙点击失效（层叠修复）** —— 根因 P1 遗留：`.iceberg-tier` 的 `z-[1]`（hover:z-[9999]）把 canvas（`absolute; z-index:auto`）压在 reference 词条之下，指针事件全部落在 DOM 词条上，hover/点击从未真正生效（P2 冒烟靠 `?item=` URL 驱动，未覆盖事件路径）。修复：canvas `zIndex:50` + 实验页 `:deep(.iceberg-tier){z-index:0!important}`（z 不影响绘制像素，hover 视觉由 canvas 自身承担）。CDP 实测双模式：both/canvas 点击→弹窗、tooltip 模式 hover→ghost+tooltip 全部恢复
- **完整搜索与筛选（实验页此前搜索无 UI 入口、筛选缺大半）** ——
  - 搜索输入框（150ms 防抖、`/` 快捷键聚焦）、全文/标题模式切换——搜索管线端到端验证：`?q=公交车` → visible=4，`?q=无匹配` → visible=0 + items-empty/tier-empty
  - 标签筛选 68 个（折叠区 + 右键隐藏）、AND/OR 切换、已隐藏分类/标签恢复行、当前筛选摘要 chips（含"可见 N/1420"）
  - 特殊筛选四档（有链接/有描述/最新/需补充）、收藏筛选、分类按钮右键隐藏
  - 层空提示复刻进 ReferenceWall 模板（`tierEmpty()` helper，生产为 useFilterPipeline 动态插入 DOM）；组件测试 +2（99 通过）
- **ReferenceWall 复刻错落排布** —— 此前实验墙从未应用生产 id 哈希 translate（生产默认 floatMode=static，默认态对照即偏离）；按 ItemInteractivity 同公式套用（含 `& 0xffffffff` 有符号 32 位行为，负哈希偏移区间实测 (-4.49,1.49]/(-8.99,2.99]），canvas 度量 DOM 自动继承；watch 依赖 `[fm, rootEl]` 保证就绪即套用（生产 immediate 在兄弟容器挂载前会静默跳过）
- **控制台补齐选项** —— 点击模式（tooltip/modal，切换时清残留 tooltip）、错落（static/none）、排序（默认/标题 A→Z/Z→A/分类）、已读标记、NEW 标记；顺带修复 parity 偏差：`showReadMark=false` 时画布此前恒变暗已读条，现与生产门控一致
- 新增 ReferenceWall 组件测试 2 项（错落偏移公式/清零）


## v4.5.5 — 2026-08-19 — 标准模式=液态 · 帧率上调 · 耗性能提示

### 改进

- **「标准模式」预设改用液态背景** — 设置面板的「标准模式」按钮 `bgMode` 由静态冰山改为液态；首次访问默认背景也改为液态（新访客开箱即液态，未动过背景设置的用户自动生效）；legacy「动态」模式归一化目标同步改为液态。「冰山」静态模式仍作为独立选项保留。
- **液态背景帧率上调** — 默认帧率 30 → 60fps（60Hz 显示下等同不封顶）；冰山页静止 60fps、滚动自适应降帧 6 → 30fps。滚动时仍让 GPU 优先合成页面。

### 新增

- **耗性能橙字提示** — 设置面板背景分区：选中「冰山」或「液态」时显示橙色警告「此模式渲染开销较高，不能节省性能；低性能设备建议使用「纯黑」」（三语）；「纯黑」不显示（轻量模式）。


## v4.5.4 — 2026-08-19 — 液态背景性能专项

### 性能

- **去掉恒等 CSS filter** — v4.5.3 给 `LiquidGradient` 无条件套 `filter: brightness(1)` 会强制 WebGL canvas 每帧走滤镜管线、破坏直接 GPU 合成快路径（滚动卡顿）。改为仅在 `brightness ≠ 1` 时挂 filter，默认完全零开销。
- **渲染分辨率绝对上限** — `shaderCanvas` 的 `resolutionScale` 是乘在 dpr 上的，高分屏（dpr≥1.5）上"半分辨率"退化到接近全分辨率。新增 `MAX_BACKING=1440` 兜底：最长边超限等比降采样（CSS 放大、视觉无损），全页面生效。
- **帧率档位化** — `LiquidGradient` 新增 `fps` prop（默认 30）；冰山图液态背景静止 24fps（慢速流动视觉无差，开销 -20%）。
- **滚动自适应帧率** — 冰山图页滚动时液态降到 6fps（GPU 让位给页面合成，治滚动卡顿），停止 200ms 后恢复 24fps；湍流保持 7 档、形变细节完整。引擎新增 `setFps()` 动态调帧率。

### 修复

- **prerender 静态壳剥除 `==` 标记** — handbook 描述里的 `==...==` 强调语法在预渲染快照（爬虫/无 JS 用户）中原样显示，改为输出前移除。


## v4.5.3 — 2026-08-19 — 集体创作定位 · 主页彩蛋 · 粒子底图文件夹化

### 新增

- **根目录 README** — 面向站点使用者：项目定位（集体创作、非权威榜单）、功能概览、使用方式、社区公约、本地预览；正式书面语气，中文全名「中文兔子洞冰山图 / Chinese Oddities Iceberg Reforged」。
- **主页低调彩蛋** — 次级导航下方新增极淡「制作中」行：欧美兔子洞冰山图、日韩兔子洞冰山图（默认 opacity .5 / 悬停微亮），中英日三语词条。

### 改进

- **handbook 描述排版** — `white-space: pre-line` 保留 md 换行；新增 `==...==` 显式强调语法（标记不显示、内容淡橙高亮，支持跨行/嵌套），引号便捷写法保留；prerender 静态壳同步换行。
- **handbook 对齐** — 分类色点与 tag emoji 统一 `w-6` 引导槽，名字列垂直/水平对齐。
- **主页亮度对齐 handbook** — 液态背景改用低饱和暗色板 + 遮罩加深（顶 45% / 中 20% / 底 70%）。
- **背景调参统一** — 新增 `src/lib/bgTheme.ts`，5 个静态页共用 `BG_COLORS` + `BG_TUNING`（brightness / saturation / darkShift 三旋钮）；`LiquidGradient` 新增 `brightness` prop（CSS filter，回退图也生效）。主冰山图页保持滚动驱动 darkShift 独立。
- **主页粒子** — 鱼形底图接入轮换（30s/张）；变换过程提速（SPRING_DIV 30→22、淡入/淡出速率约 2.4×）；粒子源改为从 `public/assets/particles/` 文件夹读取 `manifest.json`（新图丢文件夹 + 加一行即可，含 `offsetY`/`offsetYPx` 位置字段），不再写死在组件里。
- **数据管线离线模式** — `build_data_api.py` 新增 `--input <file>`：API 不可达时可用本地保存的原始 JSON 走完整管线（映射 / F30 ID 持久化 / 校验门 / 原子写）。

### 数据

- **API 同步** — 词条 1411 → 1420（+9），8 层 / 15 分类 / 68 标签，`id_history.json` 锚点同步。

### 其他

- `related.csv` 修正误加的 UTF-8 BOM（会导致 Python 孤儿校验静默失效）；新增 12 条关联关系保留。
- `public/assets/_unused/` 移入 .gitignore（沙箱环境无法删除的待清理死文件）。


## v4.5.2 — 2026-08-19 — 弹窗遮罩加深

### 改进

- **弹窗遮罩 `rgba(0,0,0,.6)` → `rgba(0,0,0,.78)`** — 打开弹窗时背景更暗，面板更聚焦。


## 2026-08-19 — 修复液态背景模式变纯黑

### 修复

- **bgMode='liquid' 时液态背景不渲染（纯黑）** — 冰山背景静态化重写 `IcebergBg.vue` 时丢失 `import LiquidBg from './LiquidBg.vue'`，模板中的 `<LiquidBg v-if>` 被降级为未解析的自定义元素（仅 console.warn、无 error，静默不渲染），只剩 `bg-root` 黑底透出。补回 import；无头浏览器验证液态模式完整渲染（含半分辨率 backing store）。


## 2026-08-19 — 词条墙按需渲染（content-visibility）

### 性能

- **`.iceberg-tier` 启用 `content-visibility: auto`** — 视口外层级跳过 layout/paint/raster，1400+ 词条的渲染成本从 O(词条总数) 降为 O(视口内)：boot 长任务实测 **-60%**（1260→516ms，最差单任务 750→311ms），穿全页滚动 p95 从 69→56ms、最差帧 160→125ms（dev 注入对照；生产构建 A/B 见 2026-08-19 性能研究）。
- **`contain-intrinsic-size: auto 1800px`** — 首渲染前按 8×1800 估值（总估值 ≈ 实际页高 15652px，滚动条基本不跳）；渲染过一次后 `auto` 记住该层真实高度（实测层高 565-2964px，平均 ~1830px）。
- 功能回归验证：1411 词条完整渲染、滚底回顶正常、hash 深链弹窗正常、词条点击弹窗正常、无页面错误。


## 2026-08-19 — 冰山背景取消全部动态（死代码清理）

### 改进

- **冰山背景（bgMode='static'）动画全量移除** — 此前动画已被 `.bg-root.static` 暂停（视觉定格、成本为零），此番彻底删除死代码：`bg.css` 移除全部 `animation` 声明、10 组 `@keyframes`、`will-change`、`paused`/`static` 暂停规则与 prefers-reduced-motion 规则；云层（暂停态下几乎不可见）整层移除；光晕定格于原呼吸初值（opacity .5）。
- **`IcebergBg.vue` 精简** — 移除滚动暂停监听（`pauseBg` 的 class 切换每轮滚动触发两次样式重算）、`--bg-hf` 高度因子设置、`static` 类绑定；`useFilterPipeline.ts` 同步移除 `--bg-hf` 设置（过滤后页面高度变化时的一次强制测量 + 样式写入）。
- 视觉与此前暂停态一致（定格），液态/纯黑模式不受影响。


## 2026-08-19 — 弹窗开启卡顿与冰山背景合成层修复

### 性能

- **弹窗遮罩移除 `backdrop-filter: blur(4px)`** — 遮罩背后是整页冰山图（1400 词条 + 巨型背景层），模糊需全屏重采样；液态模式下背后 shader 每帧流动，blur 会逐帧重算。纯色半透明遮罩（rgba(0,0,0,.6)）已足够聚焦，与高亮去毛玻璃决策一致。
- **滚动锁补偿滚动条宽度** — `lockOverlay()` 此前直接 `overflow:hidden`：滚动条消失 → 视口宽度变化 → 1400 词条整页 reflow，与弹窗挂载挤在同一帧（开启卡顿主因）。现在锁滚时给 body 补偿等宽 `padding-right`，视口宽度不变。MobileSheet 同锁共用此修复（移动端滚动条宽 0，自动无操作）。
- **冰山背景 static 模式撤销 `will-change`** — `.bg-root.static *` 本已暂停全部动画，但 sky/云层/冰山/水体等约 8 个**整页文档高度**的层仍因 will-change 各占独立合成器层，滚动时逐层重合成。`will-change:auto` 让它们合并回常规绘制。


## 2026-08-19 — LiquidGradient 性能：半分辨率渲染 + 30fps 封顶

### 性能

- **液态渐变 shader backing store 降为 1/2 分辨率** — `shaderCanvas.ts` 新增 `resolutionScale` 选项（CSS 尺寸不变、浏览器放大）：低频有机渐变无锐利边缘，半分辨率视觉几乎无损，片元着色计算量降为 1/4。全站 LiquidGradient（含冰山页 LiquidBg、Home、Handbook、Features 等）统一生效。
- **帧率封顶 30fps** — `shaderCanvas.ts` 新增 `fps` 选项：rAF 循环保留但按帧间隔跳帧绘制，`u_time` 基于真实时间、动画速度不变；speed 0.2 的慢速流动 30fps 无感知差异。与半分辨率合计约 8 倍 GPU 开销削减。
- **关闭 WebGL antialias** — 全屏三角形着色器无几何边缘，MSAA 零收益白吃显存带宽。
- 背景：用户反馈部署版冰山页与液态渐变页明显卡顿、纯黑页面不卡，归因为全屏 shader（4 层湍流 × OKLab 转换每像素开销 × DPR2 全分辨率 × 60fps）。`turb-iter=7` 的流动细节保持不变。


## v4.5.1 — 2026-08-18 — 实验功能名称修正（三语）

### 修正

设置面板「实验功能」区六个开关的名称按实际行为重写（zh/en/ja 同步）：

- **浮动模式 → 错落排版（词条随机偏移）** — 原名完全误导：该功能无任何浮动动画，实际是词条按 id 哈希得到固定随机偏移（±3px）打破整齐排列。`ItemInteractivity.vue` 的误导注释一并修正。
- **沉浸式浮动按钮（悬停时显示）→ 沉浸模式（悬停时显示浮动按钮）** — 原名是名词短语，读起来像某个按钮的名字而非开关行为。
- **无层级（词条随机排序）→ 无层级模式（词条随机排列）** — 强调这是切换整个版式，不只是排序。
- **Random Entry → Random Entry Button / ランダム → ランダムボタン** — 补全「按钮」语义（开关控制的是按钮显隐）。
- **Highlight Recent → Highlight Recent Updates / Dim Read → Dim Read Entries** — 补全成完整短语；日文同步（既読を淡く表示 等）。

仅改 i18n 文案与注释，无逻辑改动；六个 key 均只被 `SettingsPanel.vue` 引用。


## 2026-08-18 — 修复沉浸模式 FAB 未生效

### 修复

- **沉浸式浮动按钮（悬停时显示）从未生效** — 根因：`IndexView.vue` 挂载 `content-enter` 后不移除，入场动画 `.content-enter .fab-btn { animation: fade-in ... both }` 的 forwards 填充让 `to { opacity: 1 }` 永久生效；CSS 动画优先于普通声明，把 `.immersive-group .fab-btn { opacity: 0 }` 永久压制。修复：fab-btn 入场动画 fill 改 `both` → `backwards`（入场后交还控制权给层叠规则），视觉行为不变。`.iceberg-tier` / `.sidebar-toggle` 的 `both` 不受影响（结尾态即常规态）。

### 排查记录

- **弹窗模式下 `tooltip-active` 无残留路径** — hover（`useTooltip.ts onMouseOver`）、随机词条（`showRandom`）、hash 导航三处入口均有 `dm === 'modal'` 守卫；`index.css` 中 `.tooltip-active` 未套 `:not([data-detail="modal"])` 属冗余但安全。


## 2026-08-18 — 高亮去毛玻璃 + 词条阴影调轻

### 改进

- **`recently-updated` 高亮移除毛玻璃** — 去掉 `backdrop-filter: blur(4px)`（移动端性能开销大），保留 `--white-80` 半透明白底 + 黑字。
- **词条 text-shadow 调轻** — `--shadow-color` 令牌 `rgba(0,0,0,.85)` → `rgba(0,0,0,.6)`（只降浓度，偏移/模糊半径不变），四向描边保留保证可读性。


## 2026-08-18 — 最近更新高亮微调 + 冰山图页入口调整

### 改进

- **`recently-updated` 高亮微调** — 透明度降一档（`--white-85` → `--white-80`），新增 `backdrop-filter: blur(4px)` 毛玻璃效果（含 `-webkit-` 前缀），底下内容轻微模糊透出。
- **冰山图页头部入口改为主页** — `Header.vue` 的「古籍」链接替换为「主页」（`/home`），新增 `navHome` i18n key（zh/en/ja 三语）；Home 页的古籍卡片入口保留不动。


## 2026-08-18 — 最近更新高亮改半透明

### 改进

- **`recently-updated` 高亮改为半透明白** — `--white-85` 令牌（85% 白）+ 黑字（原为实底 `--color-new` 黄 + 黑字），接近实底但能微微透出 hover 分类色底。
- 顺带修复：实底背景此前会完全遮住 hover 的分类色底滑入效果（`::before` z-index:-1），半透明后 hover 反馈可正常透出。


## 2026-08-18 — Home 页移动端重做

### 改进

- **Home 页移动端布局重做** — `/home` 在 ≤ 859px 视口下切换到移动版布局：跳过粒子冰山挂载（`v-if="!isMobile"`，竖屏构图不适用 + 省性能），液态渐变背景独自承担氛围。
- **卡片区改纵排** — 主卡（冰山图）全宽横排（标题+描述居左、箭头居右），古籍 / 3D 副卡双列并排，触控区加大（主卡 56px / 副卡 52px），新增 `:active` 缩放触摸反馈。
- **内容整体居中** — Hero 内容（历史上的今天 / 标题 / 统计 / 卡片 / 文字入口）在竖屏下垂直水平居中，限制 400px 列宽；顶部控件改为固定右上定位。
- 移动端检测用 `matchMedia('(max-width: 859px)')` 响应式监听（含横竖屏切换），`onMounted` 初始化（SSR 安全）、`onUnmounted` 清理。


## 2026-08-18 — 术语表板块更名

### 改进

- **术语表三板块更名** — `/handbook` 板块重命名：收录标准 → 划定标准、基本概念 → 各类概念、人物 → 人物作品。`各类概念` 定位为概念性知识收纳板块（元概念 / 行话 / 母题 / 意象），`人物作品` 合并人物与标志性创作体系，避免与「艺术创作物」标签单开重叠。
- 同步更新 `handbook.md`（三个 `##` 标题 + 首段 intro）、`HandbookView.vue`（TABS `heading`）、`prerender.ts`（两处 `title ===` 比对 + intro 文案）、三语言 i18n（`handbookTabCriteria/Concepts/People` label + `handbookIntro`）。`buildEntries`/`parseSections` 逻辑不变，`criteria` 仍自动派生。


## 2026-08-18 — 术语表板块合并

### 改进

- **「分类解释」与「标签解释」合并为「收录标准」** — 术语表（`/handbook`）原有四个板块精简为三个：收录标准 / 基本概念 / 人物。分类条目（带颜色点）与标签条目（带 emoji）合并到同一板块，按拼音首字母 A-Z 混排，视觉标记保留以区分两类来源。
- 同步更新 `HandbookView.vue`（TABS 注册 + `buildEntries` 新增 `criteria` 分支合并两类数据源）、`prerender.ts`（预渲染首板块条目数改为分类+标签总数）、三语言 i18n 字典（删 `handbookTabCategories`/`handbookTabTags`，加 `handbookTabCriteria`，intro 文案同步）、`handbook.md`（两个 `##` 合并为一个 `## 收录标准`）。


## v4.5.0 — 2026-08-16 — OG 社交封面重做

### 改进

- **`public/assets/og-cover.png` 更换为用户指定封面** — 使用 `中文兔子洞冰山图-oc.png`（1200×630）替换原 OG 封面，并将源图一并放入 `public/assets/`。
- **修复 3D 点击碎片同时弹出主站词条弹窗** — 主站 `IndexView` 的 `?item=` 监听增加 `route.path === '/'` 守卫，避免 3D 页面同步 URL query 时被 keep-alive 缓存的主站触发 `open-item-modal`。
- **3D 性能优化** — Bloom 后处理改为半分辨率渲染，降低 GPU 开销；背景流动动画从 `background-position` 改为 `transform: translate3d + scale`（GPU 合成），减少每帧重绘。
- **keep-alive 后台保活优化** — `LiquidGradient`、`IcebergParticles`、Home 光标圆环增加 `onActivated/onDeactivated` 暂停/恢复：页面切走后停止 WebGL 渲染循环、粒子 RAF/轮换、光标圆环 RAF，避免多个页面在后台同时跑动画导致整体卡顿；`ShaderCanvas` 新增 `pause/resume` 接口。
- **LiquidGradient 迭代次数** — 全站 `LiquidGradient` 明确使用 `:turb-iter="7"`，保持默认的高质量流动细节；性能优化主要依赖 keep-alive 后台暂停机制。
- **标签页后台暂停** — `LiquidGradient` 增加 `visibilitychange` 监听：浏览器标签页切到后台时暂停 WebGL，切回且页面仍激活时恢复；可见状态下表现不变。
- **ShaderCanvas 底层渲染优化** — 静态 uniform 只在首次或更新时上传，尺寸未变化时跳过 viewport/uniform 上传，减少每帧 CPU 开销；`u_colors` 改为 CPU 端预转 linear，shader 不再每像素重复 `pow`，视觉等价。
- **3D hover 颜色分配优化** — `setInstanceHoverColor` 复用 `scratchColor`，避免每次 hover 变更都 `new THREE.Color`，减少 GC 压力。
- **3D 取景框跟随零分配** — `getInstanceWorldPos` 支持传入 `target` 复用向量，动画循环中不再每帧 `clone()` 新 Vector3。
- **keep-alive 策略收紧** — `:max` 从 4 降到 3，并将 HomeView 加入 exclude，Home 页切走后直接卸载释放 WebGL/粒子资源。


## 2026-08-16 — 3D 冰山深度美学升级

### 改进

- **辉光后处理** — 引入 `UnrealBloomPass` 极克制 Bloom（强度 0.14 / 阈值 0.82），让橙色聚焦环与高亮宝石带柔和光晕。
- **冰体顶点色渐变** — 冰山材质开启 `vertexColors`，按高度从下方纯黑 → 中层深海蓝 `#0a5a99` → 上方冰蓝 `#bfd9f2` 渐变，强化「冰面受光、水下坠入深渊」的纵深感。
- **大气光晕层** — 3D 页面上方叠加 `mix-blend-mode: screen` 的橙色落日辉光 + 深海蓝环境光，增加氛围层次。
- **冰尘粒子** — 新增 320 颗近距离冰尘粒子，围绕冰山缓慢旋转，增强深海悬浮感；原星空保留并继续使用。
- **镜头与构图** — 初始相机从 `(18,11,26)` 缓慢推近到 `(12,7,18)` 的入场运镜（reduced-motion 直接到位），轨道阻尼从 0.05 提升到 0.08，画面更稳更有电影感。
- **界面补充** — 右上角新增毛玻璃「3D · ICEBERG」标识，与返回按钮形成对称的玻璃胶囊 UI。
- **深色类别色发光修复** — Bloom 阈值从 0.82 降到 0.55、强度提升到 0.22；宝石 shader 的自发光 `uCoreGlow` 从 0.025 提到 0.45，并用类别色本身作为发光色，Hover/Focus 再额外增强，解决深色分类「很难发光」的问题。
- **常态发光收敛为「最近修改词条」** — 普通词条自发光系数降到 0.12（几乎不发光），最近 30 天修改（NEW）词条使用高饱和分类色并常态发光（系数 1.3），Hover/Focus 保持最强（1.8）；实例颜色编码扩展为 普通 0–1 / NEW +1 / Hover +2。
- **背景改为流动流体** — 移除静态蓝色渐变，使用橙蓝黑流动背景铺在透明 3D 画布后方，并叠加黑色渐隐遮罩；加载/错误态改为半透明毛玻璃，露出流动背景。
- **3D 背景性能优化** — 流动背景从 `LiquidGradient`（第二个 WebGL 上下文）改为纯 CSS 动画渐变（`sky-flow` 24s 缓慢流动），避免与 3D 同时跑两个 WebGL 导致卡顿；`prefers-reduced-motion` 下停止动画。
- **修复 CSS 流动背景出现边框** — `.scene-sky` 与遮罩层统一 `inset: 0`，去掉之前扩大容器导致的可见矩形框。
- **聚焦指示改为相机取景框四角** — 聚焦圆环替换为橙色四角括号（左上/左下/右上/右下），仍保持 billboard 面向相机、随宝石缩放和 GSAP 动画。
- **聚焦框改为白色加粗** — 四角括号改用白色薄片方块（`MeshBasicMaterial` + `BoxGeometry`）拼成，避免 WebGL 线条宽度无效的问题，实际视觉更粗更清晰。
- **取景框不再参与 Bloom** — 聚焦框移到独立 `focusScene`，在 `composer.render()` 之后用 `autoClear=false` 单独绘制，白色四角保持锐利，不再被辉光模糊。
- **取景框四角连接优化** — 横向/竖向条改为外边缘对齐、角部实心重叠，消除连接处的缺口/错位。
- **切换聚焦时取景框平滑过渡** — 缩放不再瞬间跳到新大小，而是在切换目标时也从当前大小平滑缩放到新目标大小，避免目标处闪烁/跳动。
- **修复切换聚焦先闪到目标再回退的问题** — 动画循环中“未过渡时直接贴目标”的兜底逻辑增加 `ringPosAnimating` 标志，位置过渡期间不再提前把取景框瞬移到目标点。
- **3D 返回按钮改为返回首页** — 返回链接从 `/` 改为 `/home`，文案从 `back` 改为 `backToHome`（返回首页）。
- **Home 页新增登录/用户入口** — 左上角新增玻璃胶囊按钮（未登录显示登录，已登录显示用户名 + 橙色小点），与语言切换同组且放在最前面，尺寸与语言按钮保持一致；点击复用 `UserModal`；Supabase 未配置时不显示，空闲时懒加载 `authStore`。


## 2026-08-16 — 3D 冰山橙-蓝-黑美学与界面升级

### 改进

- **3D 场景配色改为橙-蓝-黑主题** — `engine.ts` / `materials.ts`：场景背景/雾改为深蓝黑 `#04101c`；主光源从冷白改为暖橙 `#ffb36f`，辅光改为深海蓝 `#0a5a99`，边缘光改为冰蓝 `#7db5dc`；冰体材质从冷白改为冰蓝 `#9fc8e8` + 深海蓝自发光；聚焦光环从蓝色改为主题橙 `#ff6a06`。
- **3D 页面 UI 升级** — `Iceberg3DView.vue`：返回按钮改为毛玻璃胶囊（`bg-black/45 backdrop-blur` + 橙色 hover）；详情面板改为深海毛玻璃（`rgba(5,8,14,.82)` + `blur(18px)` + 左侧阴影），标题/正文/标签/链接全部切换为白色透明度令牌；关闭按钮与链接 hover 使用橙色；加载 spinner 改为橙色高亮。
- **移动端细节** — 详情面板在移动端保持底部抽屉样式，同时使用新毛玻璃与橙色交互。
- **背景改为渐变星空** — WebGL 渲染器改为透明清屏（`alpha: true` + `setClearColor(0,0)`），页面背景使用深蓝→黑的径向渐变；3D 场景新增 700 颗远距离星点（冰蓝/白为主、少量暖橙），形成「深海渐变 + 星空」背景。


## 2026-08-16 — 专题页暂时改为开发中

### 改进

- **专题列表页与详情页临时占位** — `FeaturesView.vue` 和 `FeatureDetailView.vue` 暂时移除专题内容展示，改为统一的「开发中」空状态（橙色开发中徽章 + 说明文字），保持与全站玻璃卡片/白色透明度风格一致。
- **i18n 三语补齐** — 新增 `featuresWipBadge` / `featuresWip`（中 / 英 / 日），后续恢复专题页时可直接复用。
- **专题页背景与布局微调** — `FeaturesView.vue` / `FeatureDetailView.vue` 接入 Handbook 同款橙蓝黑流体背景与黑色渐隐遮罩；开发中卡片改为居中的毛玻璃圆角面板（`bg-black/45 backdrop-blur-md`），列表页容器宽度对齐 Handbook 的 `max-w-[1040px]`。


## 2026-08-16 — 历史上的今天页重构（对齐 Handbook / Home 美学）

### 改进

- **OnThisDay 页视觉重构** — `OnThisDayApp.vue` 从原来的 zinc 极简风改为项目统一的「深蓝黑流体背景 + 玻璃面板」语言：接入 `LiquidGradient` 橙蓝黑流体背景与黑色渐隐遮罩；左侧日历改为毛玻璃圆角面板（`bg-black/45 backdrop-blur-md border-white-08`），右侧事件流改为玻璃卡片列表；标题、正文、辅助信息全部切换为 `text-white-*` 白色透明度层级。
- **状态色对齐美学指南** — 选中日期使用橙色 `bg-accent text-black` 作为当前态，今天使用 `ring-accent-soft/60 text-accent-soft` 轻提示，事件指示点使用 `bg-white-35`，链接 hover 使用 `text-accent-soft`；卡片 hover 遵循 `border-white-12 bg-white-04`。
- **布局响应式优化** — 整页改为 `h-dvh overflow-hidden` 沉浸式布局，页面本身不滚动；桌面端左侧日历面板固定、右侧事件流为唯一纵向滚动区（细滚动条），移动端日历面板限高 45dvh 可内部滚动、事件区占剩余空间；选择日期后事件区平滑滚动回顶部。
- **返回入口改为首页** — 左上角返回链接从「返回冰山图 `/`」改为「返回首页 `/home`」，与 Handbook 一致使用 `backToHome` 文案。
- **左侧侧栏去卡片化** — 移除左侧日历面板的深色毛玻璃卡片背景与渐变遮罩，改为完全透明，仅保留细分割线，让左侧直接融入流体背景。
- **左侧下方留白平衡** — 桌面端左侧内容改为垂直居中（`lg:justify-center`），避免内容全部顶对齐导致下方大面积空白；移动端保持顶部对齐可滚动。


## 2026-08-16 — 加载页三点加载动画

### 改进

- **加载页三点增加跳动动画** — `index.html` 中 `.shield-dots i` 增加错峰上下跳动与透明度变化（`shield-dot-bounce`），三个点依次延迟 0.15s / 0.3s，体现加载中状态；`prefers-reduced-motion` 下保持静态。


## 2026-08-16 — 路由切换加载遮罩提前消失修复

### 修复

- **加载页不再提前消失露出旧页面** — 原逻辑在 `router.afterEach + nextTick` 就隐藏遮罩，但页面切换使用 `mode="out-in"` 过渡，旧页会先淡出、新页后淡入，导致遮罩消失后短暂看到旧页面。现改为由 `App.vue` 的 `transition after-enter` 派发 `route-ready` 事件，`AppShell` 收到后再隐藏遮罩；`afterEach` 仅设置 2500ms 兜底，异常情况下也不会永久遮挡。


## 2026-08-16 — Home 页粒子尺寸微调

### 改进

- **Home 页粒子冰山粒子稍微变大** — `IcebergParticles.vue` 粒子半径 `2.8 → 3.4`，视觉上更清晰，同时保持原有密度与动效。


## 2026-08-16 — Handbook 快速筛选条吸顶修复

### 修复

- **术语表快速筛选跳转条滚动后不再滚出屏幕** — `HandbookView.vue` 中原本用只包住自身高度的 `<div class="pt-6">` 包裹 `sticky` 导航条，导致吸顶包含块高度不足、滚动后筛选条随包裹层一起消失；现改为独立 `h-6` 占位 + 直接以整页容器为包含块的 `sticky top-3` 导航条，下滚后标签页与 A-Z 快速跳转条常驻屏幕顶部。
- **「← 返回首页」移到吸顶条右侧** — 从吸顶条首行左侧挪到右侧（`ml-auto`），标签页获得更完整的横向空间，移动端横向滚动时返回入口仍固定在右侧可见。
- **A-Z 行末尾 `#` 贴边修复** — 横向滚动容器的右 padding/margin 在滚动到末尾时可能被吞掉，改为在 A-Z 行末尾追加真实占位元素 `<span class="w-4 shrink-0">`，确保 `#` 滚动到最右侧时仍保留右侧间距。
- **A-Z 行小屏可滚动性** — 移除 A-Z 行的 `no-scrollbar`，改为显示细滚动条（`.hb-scroll-x`），小屏下用户能看到后面还有字母，也可拖动滚动条查看 `#`；并增加滚轮横向滚动支持（`onAZWheel`），鼠标用户滚动滚轮即可横向查看后面的字母。
- **桌面端 A-Z 行不再出现横向滚动条** — 桌面端字母按钮改为 `min-w-0 flex-1` 均匀填满整行，1920 等正常宽度下刚好放下 A-Z/# 且无滚动条；移动端仍保持 `max-sm:min-w-11` 大按钮 + 横向滚动。
- **标签解释词条 emoji 对齐** — 词条标题前的 emoji 改为固定宽度容器（`inline-flex w-6 justify-center`），不同宽度的 emoji 不再影响后方标签名对齐。


## 2026-08-16 — 新增冰山主图风格美学指南

### 新增

- **`docs/AESTHETIC_GUIDE.md`** — 以冰山主图为核心的美学规范：五个选择色（亮橙 `#ff6a06` / 橙光 `#ffb36f` / 深海蓝 `#0a5a99` / 冰蓝 `#7db5dc` / 纯黑 `#000000`）+ 中性色、60/30/10 比例纪律、主图天空 / 水下 / 冰面渐变、流体四原则（流体即光 / 水 / 形 / 时间）、构图层次、界面映射、动效节奏、禁忌清单与代码落地对照表。


## 2026-08-16 — 术语表页大幅改版

### 改进

- **页首标签切换** — HandbookView 改为四栏标签页：分类解释 / 标签解释 / 基本概念 / 人物；标签吸顶、支持左右方向键切换、`tablist/tab/tabpanel` 语义与选中态；`handbook.md` 二级标题同步重命名并新增「人物」空板块。
- **分类 / 标签自动填充** — 两个板块直接遍历 `categoryColors` / `tagMap` 生成，与当前冰山图分类、标签集合严格一致；md 中缺失解释时回退「待补充」，新增分类或标签无需改 md 即会自动出现在术语表。
- **A-Z 快速跳转回归** — 标题下方新增毛玻璃圆角吸顶条（`sticky top-3` + `backdrop-blur` + 胶囊圆角），包含返回首页、四个标签页与 A-Z/# 快速跳转，滚动时始终悬浮在屏幕顶部；`pinyin.ts` 重写为由 pypinyin 生成的 CJK 基本区全量首字母表（20901 单字）+ 名称级多音字映射（84 条），修复「扫描到第一个映射字」的误判逻辑（如「行业传说」正确归 H、「汽车・交通」归 Q）。
- **全局吸顶修复** — `body` 的 `overflow-y: hidden` 改为 `overflow-y: clip`（不创建滚动容器），修复 `position: sticky` 以 body 为滚动上下文导致的吸顶失效。
- **百科式排版 + 橙蓝黑流体** — 词条解释取消卡片框，改为标题 + 说明的百科式排版；页面新增固定视口 WebGL 流体背景，配色与 Home 页一致并按 70% 亮度压低（`#000000 → #012945 → #045B8D → #0076A2 → #B25512`），叠加黑色渐隐遮罩保证正文可读。
- **返回首页** — 吸顶玻璃条左侧新增「← 返回首页」入口（i18n 新增 `backToHome`，222×3 对齐）；`src/prerender.ts` 的 `/handbook` 静态快照同步加入返回链接。
- **三语 + 预渲染同步** — `src/prerender.ts` 的 `/handbook` 静态快照从 raw markdown 转储改为「页头 + 标签条 + 首个板块卡片」，分类 / 标签计数与首个板块条目以当前数据集为准，标题与导航文案统一为「术语表」。


## 2026-08-16 — Home 页关于 / 友链弹窗

### 新增

- **友链弹窗** — 新增 `LinksModal.vue`，Home 页「友链」入口由外链改为弹窗，展示互链站点「都市传说吧」（百度贴吧）并支持新标签打开。
- **关于弹窗** — Home 页「关于」入口由 GitHub 外链改为复用 `AboutModal`（构建时间 / 词条数来自当前数据）；`AboutModal` 底部补充 GitHub 仓库链接，保留原入口可达性。
- **i18n 三语补齐** — 新增 `linksIntro` / `linksTieba` / `linksTiebaDesc` / `aboutRepo`（212×3 对齐）。


## 2026-08-16 — Cloudflare Pages 构建适配（仓库根迁移后）

### 修复

- **CF Pages 构建失败（npm run build 找不到根 package.json）** — 仓库根新增 `package.json` 构建 shim：`npm --prefix iceberg-vue ci && npm --prefix iceberg-vue run build`，并用新增 `scripts/build-cf.mjs` 将 `iceberg-vue/dist` 镜像到仓库根 `dist/`，兼容 CF Pages 面板中仍指向根目录的 `npm run build` + `dist` 输出设置；本地按根目录执行 `npm run build` 验证通过（根 `dist/` 含 index.html / 404.html）。

## 2026-08-16 — authStore 测试修复：显式 mock userState

### 修复

- **CI 环境 authStore 测试全挂** — `authStore.test.ts` 原以为 `isSupabaseReady` 来自 `./supabase` mock，实际来自 `./userState`；CI 无 `.env` 时真实实现返回 false，同步提前退出导致 6 项失败。补 `vi.mock('./userState')`（atom user + isSupabaseReady true），本地模拟 CI（移走 .env）验证 80/80 全绿。

## 2026-08-16 — 文档分级：内部开发文档移出版本控制

### 移除

- **内部开发文档 git 忽略** — `docs/TODO.md`、`docs/plans/`（规划/设计草案）、`docs/audits/`（巡检/审计报告）仅限开发者查看，移出版本控制（根 `.gitignore` 新增忽略规则）；`docs/CHANGELOG.md`、`docs/DATA_WORKFLOW.md`、`docs/STYLE_GUIDE.md` 保留入库；`CLAUDE.md` 同步更新文档管理说明。

## 2026-08-16 — CSS 治理：Tailwind 令牌打通 + 硬编码清零

### 改进

- **Tailwind v4 设计令牌打通** — `themes/base.css` 重构为「`:root` 单一事实源 + `@theme inline` 暴露工具类」：语义色（accent/fav/new/danger/success/surface/modal-bg/tooltip/滚动条）、白透明度 ramp（`--white-*`）、字号阶梯全部映射为 Tailwind 工具类（`bg-surface` / `text-white-60` / `border-white-06` / `text-micro` …），`var(--color-*)` / `var(--white-*)` / `var(--font-*)` 历史写法保持兼容。`dark.css` 收敛为仅暗色专属 `--shadow-color`。
- **新增语义色 token** — `--color-danger`(#f87171) / `--color-success`(#4ade80)，替换 CommentPanel / MobileSheet / UserModal / AppendixEditView 的红绿硬编码；`#111` / `#0a0a0a` / `#020408` / `#0c0c0f` / `#09090d` / `#111118` 等 6 类表面色硬编码统一回 `--color-surface` / `--color-modal-bg`；HomeView 主卡 hover 渐变与光标环改用 `--color-accent-bright` / `--color-accent-soft`；OnThisDayApp 的 `bg-[#0c0c0f]` 改 `bg-surface`、`border-white/[0.06]` 改 `border-white-06`；全局 CSS 补齐（`index.css` 的 `.sheet-panel` `#111`、`.item-tag` `#fff`、`modal.css` 的 `.modal-header h2` `#fff`）。
- **模块去重** — 拖拽把手统一为全局 `.sheet-handle`（MobileSheet 与 IcebergApp 侧栏抽屉共用，删除重复的 `.drawer-handle-bar`）；滚动条隐藏统一为全局 `.no-scrollbar`（删除 IcebergApp / MobileSheet 内重复的 scrollbar 隐藏规则）。
- **字号硬编码清零** — HandbookView `11px` / `10px` 改回 `var(--font-tiny)` / `var(--font-micro)`。
- **组件 Tailwind 化** — NotFoundView（16 行）、FeaturesView（79 行）、CommentPanel（74 行）、UserModal（86 行）、TierNav（17 行）、FloatingButtons（39 行）scoped CSS 清零；MobileSheet（171→11 行，仅留 `.sheet-fade` 渐隐遮罩）；HandbookView 正文/分组/条目全转工具类，仅保留 A-Z 侧栏导航定位与动态状态（83→30 行）；FeatureDetailView 模板转工具类，仅保留 v-html 的 `:deep` 内容样式；HomeView 今日入口/标语/统计/次级导航转工具类，卡片区与响应式壳保留（174→140 行）；复用 `no-scrollbar` / `enabled:hover:` / `enabled:active:` / `max-sm:` / `bg-black/50` / `line-clamp-3` / `decoration-*` / `backdrop-blur` 等模块与变体。

### 移除

- **HomeView 橙色实心卡** — 移除 `.ds-card--main` 的橙色渐变背景、hover 渐变与「白字突出」覆盖，主卡回归与其他卡一致的玻璃卡语言（保留 2×2 大卡布局与 1.25rem 主标题尺寸）。

### 验证

- `typecheck` / `typecheck:test` 通过；**80/80 测试全绿**；生产构建 exit 0 且 `Prerendered 6 pages`；组件内 scoped CSS 总量 **~1520 行 → 941 行（-38%）**；产物核验 `bg-surface` / `text-white-60` / `text-fav` / `text-text-primary` / `decoration-white-20` / `-webkit-overflow-scrolling` 等工具类与 `--color-accent` / `--color-danger` 变量均正确发射。

## 2026-08-16 — MobileSheet 移动端触控与布局优化

### 修复

- **MobileSheet 触控目标** — 移除原先写在静态 style 里缺少 `px` 单位的 `minWidth/minHeight:44`，改为 scoped CSS `.sheet-action-btn` 统一 `min-width: 44px; min-height: 44px`，收藏/点赞/评论/复制、关联词条跳板和“打开链接”均达到移动端推荐热区。
- **移除左右箭头** — MobileSheet 不再展示上一项/下一项箭头；移动端以“关闭后点选其他词条 / 关联词条跳转”为主，避免一行塞入过多小按钮。
- **移除关闭按钮** — 手机端关闭抽屉依靠下拉手势或点击遮罩，不再在标题栏放 × 按钮，减少非阅读控件。

### 改进

- **对齐 PC 词条弹窗布局** — MobileSheet 内容顺序改为与 `EntryDetailCardNext` 一致：标题 → `EntryMetaBadges` 元信息徽章 → 描述 → 轻量链接区 → 关联/推荐词条分区 → 评论区。
- **底部操作栏弱化并随正文滚动** — 点赞 / 评论 / 收藏 / 复制收敛为抽屉底部的弱化内联操作（16px 图标、`--white-45` 低对比度、细分隔线），随正文滚动而非固定悬浮，进一步弱化非阅读控件。
- **抽屉滚动与底部渐隐遮罩** — 正文滚动区滚动条隐藏（WebKit/Firefox/IE），面板底部用绝对定位钉一条 `linear-gradient` 半透明渐隐遮罩（遮罩位于滚动区之外、不随内容滚动，内容滚过时在底部渐隐，静止时正文不被压住）。
- **压缩非词条信息** — 打开链接和参考链接合并为正文后的轻量文字链接，替代大按钮/大区块；关联/推荐词条分区也做了紧凑化。
- 标题支持长词条换行，按钮补充 `aria-label` 与 `focus-visible` 焦点样式。
- **Tags 显示健壮性** — `EntryMetaBadges` 与 MobileSheet 统一兼容 `tags` 为数组或字符串（含 JSON 数组字符串 / 逗号分隔）的情况，避免直接把数组样式渲染到页面上。

### 验证

- `typecheck:test` 通过；80/80 测试全绿；生产构建 exit 0。
## 2026-08-16 — 视觉风格审计优化批（style.md）

### 移除

- **历史风格指南删除** — `docs/audits/AESTHETIC_GUIDE.md`（美学指南，风格审计确认其历史）已删除；`docs/plans/NEW_LABELS_DESIGN.md` 中对它的引用改为对齐全局设计令牌。

### 改进

- **色彩令牌收敛** — `themes/base.css` 新增 `--color-accent`（#ff6a06）/ `--color-accent-bright` / `--color-accent-soft`、`--color-fav`（收藏琥珀）、`--color-new`（NEW 果冻黄）；替换 modal 提示、HomeView 主卡渐变/今日入口、附录编辑保存态、NEW 徽章、MobileSheet 收藏色等 6+ 处硬编码橙色；EntryDetailCardNext 收藏态改为 `.fav-on` 语义类。
- **dark.css 死变量清理** — 删除无消费的 `--color-surface-alt` / `--color-text-secondary` / `--color-text-tertiary` / `--color-sidebar-bg` / `--color-sheet-handle` / `--color-scrollbar-thumb`，以及 `--color-surface-overlay` / `--color-modal-overlay` / `--color-sidebar-border`、未消费的 `--sidebar-width`。
- **字号阶梯收敛** — 新增 `--font-micro(10px)/tiny(11px)/xs(12px)/sm(14px)/base(16px)`；22 个文件 155 处任意字号（0.5-0.95rem / 8.8px 级）统一映射到阶梯，最小可读字号提升到 10px；词条 emoji 徽章 0.5em→0.625em。
- **动效语言统一** — 新增 `--ease-out/standard/emphatic/hero/float` 五个曲线令牌，19 处 `cubic-bezier` 字面量全部收敛；`prefers-reduced-motion` 全覆盖：global.css 屏蔽全站 CSS 动画/过渡/平滑滚动、加载页内联样式静态化、3D 空闲自动旋转关闭、相机飞行改瞬移。
- **焦点体系** — global.css 新增全局 `:focus-visible`（`--focus-ring`）；清理搜索框/详情动作条/设置面板/附录编辑/评论输入等 7+ 处裸 `outline-none`/`outline: none`；HomeView/IcebergParticles 焦点环硬编码橙改 `--color-accent`。
- **触控目标补漏** — OnThisDayModal 前后切换按钮移动端 32px→44px，今日按钮补 min-height 热区。
- **层级对齐** — 侧栏遮罩/面板 9999/10000 → 10002/10003（盖过 FAB），加载页独占 10000 层；index.css z 层级表同步更新。

### 验证

- 全库扫描：无残留 sub-1rem 任意字号、无裸 outline-none、无游离橙色/曲线硬编码（令牌定义除外）；`typecheck` / `typecheck:test` 通过，测试与生产构建待本批末尾复验。

## 2026-08-16 — SPA 预渲染 + 加载页实现重构

### 新增

- **构建期预渲染（解决 SPA 无预渲染）** — 引入 `vite-prerender-plugin`（0.5.x，Vite 7 原生支持，Node renderToString 模式，零浏览器/Puppeteer 依赖）；新增 `src/prerender.ts`：构建时为 `/`、`/home`、`/handbook`、`/features`、`/features/:slug`、`/on-this-day` 生成真实内容快照注入产物 HTML 的 `#app`（首页分层词条入口、手册全文、专题列表与正文、今日档案）；各页按路由注入 `<title>` / `lang` / `canonical` / `og:url`（模板移除静态 canonical/og:url，浏览器端 `router.afterEach` 负责创建/更新）。产物验证：6 页全部预渲染，`dist/{home,handbook,features,features/000-placeholder,on-this-day}/index.html` 生成，内容与 canonical 正确；爬虫/无 JS 用户直接可见，Vue 启动后接管。
- **加载页 no-JS 说明** — `index.html` 新增 `<noscript>` 静态站点说明（正常浏览不显示，不影响加载页视觉）。

### 改进

- **`#app-shield` 代码实现重写（视觉完全不变）** — 保留原网站 icon + 中文标题 + 英文副标题 + 三点动画；删除 AppShell 中 Hero 遗留分支、`sessionStorage` 魔法状态、一次性 `vue-ready` 监听与 100ms 假事件；改为路由驱动：`router.beforeEach` path 变化时显示遮罩（含清除未触发的淡出定时器防快速切换竞态）、`router.afterEach` + `nextTick` 后淡出、`vue-ready` 幂等确认、2500ms 兜底、bfcache `pageshow` 恢复；AppShell 样式收敛为仅 `.hidden` 过渡，消除与 `index.html` 内联样式的双份漂移。

### 验证

- `typecheck` / `typecheck:test` 通过；**80/80 测试全绿**；生产构建 exit 0 且输出 `Prerendered 6 pages`；产物核验：首页/手册/专题/今日快照与 per-route canonical 全部正确，原加载页 icon 与标记保留。

## 2026-08-16 — seoarch P1/P2 修复批

### 修复

- **favicon 深链 404（P1）** — `index.html` 图标改 `%BASE_URL%assets/iceberg.svg`，Vite 构建改写为带 base 的绝对路径（实测产物 `href="/iceberg_reforged/assets/iceberg.svg"`），深链页不再解析到错误相对路径。
- **SEO 补全（P1）** — index.html 新增 meta description / robots / Open Graph（含 1200×630 `og-cover.png`，PIL 生成 32KB）/ Twitter Card / canonical；新增 `public/robots.txt` 与 `public/sitemap.xml`（7 条正式路由，权威域名 RookieInvestigator.github.io）；新增 WebSite JSON-LD，CSP `script-src` 按 `sha256-…` 内容哈希精准放行数据块（meta 与 `_headers` 同步）；`router.afterEach` 按当前路由动态更新 canonical 与 og:url（双部署 base 自动适配）。
- **html lang 跟随语言（P1）** — `i18nStore` 监听 lang atom，切换 zh/en/ja 时同步 `document.documentElement.lang`（zh-CN / en / ja）。
- **剩余 @click div 键盘化（P1）** — IcebergApp 搜索「全文/标题」与标签「OR/AND」两个切换器 div → `button` + `aria-pressed`。
- **TierNav 对比度（P2）** — `.tier-nav-btn` 45→60、`.tier-nav-item` 40→60、hover/active 75/65→90，功能性文本达到 AA。
- **MobileSheet 焦点陷阱（P2）** — 面板 `tabindex="-1"`；打开时焦点移入首个可聚焦元素，Tab / Shift+Tab 循环不逃逸，Esc 关闭，关闭后焦点还原到触发元素。
- **UserModal 表单可访问性（P2）** — nickname/email/password 三组 label-input 补 `for/id`；输入框 `:aria-invalid="!!errorMsg"`；错误信息 `role="alert"`。
- **BaseModal 关闭按钮 aria-label（P2）** — `&times;` 按钮接 `t('close')` 三语。
- **HeroSection img alt（P2）** — 硬编码中文改 `:alt="t('siteTitle')"`。
- **专题页 i18n（P2）** — 三语新增 6 key（featuresTitle/featuresIntro/featuresRead/featuresEmpty/backToFeatures/loading，208×3 对齐）；FeaturesView 页头/阅读链接/空状态与 FeatureDetailView 返回链接/加载文案全部入字典；FeaturesView 卡片补 `role="button"`。

### 验证

- `typecheck` / `typecheck:test` 通过；**80/80 测试全绿**；生产构建 exit 0（2007 模块）；产物验证 favicon base 改写、CSP 哈希、JSON-LD、robots.txt/sitemap.xml/og-cover.png 全部就位。

## 2026-08-16 — ?r= 深链消费修复（P1-13）

### 修复

- **404 深链恢复参数接入** — 此前 `public/404.html` 只负责把原始 `path+search+hash` 编码进 `?r=` 跳回 SPA，应用侧零消费导致 GH Pages 深链路径丢失。新增 `lib/deepLink.ts`（`parseRedirectParam`：还原 404.html 的 encodeURIComponent 值，处理路由器已解码一次后的二次百分号解码、query/hash 拆分、非法编码回退 null）与 `lib/redirectGuard.ts`（路由守卫：无 `r` 放行；有效 `r` 还原目标路由并 replace 跳转且移除地址栏 `r`；非法/空 `r` 仅清理参数、停留在当前路径，不产生跳转循环）；`router/index.ts` 注册 `beforeEach(redirectGuard)`。
- 新增 12 个单测：`deepLink.test.ts`×7（纯路径 / query / hash / 二次解码 / 非法编码 / 空值）+ `redirectGuard.test.ts`×5（放行 / 还原 / 数组取值 / 非法清理 / 无二次匹配）。

### 验证

- `typecheck` / `typecheck:test` 通过；**80/80 测试全绿**（13 文件）；生产构建 exit 0（2007 模块）。

## 2026-08-16 — 审计「部分修复」收尾批

### 修复

- **BaseModal 对话框语义与焦点管理（P1-7）** — 面板补 `role="dialog"` / `aria-modal` / `aria-labelledby`（`useId()` 生成标题 id）+ `tabindex="-1"`；打开时焦点移入面板首个可聚焦元素，Tab / Shift+Tab 在面板内循环不逃逸，卸载时还原到触发元素；新增 `BaseModal.test.ts` 4 个组件测试（语义/移焦还原/Tab 循环/Esc）。
- **对比度残余（P1-9）** — SettingsPanel 导出/导入按钮 35→60；AboutModal 构建信息 30→50、页脚 25→55；BulletinModal 折叠箭头 25→60、日期作者 20→45；BaseModal 关闭按钮 25→60；Iceberg3DView 加载/返回/关闭/描述/链接等 20-33→60-90；`public/404.html` 兜底文本 #ffffff33/#ffffff55→#ffffff99/#ffffffb3。
- **i18n 补漏（P2-17）** — 三语字典新增 17 key（close/back/notFound/loading3d/webglUnsupported/noDescription/openLinkShort/prevMonth/nextMonth/ancient* 等，202×3 对齐）；MobileSheet 4 处硬编码 aria-label 全部入字典；NotFoundView / Iceberg3DView / AncientBookView 页面文案接 `t()`；OnThisDay 月份名随界面语言本地化（zh/ja「3月」、en「Mar」）。

### 移除

- **死设置清理（P2-16）** — settingsStore 删除无 CSS 规则且无 UI 入口的 `showLinkEmoji` / `showDescEmoji`、无消费者的 `noItemShadow` 三个 storedAtom（16→13），以及全库无引用的 `FONT_SIZE_MAP` / `FONT_LABELS`；IcebergApp 同步删除对应的 classList 切换 watchEffect。

### 改进

- **CLAUDE.md 漂移修正（P2-22）** — 组件树去掉已删的 StaticHeader 并补全 home/iceberg3d/新组件与 lib 清单；路由 11+1→10+1、storedAtom 15→13、Hero 标注暂时下线、古籍模式描述改声明式、构建配置（esbuild drop/pure、manualChunks 函数式、双 base）与关键常量表同步现状。
- **供应链（P2-18）** — vite 6.4.3→7.3.6、@vitejs/plugin-vue 5→6.0.8；`overrides` 强制 nanoid 3.3.18；官方 registry `npm audit` 0 漏洞（此前 15 high）。

### 验证

- `typecheck` / `typecheck:test` 通过；**68/68 测试全绿**（11 文件，新增 BaseModal×4）；**Vite 7 生产构建 exit 0**（2005 模块）；`npm ls` 依赖树无冲突；官方 registry `npm audit` 0 漏洞。

## 2026-08-16 — 性能审计修复批（perf.md）

### 改进

- **首屏 chunk modulepreload 自动注入** — 新增 vite 插件 `first-screen-preload`（closeBundle 解析产物后改写 index.html）：IndexView 及其全部静态依赖（csv/useI18n/userState/iceberg/data/LiquidGradient 等）+ IndexView CSS 生成 `<link rel="modulepreload">`/`<link rel="preload" as="style">`，消除「index → IndexView → 依赖链」串行瀑布。产物验证：9 个预载标签正确注入。
- **词条墙 dim 过滤响应式化** — 新增 `DIM_ITEMS_KEY` 注入；dim 模式由 1409 次命令式 `classList.toggle` 改为响应式变暗集合下发，IndexView / ScatterField 模板 `:class` + `v-memo`（memo 依赖含 id/变暗态/可见态，只重渲染状态翻转的词条）。
- **3D 拾取节流** — engine `onPointerMove` 位移阈值 4px：微动不再触发 24 个 InstancedMesh 全量 raycast（1409×10 矩阵投影）；静止时仍由既有 20Hz 低频追踪旋转星轨。
- **normalizeData 模块级缓存** — WeakMap 缓存，4 个路由入口重复 normalize 同一静态 JSON 只算一次。
- **3D 后台暂停** — Iceberg3DView 监听 visibilitychange 自动 pause/resume 渲染循环；/3d 加入 keep-alive exclude（类古籍模式，避免 GPU 资源常驻）。
- **readItems 上限 2000** — markRead 超出丢弃最早记录，防 localStorage 无界增长（最大 ~16KB）。
- **fuse manualChunks 死规则清理** — 主线程无人 import fuse（仅 worker 内嵌），产物不再生成独立 fuse chunk。
- **bg.css reduced-motion 停帧** — `prefers-reduced-motion: reduce` 下全屏背景多层动画关闭。
- 未做（Hero 相关）：响应式图/preload/等待时长 —— hero 页已暂时移除，恢复时一并处理。

### 验证

- typecheck + typecheck:test exit 0；64/64 测试全绿；生产构建 exit 0；产物验证 preload 标签注入 + fuse chunk 消失 + 首屏仍零 supabase 引用。

## 2026-08-16 — 代码质量第三波（续）：ItemInteractivity 拆 4 composable（codeq.md）

### 改进

- **ItemInteractivity 大组件拆分（582 → 222 行）** — 按 codeq 建议拆为 `src/lib/iceberg/` 下 4 个 composable，组件本体只剩编排职责（注入/弹窗抽屉状态/事件委托/hash 导航/随机入口/float 模式）：
  - `useSearchWorker.ts`（39 行）— Worker 引导 + F09 请求序号 + initSearch；⚠️ Worker URL 已随迁移改为 `../search.worker.ts`（构建产物验证 chunk 正确接线）；terminate 由 onScopeDispose 接管
  - `useRelatedIndex.ts`（76 行）— 相关词条索引（空闲预建 + 兜底同步构建）+ pickRelated
  - `useFilterPipeline.ts`（139 行）— F14 过滤管线（快照 + rAF 调度）+ F15 matchesFilter/filterSnapshot + 已读/NEW 标记（含 onMounted 补应用）
  - `useTooltip.ts`（113 行）— tooltip 控制器（200ms 延迟/滚动防误触/位置自适应）+ hover 事件；滚动监听与定时器清理移交 onScopeDispose
- 备份保留：拆分前版本存档于 `data/archive/ItemInteractivity.vue.pre-split-2026-08-16.bak`（25KB）。
- 拆分零行为变更：watchEffect/onMounted/监听器清理语义与原实现一一对应（Worker 终止、relMap 调度取消、scroll/hover 清理、filterRaf 取消）。

### 验证

- typecheck + typecheck:test exit 0；64/64 测试全绿；生产构建 exit 0；search.worker chunk 正常生成且被 IndexView 正确引用；首屏 chunk 仍零 supabase 引用。

## 2026-08-16 — 代码质量第三波：useEntryInteractions 消灭详情实现重复（codeq.md）

### 改进

- **新增 `src/lib/useEntryInteractions.ts`（99 行共享 composable）** — 收敛 EntryDetailCardNext / MobileSheet 原先三处重复的逻辑：`toggleFav`（原逐字相同）、点赞/评论计数加载（F12 请求序号防串项，原三段同构）、`toggleItemLike`、`copyShareLink`（统一为带定时器清理 + onScopeDispose 自动释放的版本）、评论区展开开关与 `commentsOpen` 重置；词条 id 切换时自动复位状态并重载计数。
- **新增原子组件** — `EntryRelatedLinks.vue`（modal 单行 chips / sheet 分块描边两变体，桌面弹窗与移动抽屉共享）与 `EntryMetaBadges.vue`（层级/分类/标签徽章行）。
- **EntryDetailCardNext（~310 → 167 行）与 MobileSheet（~268 → 156 行）重构接入** — 两文件不再定义 `toggleFav`/`fetchInteractionCount` 等任何重复逻辑；模板徽章行与关联/推荐区换原子组件；登录态改用轻量 `userState`（不再各自引 authStore）。
- **新增 6 个 composable 回归测试** — 挂载加载计数、收藏开关、乐观点赞、词条切换复位、F12 慢响应丢弃、复制反馈 1.5s 复位。
- 3D 侧栏（Iceberg3DView）核实为纯展示实现（无交互逻辑重复），暂不接入。

### 验证

- typecheck + typecheck:test exit 0；**64/64 测试全绿**（10 文件，新增 6 个）；生产构建 exit 0；首屏 chunk 仍零 supabase 引用（authStore 55.99KB gz 保持懒加载）。

## 2026-08-16 — 代码质量小项：测试 colocated + tsconfig 分层 + 白色令牌（codeq.md）

### 改进

- **测试文件 colocated** — 6 个测试从 `src/tests/` 迁回被测文件旁（`src/lib/{authStore,overlayLock,supabaseData}.test.ts`、`src/components/iceberg/ScatterField.test.ts`、`src/components/items/{CommentPanel,EntryDetailCardNext.comments}.test.ts`），相对导入同步修正；`src/tests/` 目录删除。vitest include（`src/**/*.test.ts`）不变。约定写入 CLAUDE.md。
- **tsconfig 分层** — 新增 `tsconfig.base.json` 存共享 compilerOptions；`tsconfig.app.json`（构建类型检查，排除 `*.test.ts`）与 `tsconfig.test.json`（`vitest/globals`）均 extends base；根 `tsconfig.json` 仅作 IDE 全量索引。三份重复配置消除。
- **白色透明度收敛为设计令牌** — `themes/base.css` 新增 White-alpha ramp（49 个 `--white-XX` 令牌，命名 = 百分比整数）；20 个文件、206 处 `rgba(255,255,255,α)` 与 12 处 `#ffffffXX` 全部替换为 `var(--white-XX)`（hex 按最接近透明度映射，视觉无感差异）。canvas JS 颜色（shaderCanvas.shadowColor）除外不替换。构建产物 CSS 验证：零裸 `rgba(255,255,255` 残留。约定写入 CLAUDE.md（禁止新写硬编码）。

### 验证

- typecheck + typecheck:test exit 0；58 测试全绿；生产构建 exit 0；产物 CSS 令牌覆盖完整。

## 2026-08-16 — 代码质量第二波：注入类型化 + 核心组件 lang=ts（codeq.md）

### 改进

- **provide/inject 全量类型化** — `injectionKeys.ts` 由 1 个 Symbol 扩为 12 个：11 个字符串 key（tierOrder/categoryColors/tagMap/defaultColor/renderItems/descMap/heroTitles/relatedMap/referencesMap/openOnThisDay/idAliases）全部建 `InjectionKey<T>`，并新增 `RenderItem`（IcebergItem & { tier }）与 `ReferenceLink` 类型；IndexView 的 provide 与 7 个消费组件（ItemInteractivity/IcebergApp/TierNav/MobileSheet/Header/HeroSection/ScatterField）的 inject 全部换键。键名拼写错误从「静默回退默认值」变为编译期报错。
- **ItemInteractivity 补 lang="ts"**（约 575 行最复杂组件）— 全量参数/局部变量注解：RenderItem/HTMLElement/Event 系列、`querySelectorAll<HTMLElement>` 泛型、`closest<HTMLElement>`、相关词条索引 Map 显式类型、type guard 收窄（filter(Boolean) → `(r): r is RenderItem`）、timer 统一 window.setTimeout（DOM 类型返回 number）、`setProperty` 传 String()。零 `any` 新增（仅 tipRef/sheetItem/modalItem 三个 ref 用 `any` 规避组件实例类型缺口）。
- **IcebergApp 补 lang="ts"** — ref 类型化（interactivityRef 收窄为 { showRandom } 接口）、事件参数注解、FONT_SCALE 改 `Record<string, string>`、模板输入事件改具名 handler + `as HTMLInputElement`。

### 验证

- vue-tsc + typecheck:test exit 0；58 测试全绿；生产构建 exit 0。

## 2026-08-16 — 代码质量第一波：死代码与 CSS 治理（codeq.md）

### 移除

- **删除 `ItemModal.vue`（175 行死代码）** — 全库零 import（仅注释提及），其 toggleFav/copyShareLink/toggleItemLike/keydown 已在 EntryDetailCardNext / MobileSheet 重复实现。
- **删除 `src/data/iceberg.json.bak`**（972KB 孤儿文件）。
- **index.css 清 legacy** — 删 v3 的 `@tailwind base/components/utilities` 三条指令（v4 唯一入口为 global.css 的 `@import "tailwindcss"`）；删空注释段；删死过渡块（`.fade-*`/`@keyframes modal-in|out`/`.fade-up-*`：全库无 `<Transition name="fade">` 消费者，fade-up 由 BaseModal scoped 0.1s 唯一定义，modal-in 动画已死）。
- **git 索引清理（仅 --cached）** — `tsconfig.tsbuildinfo` 不再跟踪（`*.tsbuildinfo` 忽略规则生效）；`src/data/data.js` 索引残留移除。

### 备注

- 核实后**保留** `.bg-root.paused`（IcebergBg/BulletinModal 实际在用）与 `.item-tag { color:#fff }`（删除会改变 emoji 颜色，非明确死代码），与审计判定不同。

### 验证

- vue-tsc + typecheck:test exit 0；58 测试全绿；生产构建 exit 0。

## 2026-08-16 — 审计 P1 第一批修复（1→4）

### 修复

- **评论加载失败卡死（P1-12）** — `CommentPanel.vue`：`load()`/`loadMore()` 补 try/catch，首屏失败显示错误提示 + 重试按钮，加载更多失败时按钮原地变错误态可直接重试；三语字典补 `commentsLoadFailed`；新增 2 个组件级回归测试（首屏失败重试 / 分页失败重试），CommentPanel 测试 3/3 全绿。
- **词条墙键盘可达性（P1-6，WCAG 2.1.1）** — 1400 词条 span 补 `tabindex="0"` + `role="button"`；`ItemInteractivity.vue` 新增 keydown 事件委托（Enter/Space 复用点击链路，成对清理）；index.css 补 `.iceberg-item:focus-visible` 焦点环。
- **对比度 + 触控目标（P1-8/P1-9）** — 功能性文本统一提到 AA 4.5:1 以上：Header 导航 25→60、SettingsPanel 标签/选项/指示点（25/35/20→50/60/55）、NotFoundView 正文与链接、MobileSheet 头部 6 个动作按钮图标 0.2→0.6 且触控区 44×44、EntryDetailCardNext 动作条/关联链接、IcebergApp 搜索模式开关/清空/筛选 chip、CommentPanel 内部文本；设置面板移动端按钮 min-height 44px，filter-chip 移动端 min-height 40px；搜索框补 focus ring。
- **Supabase SDK 移出首屏（P1-10）** — 新增轻量 `lib/userState.ts`（user atom + 环境检查，无 SDK 依赖），Header 改走 userState + UserModal 懒加载 + authStore 空闲预载（会话恢复延后到 idle，登录态展示不受影响）；`ItemInteractivity.vue` 的 EntryDetailCardNext / MobileSheet 改 `defineAsyncComponent`（MobileSheet 首次打开才挂载，保留滑入/关闭动画）+ 空闲预取两个 chunk。**构建验证**：SDK 仅存在于 authStore 懒加载 chunk（219KB raw / 55.99KB gz），入口与 IndexView chunk 静态图零 supabase 引用，首屏网络请求消除。

### 验证

- vue-tsc + typecheck:test 双类型检查 exit 0；58 测试全绿（9 文件）；生产构建 exit 0。

## 2026-08-16 — Hero 页暂时移除

### 移除

- **Hero 欢迎页暂时下线** — `IndexView.vue` 中注释掉 `HeroSection` 的导入与挂载（组件文件保留未删除）；入场动画不再等待 `hero-exit` 事件，改为挂载后直接加 `content-enter` 播放。恢复时还原三处 `TEMP` 注释即可。

## 2026-08-16 — HomeView 视觉迭代（DeepSeek 布局 × 原暗色液态）

### 改进

- **布局重构为 DeepSeek 2026 范式** — 页头（站名 + 三语切换）→ 全页液态渐变（LiquidGradient，头尾透明融入、无滚动沉海）→ hero 左右分栏 → 单行极简页脚。
- **右栏为粒子冰山 + 潜入箭头** — 新增 `src/components/home/IcebergParticles.vue`：Canvas 2D 粒子聚合动画（约 260 粒子，随机起点聚合为三峰冰山 + 水下梯形轮廓，白/蓝/橙三点色，聚合后呼吸微动），下方橙色 ArrowDown 箭头呼吸浮动；整区可点击进入主冰山图；reduced-motion 下静态呈现。
- **左栏** — 公告条 + 站名大标题（Noto Sans SC 200 细字重 + 0.16em 大间距，index.html 补加载 200/300 字重）+ 词条统计 + 三张同级玻璃卡（古籍 / 3D / 历史上的今天）+ 页脚次级入口（专题 / 手册 / GitHub / 数据来源）。
- **对齐** — 桌面分栏左栏贴底 + 粒子区 stretch，三卡底边与粒子冰山箭头底边同水平线。

### 验证

- typecheck:test 通过；56 测试全绿；生产构建 exit 0。

## 2026-08-16 — HomeView 重设计（DeepSeek 风格 × 暗色液态）

### 改进

- **布局重构为 DeepSeek 2026 范式** — 左右分栏：左栏公告条（✦）+ 大标题「冰山之下」+ 双玻璃 CTA 卡（历史上的今天 / 3D 冰山）+ 词条统计；右栏为**冰山图本体大卡**（深海渐变 + 低多边形冰山 SVG + 星光 + 漂浮动画，整卡点击进入主图，橙色渐变 CTA）。
- **保留原暗色风格** — LiquidGradient WebGL 液态渐变背景 + 暗角 vignette + 液态种子随机重掷；去掉滚动沉海（用户要求）；玻璃卡/冰山大卡全部暗色玻璃质感。
- **现代细节** — 桌面光标跟随橙色圆环（pointer:fine + reduced-motion 关闭）；文案三语精简；字号字重现代化（去 text-shadow，标题 600）。
- **极简页头页脚** — 页头仅品牌 + 语言切换（zh/EN/日本語，直接写 i18nStore）；页脚收敛为单行弱存在感链接（探索入口 / GitHub / 数据来源）+ 一行版权小字；移除时钟与多列企业式页脚。
- **i18n 补漏** — 首页文案全部入字典（homeNews/homeSlogan/homeCta*/homeIceberg*/homeStats/footer* 等 15+ key ×3 语言），HomeView 不再硬编码中文。

### 验证

- typecheck:test 通过；56 测试全绿；生产构建 exit 0。

## 2026-08-16 — 评论面板不可见修复 + 控制台红错清理（P0 后续）

### 修复

- **评论面板内容不可见（裸 template inert bug）** — `CommentPanel.vue` 模板中 v4.3.1 重构残留的裸 `<template>` 包裹标签被 Vue 编译为原生 HTML template 元素，浏览器对其内容**惰性不渲染**，导致展开评论区后只看到空壳 `.cmt`。删除包裹标签，内容直接渲染在 `.cmt` 下。新增 2 个组件级测试防回归：`EntryDetailCardNext.comments.test.ts`（点击评论按钮 → 评论区渲染链路，含 BaseModal Teleport 查询模式）与 `CommentPanel.test.ts`（断言 .cmt-hd/.cmt-empty 真实可见且 .cmt 内无原生 template 元素）。
- **控制台红错清理** — ① CSP meta 移除 frame-ancestors（浏览器不支持 meta 传递该指令，保留在 _headers）；② img-src 白名单加入 count.moeyy.cn（Moe 计数器图）；③ interaction_counts RPC 404 静默降级（migration.sql 未在线上执行时不刷红，计数暂显 0）。
- **EntryDetailCardNext TDZ 修复** — `commentsOpen` 声明前移到 watch（immediate）之前，消除「Cannot access commentsOpen before initialization」。

### 验证

- typecheck:test 通过；**56 测试全绿**（新增 2 个组件测试）；生产构建 exit 0。

## v4.5.0 — 2026-08-16（审计 P0 修复）

### 修复

- **RLS 公开读收紧（封堵邮箱前缀枚举链）** — `supabase/migration.sql`：`interactions_select` 由 `USING (true)` 收紧为 `USING (auth.uid() = user_id)`（原先任何人可枚举全站点赞/收藏明细）；新增 `interaction_counts(target_type, ids)` SECURITY DEFINER RPC（search_path 固定 + GRANT anon/authenticated）供匿名计数，不暴露 user_id 明细；`user_display` 单行版与批量版对齐（只返回有 display_name 的行 + SET search_path）并 REVOKE anon/authenticated 执行权（前端零调用）。前端 `supabaseData.ts` 两处计数（`fetchInteractionCount` / `fetchComments` 点赞聚合）改走 RPC；测试 fake 补 rpc 实现与断言更新。**⚠️ 需在 Supabase SQL Editor 重新执行整个 migration.sql 才生效。**
- **related.csv 副表数据恢复** — 从 git 406b217 恢复 23 条关联（此前回归为 0 行，前端「关联词条」功能空转）；全部 source/target ID 经脚本核实在当前 1409 词条中有效；重写为无 BOM UTF-8。已暂存。
- **CI 测试闸门** — `deploy.yml`：build 前新增 `npm run typecheck:test` + `npm run test` 步骤（绿了才构建/部署）；新增 `pull_request` 触发（paths 收敛至 iceberg-vue/**）；补 `concurrency: cancel-in-progress` 与 `timeout-minutes: 15`。
- **CSP 双轨配置** — `index.html` 加 meta CSP（default-src/script-src self；style 白名单 fonts.googleapis；font gstatic；img data/blob；connect supabase.co + 本地 ws；worker blob；object none；frame-ancestors none）；`public/_headers` 同步（CF Pages）+ nosniff/Referrer-Policy/Permissions-Policy。
- **数据完整性** — `id_history.json`（F30 锚点，此前被 .gitignore 误伤从未入库）与恢复后的 `related.csv` 已 git add 暂存（仍未 commit，待授权）。

### 验证

- `typecheck:test` 通过；54 测试全绿（含 RPC 适配后的 fetchComments 聚合用例）；生产构建通过（exit 0）。

## 2026-08-16 — 全项目 8 维度审计

### 改进

- **全面检查报告** — 新增 `docs/audits/INSPECTION_REPORT_2026-08-16.md`：8 个并行子 agent 分维度审计（安全/性能/代码质量/数据质量/测试CI/UX/SEO架构/视觉风格）+ 主会话一手实测（chunk 体积、i18n 对比、preview 冒烟）。完整分维度报告存档 `data/archive/audit-fragments/`。
- **紧急修复** — 审计发现根 `.gitignore` 的 `data/` 规则（无前导斜杠）误伤 `iceberg-vue/src/data/`，F30 产物 `id_history.json` 从未入库；已改为 `/data/` 根锚定（待提交时一并入库）。

### 审计核心结论（详见报告）

- P0：RLS interactions_select 公开读 + user_display 邮箱前缀枚举链；related.csv 副表 23 条关联数据回归（可从 git 恢复）；CI 无测试闸门；CSP 缺失。
- P1：词条墙键盘不可达 / 焦点体系残缺 / 触控目标与对比度不达标；首屏 1.32MB JS + 1.4MB Hero 图 + Supabase SDK 进首屏；3D 拾取每 pointermove 全量扫描；评论加载错误态卡死；?r= 深链死链。
- P2：三处详情实现 60% 重复；11 个注入 key 未类型化；设计令牌缺失；i18n 4 页面硬编码；文档漂移 10+ 处；Vite 6 EOL。

## v4.4.0 — 2026-08-16（深度文件重整理）

> 根目录布局全面重组：脚本集中、数据工作区三合一、文档分类、工具产物归档。前端代码零改动。

### 改进

- **脚本集中至 `scripts/`** — 7 个 Python 脚本（build_data_api / build_data / build_single_page / extract / json_to_yaml / list_items / quality_report）从根目录移入 `scripts/`；全部路径改为基于 `Path(__file__).resolve().parents[1]`（或等价 os.path 推导）定位项目根，**任意 cwd 均可运行**（已实测根目录与 scripts 目录两种执行方式）；`build_single_page.py --data` 默认值由指向已删除的 `iceberg-react/public/data/` 修复为 Vue 版主数据。
- **数据工作区三合一 `data/`** — `data_work/` → `data/work/`（词条工作文件）、`data_archive/` → `data/archive/`（历史快照 + legacy-2026-08 + tools-2026-08）、`reports/` → `data/reports/`（quality_report 输出）；`iceberg.yaml` 移入 `data/archive/`；`.gitignore` 由三条规则收敛为 `data/` 一条。
- **文档分类** — `docs/` 平铺 16 份拆分：根保留 CHANGELOG / TODO / STYLE_GUIDE / DATA_WORKFLOW；`docs/plans/`（治理计划 / 副表方案 / 多冰山设计 / NEW 标签 / 部署用户系统）；`docs/audits/`（巡检清单 / 研究 / 移动端 / Modern Web / Hero / 美学指南 / 深度审计源，自 `outputs/` 移入）；`outputs/` 目录撤销。
- **工具产物归档清理** — `.shots/`（22MB）、`.workbuddy*/`（8MB）、`.agents/`（impeccable 技能，可凭 skills-lock.json 重装）、`.claude/`、`.astro/` 归档至 `data/archive/tools-2026-08/` 后删除；`__pycache__/` 删除；根目录仅剩 .git / .github / data / docs / iceberg-vue / scripts / CLAUDE.md / .gitignore。
- **文档同步** — CLAUDE.md 仓库根节更新为最终布局、数据管线命令加 `scripts/` 前缀；`docs/DATA_WORKFLOW.md` 全面重写；CHANGELOG v4.3.2 条目归档路径引用修正。
- **全项目路径体检与 404 修复** — 全面扫描前端 src（相对引用/外链正常）、配置层（vite base 双部署逻辑正确、deploy.yml working-directory/cache-dependency-path/artifact path 正确）、Python 脚本（全部 ROOT 基准化，实测任意 cwd 可运行）；修复 `public/404.html` 硬编码 `/iceberg_reforged/` 问题——重定向改为前缀检测（GH Pages 子路径 / CF Pages 根路径双兼容）+ 首页链接 JS 动态设置；清理无引用的空目录 `public/data/`。

### 验证

- 7 脚本 `py_compile` 全过；`list_items.py` 从根目录与 `scripts/` 目录双位置运行成功；`build_single_page.py --help` 默认值正确；前端未改动（上轮 v4.3.1 构建/54 测试已通过）。

## v4.3.2 — 2026-08-16（仓储治理）

> 根因：git 仓库嵌套于 `iceberg-vue/`，工作区根检测不到仓库；根目录数据管线脚本与 docs 游离在版本控制外。

### 改进

- **git 仓库根上移（工作区根 = 仓库根）** — `iceberg-vue/.git` 整体迁移至项目根，历史/分支/remote 零丢失（原 96 个跟踪文件路径加 `iceberg-vue/` 前缀，提交时识别为 rename）；IDE/侧边栏以工作区根即可检测到仓库。迁移前索引备份于 `.git/index.bak`（验证后保留）。
- **根 .gitignore 重写** — 解除 `docs/` 忽略（15 份设计/审计文档 + CHANGELOG 自此入库）；新增覆盖：`*.log` / `*.tsbuildinfo` / `*.bak` / `iceberg.yaml` / `skills-lock.json` / `reports/` / 根目录 `/*.html` `/*.webp` / `.shots/` / `.workbuddy*/`；`data_work/`、`data_archive/`、`font/`、历史项目、工具产物全部忽略。
- **CI 适配仓库根** — `.github/workflows/deploy.yml` 由 `iceberg-vue/` 迁至仓库根（GitHub Actions 仅识别根 workflows），`defaults.run.working-directory: iceberg-vue` + `cache-dependency-path: iceberg-vue/package-lock.json` + artifact `path: iceberg-vue/dist/`。
- **历史项目归档** — `iceberg-astro`（202MB）与 `iceberg-react`（98MB）源码压缩归档至 `data/archive/legacy-2026-08/`（astro 排除 .git/dist/node_modules 后 6.7MB，react 排除后 0.77MB），原目录删除，磁盘回收约 290MB；`font/`（90MB，前端零引用）删除；根目录 3 个 HTML 快照与旧版检查 CSV（reports/ 已有新版）删除；`hero-bg-1.85mb-orig.webp` 移入归档。
- **仓储治理计划** — 新增 `docs/REPO_GOVERNANCE_PLAN.md`：文件分类矩阵（应纳入 / 不应纳入 / 待决策）、目标布局、Phase 0–8 执行步骤与验收、风险与回滚。

### 待办（未提交，等待用户授权）

- 工作树全部改动（v4.2.0–v4.3.1 代码 + 路径重命名）尚未 commit，待用户批准后 `git add -A && git commit` 固化基线；
- 建议提交时顺带 `git rm --cached iceberg-vue/tsconfig.tsbuildinfo`（构建缓存误入库）；
- `data/`（work/archive/reports）等仍为本地目录，如需云端备份另行归档。

## v4.3.1 — 2026-08-03

> 新词条详情卡片（EntryDetailCardNext）按「描述区 / 交互区 / 拓展信息区」三区关系重构，复用 BaseModal / ItemModal 的既有样式体系。

### 改进

- **古籍模式声明式重构（audit F24）** — `AncientBookView.vue` 由「onMounted 命令式挂载（19 处 getElementById / 3 处 innerHTML / 事件委托）」重写为声明式 Vue：新增 `SpreadView.vue`（一展两页 + 书口）与 `SpreadPage.vue`（逐字渲染，插值自动转义，cell 点击 emit）两个组件；`render.ts` 的 HTML 字符串拼接（spreadHTML/cHTML）拆为纯函数（cellStyle / cellClass / punctKind / titleParts），`layout.ts` 移除 `setProperty` 副作用、布局 CSS 变量由 `:style` 绑定；词条详情弹层改为 `overlayOpen` 状态驱动的声明式弹窗（颜色白名单校验保留，`v-show` 控制链接）；键盘翻页/Esc 保留且卸载成对清理（F17/F18 模式）。engine.ts 纯逻辑（230 行）零改动。验收：**命令式 DOM 操作清零**（仅剩成对清理的键盘监听）、卸载无残留 listener、键盘流程可用。typecheck、54 个测试、生产构建通过。
- **清理过时开发路由** — 删除 `/avatar-test`（头像测试页，头像功能已上线）与 `/entry-detail-preview`（详情卡片预览页，EntryDetailCardNext 已接入真实流程）两个 DEV 路由及对应视图文件；保留 `/appendix-edit`（副表编辑器）；CLAUDE.md 路由表同步更新（11+1 条开发路由）。typecheck 与生产构建通过。
- **移除暗黑画册模式（/artbook）** — 按用户要求删除 `/artbook` 路由与 `DarkArtbookView.vue` 全部内容（引用仅限路由注册与文件自身，无其他入口）；CLAUDE.md 路由表与 views 列表同步更新。typecheck 与生产构建通过。
- **评论入口重构：动作条按钮 + 图标库 + 唯一开关** —
  **评论按钮**：底部动作条新增 💬 评论按钮（与点赞/收藏同款，带评论总数，新增 `fetchCommentCount` 计数查询），点击展开评论区并平滑滚动过去；手机端 MobileSheet 标题栏同步加入；
  **图标库**：手写 SVG 全部替换为官方 **[@lucide/vue](https://www.npmjs.com/package/@lucide/vue)**（1.0+，tree-shakable，细线 stroke 风格与原设计一致）——动作条（Heart/Star/Copy/MessageCircle/ChevronLeft/ChevronRight）、CommentPanel（MessageCircle/Heart）、MobileSheet（Star/Heart/MessageCircle/ChevronLeft/ChevronRight/X）、链接区（ExternalLink）；
  **唯一开关**：删除 CommentPanel 折叠评论条与「收起」按钮，评论区默认完全隐藏；`opened` 改为宿主受控 prop（`EntryDetailCardNext` / `MobileSheet` 各自维护 `commentsOpen`，词条切换时重置），动作条评论按钮 toggle 是唯一开关——**评论区未展开时整个区域（含分隔线与间距）不渲染，推荐词条下方不再留空位**；单行评论下方空间进一步压缩（`-mb-3 → -mb-4`）。54 个测试、类型检查、生产构建通过。
- **匿名评论服务端强制关闭（audit F25 收尾）** — 此前「取消匿名评论」仅前端（隐藏输入框 + 守卫），`comments_insert` RLS 策略仍允许 `user_id IS NULL AND anon_name IS NOT NULL` 匿名插入（anon key 直连 API 可绕过前端灌评论）。`supabase/migration.sql` 收紧为 `auth.uid() = user_id` 单条件；`anon_name` 列保留仅供存量匿名评论展示，新插入必须登录。同时修复文件可重复执行性：全部 6 个 RLS 策略（comments_select/insert/delete、interactions_select/insert/delete）统一加 `DROP POLICY IF EXISTS` 前置（`CREATE POLICY` 无 IF NOT EXISTS 语法，重复执行原会报 42710）。**需在 Supabase SQL Editor 重新执行整个文件**。

### 改进

- **测试文件集中分类存放** — 4 个测试文件从被测模块旁迁移至 `src/tests/` 统一目录：`src/tests/lib/`（supabaseData / authStore / overlayLock）与 `src/tests/components/`（ScatterField）；import 与 `vi.mock` 路径同步修正为 `../../lib/` / `../../components/`；glob 配置（vitest include、tsconfig.test include、tsconfig.app exclude）均为 `src/**` 天然覆盖，零配置改动。54 个测试、双类型检查全部通过。
- **线上可观察性恢复（audit F08）** — 新增 `lib/report.ts` 统一错误上报出口（记录版本 / 路由 / 上下文，**不采集内容正文**，未来可替换为远端上报）；esbuild 由 `drop: ['console', 'debugger']` 改为 `drop: ['debugger']` + `pure: ['console.log', 'console.info', 'console.debug']`，生产仅移除 debug 日志、保留 `console.error/warn`；四处异常场景埋点：**路由/组件错误**（`main.ts` 全局 `config.errorHandler` + `router.onError`）、**Worker**（`search.worker.ts` try/catch 后 `postMessage` 错误事件，主线程 `reportError`）、**Supabase**（`supabaseData.ts` 两处静默 catch 与三处收藏同步静默 catch 补上报）、**WebGL**（`engine.ts` 渲染循环 catch 由 console.error 升级为 `reportError`，含 3D 上下文）。构建产物验证：`[iceberg:${ctx}]` 标记与错误边界完整保留、应用代码 console.log/debugger 已移除、33 个测试全绿。
- **取消匿名评论** — `CommentPanel.vue`：未登录用户不再显示评论输入框（斜体弱化提示「登录后即可参与评论」，i18n 三语新增 `commentLoginHint`），`doPost` 加未登录双重守卫；移除匿名名逻辑（`iceberg-anon-name` 本地存储与 `getAnonName`）；评论浏览、点赞、分页不受影响。
- **应用与测试类型检查分离（audit F03）** — 新增 `tsconfig.app.json`（排除 `*.test.ts` / `*.spec.ts`）与 `tsconfig.test.json`（含测试文件 + `vitest/globals` 类型）；`build` 改为 `npm run typecheck && vite build`（生产构建只检查应用源码），测试类型检查独立为 `typecheck:test` 命令；两者各有独立失败报告，单元测试类型问题不再阻断生产构建。
- **依赖高危漏洞修复（audit F05）** — `npm audit fix` 升级传递依赖：postcss 8.5.25（修复 `<=8.5.17` 的 source map 路径穿越）、brace-expansion 2.1.4（修复 DoS/OOM），vite 顺带升至 6.4.3；`npm audit --audit-level=high` 退出码 0（0 漏洞），33 个测试与生产构建均通过。

### 修复

- **「母题」标签 emoji 缺失排查** — 经确认是 icebergthreads 上游误删了「母题」marker 的 superscript（emoji），非构建引入；前端保留「文字回退」设计（`nameToEmoji[tag] || tag`，emoji 缺失时显示 tag 名），待上游补回 emoji 后自动恢复图标显示，无需前端改动。
- **主数据覆盖保护（audit F32）** — `build_data_api.py` 覆盖前新增四道校验：`validate_data`（字段完整性 / 8 位 ID 格式与唯一性 / URL 协议 / 层级非空）、`check_count_drop`（相对上一版数量突降 >50% 阻断）、`check_orphan_relations`（related.csv / references.csv 的 source_id / target_id 孤儿检测）、diff 摘要（新增/删除/层级变化打印）；任一违规拒绝覆盖并保留旧数据。写入改为「`.bak` 快照 + 临时文件 `os.replace` 原子替换」，`build_data.py` 的 compile 同款防护。已实测：构建通过校验门（差异 +0/-0）、`.bak` 快照生成；校验函数 4 类违规场景验证通过。
- **链接检查器升级为数据质量报告（audit F33）** — `check_links.py` 更名 `quality_report.py` 并扩展：默认指向 Vue 版数据（不再审计历史 Astro 数据）+ CLI 传参 + `--static` 模式（仅静态检查跳过网络）；输出写入 `reports/` 带时间戳目录，报告头部含数据路径、sha256 hash、检查时间与统计；网络检查（HTTP/跳转/软404，403/401/429 归入 blocked）之外新增**静态检查**汇总到 `data_quality-时间戳.csv`（统一列：检查项 / 词条标题 / 层级 / ID / 详情）：结构完整性（标题空/重复、分类缺失、标签不在 tagMap、有链接无描述）、描述过短（<20 字）、标点规范（句尾标点 / 中文后英文标点 / 半角省略号 / 直引号）、链接重复（URL 归一）、链接质量（URL 含中文/空格）、**营销号来源**（百家号 / 网易号 / 微信公众号 / 搜狐号 / 头条号 / 360doc / 简书等 15 个自媒体域名，主链接 + 副表 references.csv 双查）、回归对比（与 `.bak` 快照：删除条目 / 标题变更 / 数量层级变化）；修复 uncertain 路径变量与收集列表同名导致的写 CSV TypeError。当前主数据静态检查 299 条问题（有链接无描述 129 / 标点 55 / 描述过短 26 / 营销号来源 89），链接有效性：923 链接中 OK 547 / Broken 124 / Blocked 252。
- **主数据缺协议链接补全（audit F34）** — 构建脚本（`build_data_api.py` / `build_data.py`）新增 `normalize_link()`：无协议裸域名自动补 `https://`（zhuanlan.zhihu.com / tieba.baidu.com / mp.weixin.qq.com 等 9 条），`//` 协议相对补全，`javascript:` / `data:` / `ftp:` 等非 http(s) 协议与结构非法（含空白/无点域名）直接拒绝置空；前端双重防线：`lib/data.ts` 新增 `isSafeHttpUrl()`（`normalizeData` 渲染端再次校验，非法链接置空）、`IndexView` 副表 `referencesMap` 构建时同样校验。已重跑 `build_data_api.py` 产出新数据：**非 http(s) 链接 0 条**（验收达成）、ID 1409 全部唯一无碰撞、首次迁移种子化成功（idAliases 0 条，现有 ID 与收藏/评论/副表/分享链接零破坏）。54 个前端测试、类型检查、生产构建通过。
- **滚动锁改为模块级 token 管理（audit F20）** — 新增 `lib/overlayLock.ts`：模块级 `lockOverlay()` 返回释放函数，保存加锁前的原始 overflow（关闭后原样恢复，含用户自定义值），token 集合管理——任意层数叠加只有最后一层释放才恢复背景滚动；`BaseModal` 与 `MobileSheet` 的实例局部计数（`modalCount` / `sheetOpenCount`，互不协调且多实例时提前解锁）全部替换为该管理器。新增 3 个验收测试（单层恢复原值 / 两层先关外层 / 后开先关）。54 个测试全绿，类型检查与生产构建通过。
- **词条 ID 稳定性与旧链接重定向（audit F30）** —
  **构建侧**（`build_data_api.py` / `build_data.py`）：引入 `iceberg-vue/src/data/id_history.json` 持久化 ID 历史——API 稳定 UUID **仅作内部锚点**（`byApiId: {uuid → 8位id}`），输出 ID 仍是 8 位 MD5 且标题/层级修订时**复用历史 ID 不变**（收藏/评论/互动/副表/分享链接不断）；首次迁移以现有 `iceberg.json` 的 `tier::title → id` 种子化，标题未变条目直接复用；HTML 回退方式靠 `byTitle` 锚定。构建新增两项检查：8 位截断空间 **ID 碰撞检测**（冲突即报错退出）+ 非预期 ID 变更报告；变更条目输出 `idAliases`（旧→新）写入 `iceberg.json`；
  **前端侧**：`IcebergData` 接口与 `normalizeData` 透传 `idAliases`，IndexView `provide('idAliases')`，`ItemInteractivity` 注入后四处解析口重定向——分享 hash 导航、`open-item-modal` 深链（含 `?item=`）、收藏过滤（`filterSnapshot` 转换 `fList`）、已读标记（`applyItemMarks` 转换 `rList`）；
  **验证**：Python 模拟「同 API 条目改标题+改层级 → ID 不变」「HTML 回退复用」「alias 输出」全部通过；51 个前端测试、类型检查、生产构建通过。
- **全局监听与延时任务生命周期管理（audit F17 / F18）** —
  **F17** `AppShell.vue` 的 `document click` / `window pageshow` 匿名监听改为具名函数（`onDocClick` / `onPageshow`），遮罩 `shieldTimer` 与 `vue-ready` 派发 `readyTimer` 保存 id，全部在 `onUnmounted` 成对移除/清理——反复挂载卸载不再累积监听，SPA 导航遮罩无残留；
  **F18** `ItemInteractivity.vue` 统一生命周期：相关词条索引预建（`requestIdleCallback` / `setTimeout`）保存 `relMapTask`、随机词条 tooltip 延时保存 `randomTooltipTimer`、hash 导航双层延时保存 `hashNavTimer`，`onUnmounted` 中 `cancelIdleCallback` / `clearTimeout` 全部取消——路由立即离开后不再有后台重计算或访问已卸载状态的回调。51 个测试、类型检查与生产构建全部通过。
- **搜索 Worker 初始化竞态与评论分页失效（audit F09 / F10）** —
  **F09** `search.worker.ts` 增加 `ready` 状态与 `pending` 待处理查询：索引未就绪前收到的搜索请求缓存最新一条，`init` 完成后自动重放；主线程（`ItemInteractivity`）查询 watch 为每条请求附加自增 `seq`，`onmessage` 校验序号丢弃过期响应——冷启动立即输入、快速切换全文/标题模式时最终结果始终对应最新查询；
  **F10** `fetchComments` 补上真正的分页：`.order('created_at') + .order('id')` 双键稳定排序后 `.range(offset, offset + limit)`（闭区间取 limit+1 条判定 hasMore），「加载更多」不再重复第一页；`CommentPanel.loadMore` 合并时按 comment id 去重（防分页边界/数据变动导致的重复）；
  **测试**：builder 补 `range` 方法，新增 2 个分页用例（首屏 `range(0, limit)` + 稳定排序断言、加载更多 `range(offset, offset+limit)`）。51 个测试全绿，类型检查与生产构建通过。
- **互动/收藏错误检查、点赞串项、收藏同步语义（audit F11 / F12 / F13）** —
  **F11** `supabaseData.ts` 新增 `throwIfError` 统一错误出口，`toggleInteraction`（改为 `delete().select().maybeSingle()` 单次往返完成「读+反转」，幂等由唯一约束兜底）、`syncFavorites`、`fetchMyInteractions`、`fetchMyFavorites` 全部显式抛错（RLS 拒绝/网络失败由调用方回滚并 alert，不再悄然漂移），`fetchInteractionCount` 只读降级为 0 并上报；
  **F12** `EntryDetailCardNext` / `ItemModal` / `MobileSheet` 三处点赞加载改用请求序号（`likeSeq`，过期响应丢弃）+ 加载失败 `reportError`，`toggleItemLike` 写入前记录 id 快照、响应/回滚前确认词条未切换（快速前后导航 20 次不串项）；
  **F13** `authStore.syncFavoritesWithCloud` 由模块级布尔锁改为 promise 链队列（多次触发串行执行、不丢弃），冲突策略明确为「本地优先 + 初始化护栏」：显示先写并集、本地非空才双向 diff 同步、同步**成功**后才校正显示为本地权威集（失败时保留并集不覆盖），本地为空视为首次登录只合并不删除；
  **测试**：`supabaseData.test.ts` 扩展 interactions 内存 fake（可注入 delete/insert/select 失败），覆盖 toggle 幂等与错误抛出、syncFavorites 双向 diff（本地新增 / 传播删除 / 清空意图）、fetchMyFavorites 错误检查；新增 `authStore.test.ts` 覆盖验收五类矩阵（首次登录 / 本地新增 / 云端新增 / 两端删除护栏 / 同步失败保持并集 / 排队不丢弃）。49 个测试全绿，双类型检查与生产构建通过。
- **筛选 rAF 调度与随机词条一致性（audit F14 / F15）** — `ItemInteractivity.vue` 重构：**F14** 筛选 `watchEffect` 改为统一快照（`filterSnapshot()` 同步阶段构造全部筛选状态，rAF 回调只消费快照，不再混用捕获值与现场值）+ 单一调度器（保存帧 id、新触发 `cancelAnimationFrame` 旧帧），快速输入/组合筛选下旧帧不再写入 DOM，最后一帧严格对应最新状态；**F15** 抽取 `matchesFilter(item, snap)` 纯函数，完整覆盖主筛选全部条件（特殊筛选四模式 / 收藏筛选 / 隐藏分类 / 隐藏标签 / 分类 / 标签 AND·OR / 搜索结果），列表循环与 `showRandom()` 共用同一函数——随机池与可见集合完全一致（此前只考虑分类/标签/搜索且用 `item.emojis` 判定）；随机无命中时直接返回（不再回退全池）。33 个测试、类型检查与生产构建全部通过。
- **手机端评论区上方留白过挤** — 排查确认手机端（`innerWidth < 1024`）详情走 `MobileSheet` 底部抽屉而非 EntryDetailCardNext，且其第 230 行裸放 `CommentPanel`（重构后不自画边框/间距），导致评论区直接贴在参考链接区下方、无分隔线无间距；补 `mt-4 pt-3 border-t` 包裹层（与上方区块同节奏）。EntryDetailCardNext 另加 `max-sm:mt-3.5 max-sm:pt-2.5` 响应式覆盖，服务于 FeatureDetailView 的手机端场景（桌面 ≥1024px 不受影响）。
- **详情卡片 prop 校验警告（`Expected Object, got Null`）** — `ItemInteractivity` 的 `<EntryDetailCardNext :item="modalItem">` 缺少 `v-if` 守卫，`modalItem` 初始为 `null` 时 Vue 类型化 prop 校验报警（组件内部此前已用可选链防住 setup 崩溃，但警告仍在）；与 FeatureDetailView 保持一致补 `v-if="modalItem"`，null 时不渲染组件实例，警告消除。
- **散点模式筛选测试失败（audit F02）** — 排查确认组件逻辑本身正确（`v-show` 正常设置 `display:none`，真实站点筛选可用），真正根因是 `el.isVisible()` 在 happy-dom 下无法识别 inline `display:none`（`getComputedStyle` 缺陷）导致测试误报。落实 audit 建议：新增 `lib/injectionKeys.ts` 的 `FILTER_VISIBLE_KEY: InjectionKey<ShallowRef<Set<string> | null>>`，IndexView（provide）/ ScatterField / ItemInteractivity（inject）三处统一改用 key 注入，模板恢复与层级模式一致的自动解包写法（`!filterVisible || filterVisible.has(item.id)`）；测试改用 `style.display` 直接断言（绕开 happy-dom 缺陷），并按验收补齐五类用例：未注入、显式 null、空 Set（全隐藏）、单条命中、多条命中。33 个测试全绿，生产构建通过。
- **新卡片在词条详情打开前崩溃（详情框空白）** — `EntryDetailCardNext.vue` 的 `watch(() => props.item.id, ..., { immediate: true })` 在 `modalItem` 初始为 `null` 时立即求值 `props.item.id` 抛 TypeError（无层级模式/首次挂载即可复现），setup 崩溃导致详情框无法显示任何内容。改为 `props.item?.id`（同 ItemModal 的可选链写法），并同步加固 `refLinks` computed 与 ←/→ 键盘处理对 `null` 的防护。
- **层级 chip 未显示** — 数据链路实际有 `tier`（IndexView `allItemsRaw` 构建时带 `tier: tierName`），但 `ItemInteractivity.setModalItem` 构造 `modalItem` 时未透传该字段；`FeatureDetailView` 的 `allItems` 构建与内联词条字段均未带 `tier`。两处补齐透传，层级 chip 恢复显示（组件侧 `tier?: string` 保留为可选兜底）。
- **评论区上下留白过大** — 评论区为滚动流末尾区块：外层包裹上间距 `mt-6 pt-3`（36px）收紧为 `mt-4 pt-2`（24px）；`modal-body` 底部 32px padding 在末尾区块下方显空，改用评论包裹层 `-mb-3` 负 margin 抵消 12px（标准盒模型行为，确定性生效；此前 `:deep(.modal-body)` 覆盖方案实测无效已移除）。
- **链接移入描述区 + 整体压缩** — 主链接与参考链接从拓展信息区移出，紧贴描述（同区、无线分隔），描述→链接→关联词条→评论的阅读流更顺；后续按反馈连压两轮：链接块与描述 `mt-4 → mt-2`、主链接与参考链接 `mt-2.5 → mt-1.5`、关联词条区 `mt-5 pt-2 → mt-3 pt-1`、评论区上间距 `mt-4 → mt-2.5`，定位行 `mb-4 → mb-3`、`-mt-3` 负 margin 抵消 `modal-body` 顶部 24px padding 中的 12px（与底部 `-mb-3` 同方案）。

### 改进

- **新词条详情卡片三区重构** — `EntryDetailCardNext.vue` 复用 `BaseModal`（size lg）+ 与 `ItemModal` 完全一致的 Tailwind 样式类与交互约定（标题点击复制、favorites store、`navigate` 载荷 `{id}`、←/→ 键盘切换），自建 scoped 样式仅剩底部动作条。分区关系：**描述区**（层级/分类 chip + `#tag` + 描述，描述放大提亮 15px / 1.8 行高 / `text-white/85`）为阅读核心；**拓展信息区**（主链接 / 参考链接 / 相关词条）沉底弱化（细线分隔、小字、hover 才提亮）；**交互区**为底部常驻动作条（点赞计数 / 收藏 / 复制链接 / ←→ 相邻浏览），`BaseModal` 新增 `#footer` 插槽（优先于 `footer-hint`，向后兼容，`modal.css` 新增 `.modal-footer` 层）；**参与区**为滚动流末尾的 `CommentPanel` 评论区，点赞/收藏逻辑与 ItemModal 一致（supabase 计数与登录同步）；i18n 补 `copyLink` 三语 key；接口移除 `favorite` prop / `modifiedAt` / `position` / `total` / `prevTitle` / `nextTitle`，预览页同步适配。
- **评论区样式对齐卡片视觉语言** — `CommentPanel.vue`：容器不再自画边框与间距（分隔线改由宿主分区控制，ItemModal 与 EntryDetailCardNext 各包一层间距，消除双线）；💬 emoji 与 ♥ 文本符号换成细线 SVG 图标（对话气泡 / 心形，与卡片动作条同款 stroke 风格，点赞点亮为红色 fill）；标题字号统一为 0.65rem 弱化小标签；移动端「收起」按钮补 40px 触摸目标。
- **新卡片接入真实流程** — 主冰山图（`ItemInteractivity.vue`，≥1024px 弹窗）与专题详情页（`FeatureDetailView.vue`）改用 `EntryDetailCardNext` 替换 `ItemModal`；适配真实数据形态：`tier` 字段改可选（真实词条无层级字段，chip 按需隐藏）、参考链接回退副表 `referencesMap` 注入（同 ItemModal）；关联词条区恢复 ItemModal 式双标签分组——`related`（副表精选「关联词条」）与 `recommended`（相似度推荐「推荐词条」）流式相邻、略微分开（真实数据下关联主要来自 recommended，此前合并渲染导致无来源区分）；移动端 <1024px 仍走 `MobileSheet` 抽屉不受影响；`ItemModal.vue` 保留文件备用。

## v4.3.0 — 2026-08-02

> 首页 LiquidGradient 极简重写与滚动沉海、冰山图「液态」背景模式（官方 ShaderCanvas 移植）、无层级实验模式、Hero 首屏重构、背景冰山 SVG 全面细化、评论点赞计数 400 修复与 3D 拾取/雾化修复。

### 改进

- **静态冰山背景恢复 git 版本（撤销慢速视差）** — 视差方案（fixed + `--bg-room` 延伸 + transform 驱动）观感不佳，已按用户要求整体恢复：`bg.css` 的 `.bg-root` 回到 `position:absolute;inset:0` 跟随文档、`--bg-hf` 回到按页面高度计算；IcebergBg.vue 删除视差监听逻辑。液态背景模式（`LiquidBg` 分支与 Vue 响应式重构）保持现状不受影响。
- **背景选项收敛为三个** — 取消「动态」选项（按钮与性能提示移除，legacy 已存 `dynamic` 的用户打开设置面板时自动归一为「冰山」）；「静态」改名为「冰山」（i18n zh/en/ja）。最终背景选项：纯黑 / 冰山 / 液体。
- **背景冰山 SVG 细化** — 背景冰山从 10 个粗三角升级为约 30 面的低多边形：主峰雪顶（最亮 0.95）、左右受光面、左右山肩、中部水面带；水下部分按深度逐层降透明度（0.4 → 0.12）并外扩轮廓（左 6,50 / 右 93,36），剖分按条带法构造、面之间无缺口。样式与 z 层级（z-index 2，水面 bg-water 之上）不变。
- **背景冰山 SVG 微调** — 基于现行渐变版本（含 defs 矢量渐变与冰裂脊线）：新增前景凸脊（主峰左前方骑出轮廓线的亮面 `#f2faff` 0.85，形成朝屏幕的层次）、橙色日落反光两小块（凸脊受光缘 `#ffa45c` 0.32 / 雪顶左缘 `#ffb36f` 0.25）；整体透明度微降（`.bg-iceberg` 0.95 → 0.9）。
- **背景冰山多边形对齐修复** — 逐面核对 24 个填充多边形与底形轮廓的共享边：修复主峰左亮面闭合边 29,16→43,10 跳过轮廓折点 35,18 导致的轮廓外天空光斑（顶点改沿轮廓 29,16→35,18→43,10，闭合经 30,24）；橙色反光块改为沿边薄三角（凸脊受光边 43,10→40,15 / 雪顶左轮廓边 43,10→49,7，顶点严格落在边上，消除悬空边缘）；面9 上边 `35,18→46,18` 水平边（全图唯一非水面的水平边）拆为两段斜边（经 43,12），低多边形轮廓不再出现水平横线；冰裂脊线全部删除（原脊线组含沿共享边绘制的线段，会强化半透明填充的抗锯齿接缝观感；删除后以填充面同色描边覆盖接缝）；填充面统一加同色描边（CSS `--fc` 变量 + `.bg-iceberg svg > path` 规则，stroke-width 0.75 屏幕像素——此前选择器误写为 `g[stroke="none"] path`，冰山填充 path 直接挂在 svg 下故从未生效，已修正）；水面线（y≈30）全部水平边改为全斜折线（水上各面底边与水下各面顶边共享折点 8,30 16,29 24,31 31,30 36,31 41,30 46,29 51,30 54,31 58,30 62,29 67,30 67.5,31 68,30 76,29 84,31 92,30，无水平段、无接缝）；其余共享边均严格对齐（面1/面9 共享 30,24→41,30，水下各层沿 8,51→15,68→25,80→37,89→50,96 轮廓贴合），无缝隙；面4/面6/面9/面10 对主峰面的覆盖与凸脊为有意层次重叠。
- **首页重写为 LiquidGradient 极简** — 重构 `HomeView.vue`：Mssh meshh 官方 `LiquidGradient` 液态渐变（WebGL2，官方 ShaderCanvas 移植至 `src/lib/shaderCanvas.ts`，含 `precision highp int` 保证 PCG hash 的 uint 运算精度、`vec4 u_colors[8]` 调色板、OKLab/LCh 插值 + 软色域映射 + IGN 抖动）铺满全页背景，官方默认深海蓝橙五色配置；白色窄栏内容（大标题 + 简介 + 数据/入口/今日档案三个列表式区块）浮于其上；等宽小字 uppercase 标签；入口行 hover 箭头位移；底栏北京时间实时时钟；WebGL2 不可用时回退静态渐变。
- **首页动效** — 整页单次淡入（0.8s），其余交互全部静止克制；完整响应 `prefers-reduced-motion`。
- **首页滚动沉海** — 滚动进度（rAF 节流 + passive 监听）映射为新增的 `darkShift` uniform（组件扩展 prop，官方行为不受影响）：把色板采样整体向深色端平移，五色中亮色（橙/亮蓝）区域被逐步压缩、最深色区域占比越来越大；沉海终点为纯黑（使用处 `colorA` 传 `#000000`，色板最深端由官方深蓝黑 `#001220` 改为纯黑，五色结构不变）；偏移线性到 1.0（视觉全黑阈值——原 1.8 / 1.3 分别在约 70% / 85% 滚动处过早全黑），滚到底时画面全部落入纯黑；keep-alive 切回页面时按当前滚动位置同步一次。
- **冰山图新增「液态」背景模式** — `bgMode` 新增 `'liquid'` 选项（设置面板背景区第四个按钮，i18n zh/en/ja）：新增独立背景组件 `LiquidBg.vue`（WebGL LiquidGradient 官方五色 + 滚动沉海 `darkShift`），根元素 `position: fixed` 铺满视口，canvas 尺寸恒为视口 × dpr——避免挂在随文档高度拉伸的容器里使 canvas 超出 WebGL 尺寸上限而显示异常（冰山图页面很长，内嵌 absolute 方案会超限变黑）；`IcebergBg.vue` 改为 Vue 响应式渲染（`useStore(bgMode)` 替代原生 classList 切换），liquid 分支仅渲染 `<LiquidBg />`，星空/冰海 SVG 各层与顶部橙色光晕隐藏；非液态模式行为不变。
- **NEW 标记与词条排版微调** — 「高亮最近更新」词条标记（`recently-updated`）由胶囊形改为小圆角矩形（`border-radius: 4px`），上下 padding 收紧并做不对称补偿（`1px / 2.5px`——CJK 字形在行盒中偏下，字形顶部空隙大于底部，以不对称 padding 均衡背景上下边缘与文字的距离）保留轻微空隙；`.iceberg-item` 行距按用户指定定稿 `line-height: 1.5`，高亮背景以不对称 padding 补偿 CJK 字形偏下（上 `1px` / 下 `6px`）；移动端词条间距 `gap-y` 10px。
- **液态背景种子随机化** — 首页与冰山图液态背景的 `seed` 在每次进入页面时（`onActivated`，含 keep-alive 切回）于 0-1000 范围内重新随机，液态图案不再固定重复。
- **实验功能：无层级模式** — 设置面板实验区新增开关（`scatterMode`，i18n zh/en/ja）：无层级、无 TierNav，版面与冰山图一致（同一词条墙 flex 布局），全部词条以 `mulberry32` 随机打乱顺序后平铺（挂载时打乱，每次刷新不同），容器带与层级一致的上下留白（`py-10` / 移动端 `py-4`）；仅隐藏 TierNav 与层级分组，`IcebergApp`（侧边栏/搜索/过滤/浮动按钮）与 `#items-container` 事件委托保持可用，tooltip / modal / 收藏 / 已读 / NEW 标记全部照常工作。
- **沉浸式浮动按钮设置加回设置面板** — 实验区新增「沉浸式浮动按钮（悬停时显示）」开关，直接控制 `immersiveMode`（此前仅存在于极简/标准模式预设中，无法单独调整）。

- **品牌首屏重构** — 重写 `HeroSection.vue`，保留橙色水面、蓝色深海、透明冰山和巨型词条墙母题；品牌层精简为 SVG 主标识、英文副标题与极简「点击进入」呼吸提示器。
- **响应式布局** — 桌面、竖屏手机和低高度横屏分别适配；移动端关闭聚光与鼠标视差，支持安全区和 `dvh`/`vh` 双回退。
- **首屏与退场过渡** — 背景图和品牌 SVG 预载完成后触发 850ms 聚光展开；退场加入深蓝覆盖层上升、冰山放大上漂、标题与词条上浮模糊的水下下潜效果，并完整响应 `prefers-reduced-motion`。
- **交互与无障碍** — 支持整页点击、向下滚轮、上滑及 Enter/Space/PageDown/ArrowDown/End/Escape 进入；随机词条墙整体标记为装饰内容。
- **词条墙** — 改为只占上半屏的五行纯中文无缝滚动，删除空格与非汉字符号；五行统一向左，仅通过 138–186 秒的不同周期形成差速，并在退场、后台标签页和减少动效模式下暂停。
- **聚光与性能** — 使用固定全屏半分辨率 Canvas 铺设 68% 暗场，再以预生成径向画刷和 `destination-out` 擦出 680px 柔边光洞；Pointer 事件每帧合并，鼠标静止后无空闲 rAF，避免超大阴影重绘、硬边和追赶抖动。
- **冰山层次** — 冰山与标题采用约 4:1 幅度的反向鼠标差速视差；按视觉反馈取消透明边缘的青蓝 `drop-shadow()` 轮廓，恢复更自然的原图边缘。
- **Hero 单图背景** — 按用户指定改用 `annie-spratt-Tno1Zd3T6yY-unsplash.webp`；原图 7764×5179、约 11MB，压缩至 2560×1708、约 1.4MB 后覆盖接入，移除 RGB + Alpha 双图预载与 CSS 蒙版合成。

### 修复

- **评论点赞计数查询 400（长期静默失败）** — `fetchComments` 的点赞聚合 `in('target_id', ids.map(String))`：postgrest-js 只给含保留字符的字符串加引号，数字字符串发出 `in.(5)` 被 PostgREST 解析为 integer 字面量，而 `interactions.target_id` 是 text 列（同时存字符串 item id 与数字 comment id），`text IN (5)` 无操作符 → 400，被 catch 吞掉后点赞数一直显示 0。改为 `.filter('target_id', 'in', '("id")')` 显式加引号（`.filter` 为三参签名，两参调用会把 `undefined` 拼进 URL），并加空数组守卫避免 `in.()` 空列表 400。
- 移除 3D 场景中的 500 个软边柔光粒子与 Bloom 后处理，高亮代理改为无自发光实体色提亮；修复词条自定义 Shader 未应用 `instanceMatrix`、未通过 varying 传递 `instanceColor` 导致碎片不可见的问题。聚焦构图改为桌面端至多 76px 的轻微偏心，并加入方向自适应的正负 5.2° Dutch angle，移动端保持水平居中。
- 重做 3D 碎片拾取与 Hover：用可见实例真实几何射线及包含非均匀缩放、旋转和透视深度的实例投影轮廓共同确定候选，最终按鼠标到碎片屏幕中心的绝对像素距离选择目标；点击与 Hover 共用同一算法。修复普通移动被误判为拖拽，Hover 直接更新真实实例 `instanceColor` 为原始分类色，并在离开时恢复降饱和色。
- Hover 与聚焦碎片共用整面高饱和分类色 Shader 分支：真实实例通过颜色状态标记绕过普通低饱和 Lambert/Fresnel 着色，仅保留轻微面向明暗；聚焦切换与退出时恢复旧实例颜色。移除额外聚焦代理 Mesh，避免覆盖真实实例颜色，且不恢复 Bloom 或柔光。
- 修复 3D 冰山自定义宝石与粒子材质启用场景雾却缺少 `UniformsLib.fog`，导致 `composer.render()` 每帧抛出 `Cannot read properties of undefined (reading 'value')`；渲染循环同时改为成功后才预约下一帧，未知渲染错误不再无限刷屏。
- 修复反向词条轨道可能露出空白、蒙版与背景居中方式不一致、减少动效后鼠标移动重新启动视差，以及加载盾节点移除后仍尝试复用的问题。
- 修复首次进入网站时正文冰山主界面先闪现、随后 Hero 才覆盖的问题：将加载盾前移为 `index.html` 首帧同步节点并内联关键遮罩样式，同时禁止首次 `pageshow` 在 `hero-ready` 前提前隐藏遮罩。
- 首次常规构建因本机安全删除层无法回收旧 `dist/404.html` 中断；改用 `vite build --emptyOutDir false` 保留旧产物完成验证，类型检查与 202 个模块生产构建均通过。

## v4.2.1 — 2026-07-31

> Hero 页性能与美学专项（docs/HERO_OPTIMIZATION.md 全部 10 项落地），构建验证通过。

### 改进

- **Hero 背景图瘦身（1.85MB → 372KB）** — 2880×1920 带内嵌 alpha 的 webp 拆分为「无透明 RGB webp（259KB）+ 独立 alpha 蒙版（112KB 半分辨率无损）」，CSS `mask-image` 合成，预乘可见差异 0.35/255 不可感知；原文件备份于项目根目录 `hero-bg-1.85mb-orig.webp`
- **Hero 聚光零重绘** — 全屏 `radial-gradient(...at var(--sx) var(--sy))` 每帧整屏重光栅改为「canvas 预烘焙位图 + transform 跟随」（合成器级）；另加聚光随鼠标速度放大 1.0→1.8（拖尾感）
- **Hero 词条墙 DOM 减 2.5 倍** — 每轨道词条 80 → 32（轨道仍约 14 屏宽，900s 慢滚观感不变）
- **Hero 行间节奏变化** — 奇数行反向滚动、速度 750/1050s 交替、中央亮（0.26）边缘暗（0.10）纵向明暗渐变，「水下漂浮」纵深感
- **Hero 退场错落序列** — bg 0.05s / 词条 0.12s / 氛围 0.18s / 标题 0.25s / cue 0.4s 的 stagger delay，「沉没」序列感
- **Hero 字体就绪淡入** — 词条墙等 `document.fonts.ready`（1.5s 兜底）再淡入，消除首次访问 SimSun→思源宋体巨字闪换
- **Hero 省电与降级** — rAF 空闲 ~1s 自动暂停（mousemove 唤醒）；`prefers-reduced-motion` 停用 ticker/视差/入场动画；`calc(100dvh/8)` 补 100vh 回退（iOS<15.4 版面不再坍缩）
- **Hero 颗粒质感层** — 静态 SVG feTurbulence 噪声（6% 透明度，一次性光栅），渐变背景不再「平」；退出时随层淡出

## v4.2.0 — 2026-07-31

> 本轮修复基于 7 路 agent 深度探索（docs/RESEARCH_REPORT.md + docs/ISSUES_RESEARCH.md），共修复 66 项，构建验证通过。

### 修复

- **hide 过滤模式失效** — `v-memo` 与 `v-show` 同挂词条 span 且 memo 依赖不含 filterVisible，Vue 缓存 VNode 使过滤永不更新 DOM；移除 v-memo，v-show 恢复响应（经编译产物反查确认）
- **已读/最近更新标记首屏不生效** — 标记 watchEffect 在 setup 同步执行时 `#items-container`（IcebergApp 兄弟节点）尚未挂载而提前返回，依赖不变不再重跑；抽出 `applyItemMarks()` 并由 onMounted 补跑初始应用
- **移动端批次（docs/MOBILE_ISSUES.md）** —
  - 沉浸模式 FAB 触屏隐形：`.immersive-group` 显隐规则包入 `@media (hover: hover)`，触屏常显、桌面行为不变
  - MobileSheet：新增 × 关闭按钮 + Esc 关闭 + handle 下滑拖拽关闭（rAF 节流 + touchcancel）；背景滚动锁（引用计数）+ 遮罩 touchmove 拦截；补前后导航按钮与标题点击复制分享链接；`role="dialog" aria-modal` + inert 防焦点逃逸
  - tooltip 模式移动端跳转：OnThisDayModal 与 hash 导航在 `<1024px` 时强制走弹窗/抽屉，不再静默失败
  - iOS 输入聚焦缩放：搜索框/评论框/登录昵称/设置导入 5 处输入字号移动端提至 ≥16px；评论输入聚焦 scrollIntoView 防键盘遮挡
  - 断点收口：768→640 共 6 处（base/ancient-book/DarkArtbook/Features/Iceberg3D）、860→640（Handbook）、3D 详情面板 60vh→70vh 统一
  - 视口与安全区：`viewport-fit=cover` + sheet-panel/modal-footer/古籍导航条 `env(safe-area-inset-bottom)`
  - 触摸目标：OnThisDay 日期/月份/「今天」按钮、ItemModal 头部按钮、评论按钮、关闭按钮（负 margin 扩点区）、Handbook A-Z 导航、词条间距 gap-y 4→8px
  - 移动端性能：3D 拖拽中跳过 raycast、pointercancel 兜底、触屏 Bloom 半分辨率、弹窗 backdrop-filter 触屏降级纯色遮罩
  - 其他：`.iceberg-item` 移动端禁长按系统菜单、DarkArtbook 封面标题移动端换行降级、侧栏抽屉 touchcancel
- **排序被 keyed diff 纠正** — 命令式 DOM 重排改为 IndexView 声明式 `tierItems` computed（sortMode 驱动），过滤/排序叠加不再互相打架
- **开弹窗触发全量过滤管线** — readItems 从过滤 watchEffect 依赖拆出，已读/最近更新标记独立 watchEffect；`results.includes` 改 Set；相关词条索引空闲预建
- **KeepAlive 无界缓存** — 限制 max=4，古籍模式排除（卸载触发资源清理）；3D 页 onDeactivated 暂停渲染循环 / onActivated 恢复（不重建场景）
- **3D 后台渲染泄漏** — 离开 /3d 后 rAF + Bloom 后处理持续渲染的问题修复；另加 webglcontextlost 处理、domElement 移除、拖拽起点误高亮修复
- **未配置 Supabase 时登录 TypeError** — authStore 全部函数加 isSupabaseReady 守卫，UserModal handler try/catch + loading 复位，未配置时隐藏登录入口
- **收藏同步** — 并集合并改为「显示并集 + 双向 diff 传播删除」（本地为空视为新设备不删云端）；in-flight 锁防并发撞 PK
- **点赞计数截断** — PostgREST 1000 行上限问题改服务端分组 count
- **评论系统** — 分页（50/页 + 加载更多）、2000 字 CHECK 约束、10 秒发送节流、删除评论级联清理点赞孤儿行（DB 触发器）、doDelete/乱序/乐观点赞漂移/timeAgo 修复
- **隐私** — batch_user_display 只返回有 display_name 的用户 + search_path=''，评论显示回退「匿名用户」
- **GeoAvatar** — 旧用户派生 seed 从 360 种低熵改为 FNV-1a 哈希（2^32 种）
- **移动端不标已读** — 底部抽屉路径补齐 markRead（含导航切换）
- **ItemModal 键盘导航** — 输入框聚焦时 ←/→ 不切词条
- **OnThisDayModal tooltip 兜底** — 词条被过滤隐藏时改走弹窗而非静默失败；OnThisDayApp props 恢复响应式；IndexView ?item= 定时器清理
- **古籍模式** — 切换模式双重解析移除、分类色 hex 校验 + HTML 转义、方向键加注释（有意行为）
- **DarkArtbook** — 悬浮卡片对齐方向按当前词条独立计算；AvatarTest 刷新按钮修复；IcebergBg 单源化（settingsStore）
- **storedAtom** — null 污染对象型 atom 修复、数组元素类型校验
- **spa-fallback** — 不再覆盖 public/404.html 自定义页
- **附录编辑器** — 保存失败红色提示 + dirty 保留、左栏「加载更多」分页、保存中间件异步化 + 2MB 限制
- **搜索 Worker** — onerror 兜底、空查询语义统一（未 init 返回 null 而非 []）

### 改进

- **字体（思源优先）** — 正文思源黑体 Noto Sans SC（400/500/700/900）、标题/Hero 思源宋体 Noto Serif SC（200/300）加载落地；Inter/Long Cang 全部替换（DarkArtbook 标题改 Noto Serif SC 900）
- **NEW 标记样式** — 多轮迭代（无背景文字标记 → 淡橙底 → 0.8 橙底）后经用户确认**保持原果冻黄胶囊**（#feca57 实心底 + 深色字 + 999px 圆角），恢复 v4.2.0 前样式
- **manualChunks 拆包** — three / three-examples / gsap 独立 chunk（修复目录名 iceberg-vue 含 "vue" 导致全量吸入 vue chunk 的问题）
- **用户系统 i18n** — UserModal/CommentPanel/ItemModal/MobileSheet/Header/SettingsPanel 全量接入 t()，三语字典 87 → 156 key 全覆盖
- **收藏统计** — 弹窗内登录后自动刷新统计、失败重试入口
- **Hero** — overflow 在 transitionend 提前解锁、visibilitychange 暂停 rAF、值缓存跳过重复 setProperty
- **3D chunk 与冷启动** — 相关词条索引 requestIdleCallback 预建

### 移除

- `data.js`（964KB legacy）、StaticHeader.vue、index.css 死 Hero 块（60 行）、`.fab-btn` 双定义、死令牌（--transition-*/--font-size-scale/--color-accent-*）、主题重复 import、ancient-book 重复 CSS 规则、`build_data.py` resolve_related 死代码、4 个无消费 data-* 属性、`_hd` 标志

### 文档

- RESEARCH_REPORT.md / ISSUES_RESEARCH.md（80 项问题清单，66 项已修复）；DATA_WORKFLOW.md 更新为 API 优先；DEPLOY_USER_SYSTEM.md `CF_PAGES` → `CF_PAGES_BRANCH`；CLAUDE.md 常量与管线描述同步；package.json version 3.0.0 → 4.1.0

---

## v4.1.0 — 2026-07-30

### 新增

- **Cloudflare Pages 部署** — 新增 `iceberg-reforged.pages.dev`，Git 集成自动部署，全球 CDN；`_redirects` SPA 回退
- **参考链接副表** — `references.csv` 前端展示（ItemModal + MobileSheet）
- **公告** — 新增部署通知公告

### 修复

- **评论系统** — Supabase 未配置时静默退化；N+1 查询改为批量；移动端补齐点赞 + 评论区；点赞数/状态同步出现
- **NEW 标记** — 30 天滚动窗口替代严格相等；恢复「最新」筛选按钮
- **搜索** — 全文索引可匹配分类/标签名；`searchMode` key 从中文改为 `'full'/'title'`
- **部署** — Router/Auth/AncientBook/Favicon 统一 `import.meta.env.BASE_URL` 或相对路径；CF 用 `CF_PAGES_BRANCH` 自动探测
- **生命周期泄漏** — `AncientBookView`（keydown+RO）、`HeroSection`（滚动锁+超时）、`ItemInteractivity`（scroll 监听）、`OnThisDayModal`（setTimeout）全部清理
- **加载盾** — `AppShell` 统一派发 `vue-ready`，非首页不再卡 5s
- **BaseModal** — Escape 统一关闭；滚动锁引用计数
- **XSS 加固** — `md.ts`（引号转义 + URL 白名单）、`FeatureDetailView`（HTML 转义）、CSV 导出 RFC 4180
- **3D 页** — 加载/错误 UI；InstancedMesh dispose；GSAP 全量 kill；Vector2 复用
- **数据管线** — 参与创作者拼音排序；移除 legacy `data.js`
- **其他** — `storedAtom` 类型校验、专题 `replaceAll`、`GeoAvatar` NaN 守卫、日历 O(1)、CRLF 兼容、a11y 补全、Favicon 橙蓝渐变等

### 文档

- CLAUDE.md 同步；42 项全库巡检完成（`docs/ISSUES.md`）
- CHANGELOG v3.6.0 勘误

---

## v4.0.0 — 2026-07-25

### 新增

- **用户系统** — 基于 Supabase 的完整用户体系：
  - 邮箱密码注册/登录 + Magic Link 免密登录
  - 程序化几何头像（GeoAvatar）— 确定性随机生成 6 种包豪斯风格布局，与邮箱脱钩
  - 用户面板（UserModal）— 统计收藏/点赞/评论/浏览数、最爱分类、热度称号
  - 登录/未登录状态下完整功能可用，收藏登录后自动双向同步
- **评论系统** — CommentPanel 折叠/展开评论面板，支持登录和匿名评论，登录用户可删除自己的评论
- **点赞系统** — 条目和评论均可点赞，♥ 计数展示，即时切换
- **数据层** — `supabase.ts`（Proxy 安全客户端 + 未配置静默退化）、`supabaseData.ts`（comments / interactions 统一 CRUD）、`migration.sql`（建表 + RLS + `batch_user_display` RPC）
- **Cloudflare Pages 部署方案文档** ([DEPLOY_USER_SYSTEM.md](docs/DEPLOY_USER_SYSTEM.md)) — 部署指南、用户系统数据模型、社区互动设计、免费额度容量估算
- **历史上的今天扩充 15 条** — 新增 5-12 月条目

### 改进

- **ItemModal** — 新增条目点赞按钮 + 评论面板
- **MobileSheet** — 接入用户系统交互
- **Header** — 右侧登录入口，已登录显示昵称

---

## v3.6.0 — 2026-07-26

### 新增

- **API 数据管线** (`build_data_api.py`) — 从 icebergthreads.com API 直接获取数据，零外部依赖，替代旧的手动 HTML 刮取流程。保留 `build_data.py` 作为备用方案（`beautifulsoup4` 依赖）。
- **副表系统** (`src/data/appendix/`) — 独立于自动管线的手动维护数据层，通过 item ID 与主表关联。
  - `related.csv` — 关联词条（junction table，source_id → target_id，前端自动构建双向索引）
  - `references.csv` — 参考链接（label → url 键值对）
- **副表编辑器** (`/appendix-edit`) — `import.meta.env.DEV` 条件路由，仅开发模式可用，生产构建不可见。左侧搜索/筛选词条列表，右侧同时显示该词条全部副表 section。关联词条专用搜索 UI（正向可编辑 + 反向只读跳转），其他副表通用表格编辑器。
- **Vite `appendix-save` 插件** — 编辑器点「保存」直接 POST 写文件到 `src/data/appendix/`，HMR 即时生效，无需下载替换。

### 改进

- **关联词条双向化** — 数据管线构建时自动生成反向索引，选 A 同时看到 A→B 和 B→A
- **副表优先策略** — `pickRelated()` 优先用副表 `related.csv` 手动精选，无副表数据时回退 `iceberg.json` 中的自动解析
- **编辑器词条卡片** — 显示完整描述、创建/更新时间戳（来自 API）、分类标签、原始链接，提供充分编辑上下文
- **保存状态提示** — 工具栏黄字 `⚠ 已修改 × 个副表 — 保存`，零修改显示 `✓ 已保存`
- **API 链接修复** — `www.` 开头链接自动补 `https://`
- **CLAUDE.md 更新** — 数据管线文档改为 API 优先/HTML 备用两种方式说明，关键常量同步（1400 词条 / 8 层 / 67 标签）

### 移除

- **自动关联词条解析** — `build_data.py` 中 `resolve_related()` 和「相关词条{名}{名}」模板匹配已移除，改为副表手动维护
- **前端「关联推荐」** — 保留 `getRelMap()`/`pickRelated()` 自动解析推荐，`related.csv` 副表手动精选优先；ItemModal/MobileSheet 均展示关联 + 推荐词条

---

## v3.5.0 — 2026-07-11

### 新增

- **首页导航中枢** (`/home`) — 冰山图宽幅横幅（主入口）+ 专题/手册/古籍/3D 四入口 + 历史上的今天内联展示（日期、年份、标题、描述）
- **手册页** (`/handbook`) — A-Z 拼音速查表，分类/标签/名词按拼音首字母分组，固定侧栏跳转（桌面 fixed 居中，移动 sticky 横滚），百科风格条目解释
- **专题系统** (`/features` + `/features/:slug`) — 编辑精选串联词条，frontmatter 声明关联词条 ID，`[item:ID]` 标记在正文中渲染为内联词条卡片，点击弹出 ItemModal 详情弹窗（前后导航、相关推荐）
- **Markdown 渲染器** (`src/lib/md.ts`) — 极简渲染：标题、段落、列表、粗斜体、链接、行内代码，支持 `extractToc()` 提取目录
- **拼音首字母工具** (`src/lib/pinyin.ts`) — 200+ 常用汉字 → 拼音首字母映射，支持 `getFirstInitial()` 获取文本首个汉字拼音
- **占位数据** — 手册与专题使用占位内容，分类/标签列表由 `iceberg.json` 动态生成

### 改进

- **首页视觉** — 思源黑体、3:1 宽幅冰山图大卡（hover 内发光）、4 列横排入口、历史上的今天顶部分割线 + 杂志式排版、极致淡化底部
- **手册可读性** — 0.85rem 描述字号、1.85 行高、0.4 亮度、条目间距 1.6rem，无卡片纯文字排版

### 修复

- **路由切换滚动条闪烁** — `body overflow-y: hidden` 防止 body 产生独立滚动条，`html overflow-y: scroll` 始终显示滚动条，`::-webkit-scrollbar width: 0` 零宽不可见，页面过渡保留 `mode="out-in"` + 外层 `min-height: 100vh` 容器防止内容坍缩
- **滚动条黑边** — 移除 `scrollbar-gutter: stable`，改用 `width: 0` 透明滚动条不占视觉空间
- **CSS @import 顺序错误** — Google Fonts 从 `global.css` 尾部的 `@import url()` 移至 `index.html` `<link>` 标签，消除 PostCSS 编译警告
- **页面过渡 transform 抖动** — `page-fade` 移除 `translateY(12px)`，仅保留 opacity 过渡

---


### 修复

- **GitHub Pages SPA 路由** — `404.html = index.html` 副本 + `NotFoundView.vue`，解决 `/3d` 等路径直接访问 404
- **`require('fs')` → `import`** — vite.config.ts 兼容 ESM 构建环境
- **弹窗背景滚动锁** — `html` + `body` 双 `overflow:hidden`，overlay 加 `@touchmove.self.prevent`

### 改进

- **联系我们** — 更新三语 intro（强调社区项目无官方账号），新增 IcebergThreads + GitHub 链接

---

## v3.4.1 — 2026-07-02

### 新增

- **历史上的今天大幅扩充** — 166→195 条，新增 7~9 月条目：女巫布莱尔首映、杜塞尔多夫吸血鬼伏法、回到未来上映、兔子洞起源、玛雅手抄本大火、约翰·迪伊出生、克里斯汀·查伯克直播自杀、萧山机场UFO、营口坠龙、旅鸽玛莎、伦敦大火、ARPANET 诞生、旅行者1号发射、戴安娜葬礼、911、大型强子对撞机、诺顿一世登基、CIA成立、炸弹客宣言、三位一体核试验、阿波罗11号登月、奥罗拉枪击案等
- **历史上的今天关联词条** — 萧山机场UFO → `9cac72c4`、营口坠龙 → `19ee7c65`

### 改进

- **历史上的今天弹窗移动端适配** — 年份列 32px、间距缩小、标题 `break-words`、日期栏紧凑

### 修复

- **CSV 格式一致化** — 补齐 `link` / `item` 空字段

---

## v3.4.0 — 2026-06-28

### 新增

- **3D 冰山页交互完善** — 词条钻石按类别着色、hover/聚焦发光（Bloom 后处理）、GSAP 弧线运镜、聚焦光环追踪、粒子漂浮、拖拽/点击区分
- **设置面板新增** — 简易模式/标准模式一键切换、高亮最近更新、弱化已读、可关闭
- **最近更新标记** — 仅最新批次词条显示果冻色胶囊背景
- **已读/未读** — 打开弹窗即标已读，已读词条半透明弱化，tooltip 不受影响
- **`/` 键聚焦搜索框** — 任意位置按下 `/` 跳入搜索
- **复制分享链接** — 弹窗中点击标题复制 `/#词条id` 直达链接
- **中键平移摄像机** — 3D 页中键拖拽平移

### 改进

- **数据规范化接入 3D 页** — `normalizeData` 处理引号、标点、层级名
- **`data.ts` 引号正则修复** — Unicode 弯引号 + ASCII 直引号全部转为直角引号「」
- **间隔号前后加空格** — `卡尔·马克思` → `卡尔 · 马克思`，步骤后置于去空格逻辑
- **已读/最近更新默认可关闭且实时响应** — `useStore` 包装确保 Vue 追踪
- **设置项默认值改为标准模式** — `detailMode: modal`, `filterMode: hide`, `immersiveMode: true`, `floatMode: static`, `showRandomBtn: true`
- **冰面材质降低反光** — `metalness: 0.6→0.05`, `roughness: 0.25→0.55`
- **`THREE.Clock` → `THREE.Timer`** — 切标签页不跳帧
- **ACESFilmicToneMapping** — 色彩管理

### 修复

- **3D 词条点击无反应** — `onPointerUp` 独立射线检测，触控兼容
- **密集钻石误选** — 屏幕 2D 距离最优匹配替代 3D 深度
- **聚焦光环不跟随** — 每帧追踪钻石世界坐标
- **运镜突变回正** — `controls.enabled` 切换导致 OrbitControls 状态丢失
- **聚焦环始终面屏** — `RingGeometry` + `setFromUnitVectors(Z, toCamera)`
- **`showNewMark` / `showReadMark` 在 `filterMode: hide` 下无效** — class 标记提取到过滤逻辑外
- **最近更新全部 1371 条同一时间戳** — `build_data.py` 指纹对比保留增量时间戳
- **`build_data.py` 重新导入后时间戳分布** — 372 条 6/28 + 750 条 6/13 + 258 条 5 月
- **资源泄漏** — 几何体/材质统一 `dispose`

---

## v3.3.0 — 2026-06-27

### 新增

- **3D 冰山页面** (`/3d`) — Three.js 驱动的 3D 冰山场景，程序化低多边形冰山、动态水面波浪、冰晶粒子、轨道相机，无导航入口（仅直接 URL 访问）

---

## v3.2.1 — 2026-06-15

手机端修复与适配。

### 修复

- **手机词条抽屉不显示** — 补全缺失的 `.sheet-overlay` / `.sheet-panel` CSS（底部弹出面板样式之前完全空白）
- **手机端 hover 误触发** — hover 记号笔效果加 `@media (min-width: 1024px)` 限制为桌面端
- **关联词条跳转失败** — MobileSheet 点击关联/推荐词条后立即 `$emit('close')` 导致新数据被 `null` 覆盖，移除 close 事件
- **词条抽屉与筛选抽屉样式统一** — 统一 `#111` 背景、16px 圆角、36px 把手、相同动画曲线
- **手机端强制底部抽屉** — `onClick` / `setModalItem` / `onMouseOver` 全部加 `window.innerWidth < 1024` 判断，手机端禁止 tooltip 和弹窗

### 改进

- **Header 手机适配** — 标题字号 `max-sm:text-[1.8rem]`、版次标签在小屏移到标题下方单独一行
- **访问词条链接弱化** — 从全宽黑底白字大按钮改为圆角 pill 边框按钮
- **Hero 副标题上移** — logo 下边距 `3rem → 1.25rem`，三行间距整体收紧


---

## v3.2.0 — 2026-06-14

Hero 重设计 + 性能深优 + 历史上的今天弹窗 + 公告系统 + 数据管线优化。

### 新增

- **Hero 页面重设计**：杂志感全屏封面，背景图片视差（鼠标反向追踪）、光标手电筒暗角、SVG 标题、横向滚动词条（8 行思源宋体，`calc(100dvh/8)` 填满屏幕）、多层视差退出动画、橙色→天蓝→深海蓝渐变背景、胶片暗角、预加载后触发 hero-ready 确保 loading splash 正常
- **历史上的今天弹窗**：Header 点击弹出 BaseModal 内的日历/事件卡片，日期快速切换、年份同行标注、底部链接完整页面
- **公告板系统**：`src/data/bulletins/*.md` 前端加载 + BulletinModal 展示，新增 Chrome 推荐公告
- **历史上的今天数据**：新增 30+ 事件（罗斯威尔时间线、水门事件、肯尼斯·阿诺德、共济会、斯特拉斯堡舞蹈瘟疫等），全表按日期排序

### 性能优化

- **IndexView 路由监听**：`watch` 响应式处理 `?item=` 参数，替代仅 `onMounted` 检测
- **IcebergApp**：排序 DocumentFragment 批量插入、字号 CSS 变量替代 DOM 操作、触控 rAF 节流、跳过初始默认排序
- **ItemInteractivity**：修复 `open-item-modal` 监听器泄漏、滚动阻止 tooltip 误触发、过滤单次遍历、移除 getRelMap 预热、Worker 载荷精简
- **AncientBookView**：O(N) 单次分组替代 O(N×M) filter、移除重复 resize 监听器
- **data.ts**：合并正则表达式减少扫描遍数
- **bg.css**：translate3d GPU 合成、动画幅度与速度调整

### 改进

- **AppShell**：loading splash 保护时间 400ms → 800ms，淡出动画 0.5s → 1s
- **BaseModal**：修复滚动锁与 HeroSection 冲突
- **bgMode**：修复 localStorage JSON.parse 解析（storedAtom 存储格式）
- **build_data.py**：协作者按拼音首字母排序（pypinyin）、分类颜色从 HTML 图例区动态提取
- **Header**：移除 hero-exit 耦合的淡入动画，标题始终立即可见
- **历史上的今天页**：年份弱化至标题同行左侧、添加日期快速切换按钮、添加返回冰山图链接
- **i18n**：中/英/日新增 `source`、`explore` 等 key，全局引入 Noto Serif SC

### 移除

- **hero-flare**：`mix-blend-mode: screen` 性能问题
- **弥散光**：`blur(90px)` + `mix-blend-mode` 三层，GPU 开销过大
- **content-visibility**：导致 tooltip/高亮失效
- **标点挤压**：`text-spacing` 浏览器支持不完善，回退

### 修复

- 弹窗退出动画卡顿（will-change 过度膨胀、rAF 与 CSS transition 冲突、classList 同步加 hero-out）
- 聚光灯退出时 JS 覆盖 CSS opacity
- 背景视差退出动画消失（rAF 与 CSS 打架）
- 弹窗模式下滚动无法恢复
- bg-mask 空白规则导致 CSS 编译错误

---

## v3.1.0 — 2026-06-04

词条收藏 + 弹窗导航 + 数据管理 + 历史上的今天扩容。

### 新增

- **词条收藏**：弹窗和抽屉内 ☆/★ 按钮一键收藏，侧边栏「☆ 收藏」筛选按钮，localStorage 持久化
- **弹窗内上下导航**：← → 箭头按钮 + 键盘左右键，按当前排序遍历全部词条，Esc 关闭
- **设置数据导入/导出/清空**：导出 JSON 到剪贴板，粘贴导入，确认清空所有数据
- **历史上的今天**：从 Koishi 数据源扩容至 122 条，全年覆盖
- **冯·丹尼肯、吉米·亨德里克斯、LCQP、D.B. Cooper、弗雷斯诺夜行者** 等数十条新增事件
- **手机版抽屉增强**：补齐收藏、关联词条、推荐词条

### 改进

- **手机版详情**：关联词条点击可在抽屉内导航，不再跳转弹窗
- **设置面板**：提示色统一为日落橙 `#ff6a06`，底部刷新提示 i18n 化，手机端详情模式加提示
- **历史上的今天**：描述全部改为单句平实叙述，无冗余日期；词条链接依详情模式跳转（tooltip/弹窗）
- **BaseModal**：修复背景滚动锁定（同时锁 `body` 和 `html`），标题换行不再截断
- **浮动按钮**：修复 `window` 未定义报错
- **页脚**：加入 Moe Counter 像素计数器（自部署 moeyy.cn）
- **待办更新**：TODO.md 标记已完成项，新增近期规划

### 修复

- 收藏按钮 `item.id` 为 `undefined` 导致收藏无效
- 收藏筛选 `favF` 未进 `watchEffect` 依赖跟踪导致筛选不生效
- 弹窗 `truncate` 类导致长标题变省略号

---

## v3.0.0 — 2026-06-03

Astro → 纯 Vue 3 + Vite 迁移。5 个 Vue 孤岛合并为单一应用，架构简化，Edge 性能大幅提升。

### 架构变更

- **迁移至纯 Vue 3 + Vite**：去掉 Astro 中间层，vue-router history 模式
- **provide/inject 数据流**：替代 `JSON.stringify` → `JSON.parse` 传参，全链路去序列化
- **组件重组**：`components/` 按 layout / iceberg / items / modals / calendar 分文件夹
- **HTML 体积**：2.28 MB → 0.6 KB（数据走 JS import，不再嵌入 HTML prop）

### 性能优化

- **响应式降级**：`markRaw` 阻止 1343 词条深层 Proxy，`shallowRef` 浅响应数组
- **v-memo**：词条 span 按 `[id, categoryColor]` 缓存，筛选跳过未变项
- **KeepAlive**：页面切换不销毁，返回主页 0ms
- **路由懒加载**：`() => import()` 分包，首屏 JS 减半
- **Fuse.js → Web Worker**：搜索异步化，主线程零阻塞
- **HeroSection idleCallback**：浮动文字延迟到浏览器空闲
- **IcebergBackground v-once**：130 行 SVG 背景从不 diff
- **TierNav RAF 节流**：滚动 `getBoundingClientRect` 限制到 60fps
- **弹窗动画提速**：fade-enter 0.5s→0.2s，leave 0.35s→0.15s
- **gzip 预压缩**：`vite-plugin-compression`，传输体积 -70%
- **构建优化**：`esbuild.drop console`，Vite code splitting（vue/fuse 独立 chunk）

### 新增

- **纯黑背景**：设置中可选 纯黑 / 静态 / 动态，替代简洁模式页面
- **背景选项合并**：动态背景 + 纯黑背景 → 三选一 `bgMode`
- **设置面板重新排版**：字号→排序→背景→详情→筛选→实验功能→语言，底部 sticky 刷新提示
- **弹窗 BaseModal 抽象**：所有弹窗共享结构（sticky header + 滚动 body + footer hint），滚动锁统一管理
- **弹窗 CSS 独立**：`modal.css` 集中管理，MobileSheet 样式归入

### 改进

- **i18n 清理**：移除 11 个未使用的 key（94→83）
- **Footer 合并**：FooterSection + FooterModals → FooterSection 一个文件
- **简洁模式移除**：路由 `/minimal` 重定向至 `/`，Header 去入口
- **层级中文显示**：Tier 1~8 → 层级 1~8
- **所有弹窗滚动锁定**：打开弹窗时 `body overflow: hidden`
- **Footer CSS 修复**：Tailwind v4 兼容，改 inline style
- **MobileSheet 修复**：`item` 为 null 时不再显示"分类:"
- **路由修复**：`<router-link>` 替代 `<a href>`，SPA 内切换无整页刷新

### 移除

- Astro 架构（`astro`, `@astrojs/vue`, `@astrojs/tailwind`）
- MinimalView 页面
- FooterModals 组件（合并进 FooterSection）
- 旧版 FilterSidebar / ActiveFilters / SearchBar 死代码未迁移

---

## v2.2.0 — 2026-06-03

性能优化（Edge 专项）+ 详情弹窗 + 相关词条 + 设置面板重构。

### 新增

- **详情模式切换** — 设置中可选 Tooltip / 弹窗两种交互模式
  - Tooltip 模式（默认）：hover 浮窗，点击打开外部链接
  - 弹窗模式：点击词条弹出详情面板（标题、分类印章、标签、描述、参考链接）
- **相关词条** — 弹窗模式下展示关联词条，点击直接跳转
  - 数据中的已有关联优先显示
  - 算法推荐 2 个（基于分类 +3、共用 tag +2、标题 bigram +1 上限 3，门槛 ≥2）
- **词条排序** — 设置中可选 默认 / A-Z / Z-A / 按分类 四种排序
- **动态背景开关** — 设置面板新增，默认关闭，开启时标注性能消耗警告
- 古籍模式接入 Google Fonts Noto Serif TC 网络字体，字重精简为 400/700/900（从 5 个降至 3 个），部署后无宋体环境也能正常显示

### 改进

- **Edge 浏览器性能**：
  - HTML 体积 4.48 MB → 2.28 MB（消除重复 JSON 序列化）
  - 移除 9 个 `will-change` 声明，减少 GPU 合成层
  - 移除 1343 个 `isolation: isolate` 堆叠上下文
  - hover 效果 `transform: scaleX(0)` → `opacity: 0`，省 1343 组 GPU 层
  - `transition` 仅对 `.dimmed` 生效，非筛选时不追踪 1343 个过渡
- **设置面板重构**：加宽、去滚动条、布尔选项用切换按钮、详情模式与排序
- **所有弹窗统一**：modal-overlay / modal-panel 共享样式，关闭按钮、标题栏一致
- 修复 Tooltip 消失动画（visibility 延迟 0.4s 等 opacity 淡出）
- 修复弹窗模式下 hover 仍消阴影的问题（`:not([data-detail="modal"])`）
- 随机词条按钮在弹窗模式下直接出弹窗

---

## v2.1.0 — 2026-06-02

古籍模式 — 线装书双页展开，竖排文言风格阅读。

### 新增

- **古籍模式** (`/ancient-book`) — 仿线装书双页展开、竖排右起的沉浸式阅读界面
  - **分卷阅览**：按类别（十六卷，古称「廣知」「凶宅」「史微」等）或层级（八卷，「甲志」至「辛志」）分章，含书名页、序言、卷首页
  - 移植 wenyan-renderer 的 `parseWenyan` 词法分析与 `layoutPages` 版面布局引擎
  - 双页展开，中缝仿版心设计（黑口、象鼻、鱼尾纹饰、卷名、中文数字页码）
  - CSS Grid 逐字定位，词头朱红大字、注释双行小字（楷体）、正文松烟墨色
  - 句读标点以硃砂色 SVG 圈点渲染
  - 宣纸底色与微粒噪点滤镜，文武双栏边框
  - 固定列宽/行高排版（`--cw` / `--rh`），基于视口尺寸自适应
  - 阿拉伯数字→中文数字，拉丁字母→全角，英文标点→中文句读
  - 模式切换按钮（类别 / 层级），箭头键翻展
  - 点击词头弹出金石风格详情浮层（双线白描框、朱文印章分类、笺注标签）
  - resize 自适应重排版

### 改进

- Header / StaticHeader 导航栏新增「古籍」入口（i18n 已覆盖中/英/日）

---

## v2.0.0 — 2026-05-25

Astro + Vue 3 重写，从 React SPA 迁移至静态生成架构。

### 新增

- 历史上的今天 — 每日历史奇闻日历，支持日期浏览与关联词条跳转
- 三语言支持（中文 / English / 日本語），覆盖全部 UI
- 加载盾 — 消除页面切换时的布局闪烁
- 滚动时自动暂停背景动画，更流畅

### 改进

- 首屏加载大幅提速：1343 个词条预渲染为静态 HTML，无需等待 JS
- 背景冰山图重绘：纯 CSS 多层视差（天空、云、水波、冰峰、暗流）
- 筛选性能优化：搜索防抖、延迟索引、CSS containment
- 词条标记改用 CSS 渲染，减 1300+ DOM 节点
- 设置面板：字号 / 浮动 / 筛选模式 / 沉浸模式 / 标记开关 / 语言

### 移除

- React SPA 架构（`iceberg-react/`）
- 词条详情弹窗（改为新标签打开外部链接）

---

## v1.1.0 — 2026-05-15

### 改进

- 错误边界 — 组件崩溃不再白屏
- i18n 补全 — 修复多处未翻译文本
- 无障碍 — 模态框焦点锁定、键盘导航支持
- 数据加载 — 超时重试机制

### 移除

- 3D 冰山图（`/3d`）和网络图（`/web`）实验页面

---

## v1.0.0 — 2025

React 重写版本，替代 legacy 静态站。
