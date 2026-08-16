# 数据与构建流程

> 2026-08-16 深度重整理后：所有脚本位于 `scripts/`，数据工作区统一为 `data/`（work / archive / reports）。
> 脚本路径基于自身位置推导项目根，**任意 cwd 均可运行**。

## 数据管道总览

```
icebergthreads.com API            ← 自动获取最新数据（推荐，零依赖）
    │
    ▼
scripts/build_data_api.py         ← 编译为 iceberg.json
    │
    ▼
iceberg-vue/src/data/iceberg.json ← Vue 应用直接导入（构建时内联）
    │
    ▼
iceberg-vue/  (Vue 3 + Vite)
  npm run dev / npm run build
      ↓
  dist/ (可部署静态站点)
```

### 备用 HTML 管道（API 不可用时手动回退）

```
iceberg.html                      ← 从 icebergthreads.com 保存的 SingleFile 页面
    │
    ▼
scripts/build_data.py             ← 刮取 HTML，生成结构化数据（依赖 beautifulsoup4；pypinyin 可选）
    │
    ├── data/work/                     ← 中间产物（构建指纹，下次对比用）
    │   ├── config.json
    │   └── items/*.md
    │
    └── data/archive/                  ← 有变化时自动归档旧 work（YYYY-MM-DD_HHMMSS/）
```

## 第一步：更新源数据（推荐 API 方式）

```bash
python scripts/build_data_api.py
```

**做了什么：**
1. 从 `https://icebergthreads.com/api/iceberg/fel4BTCqlMAGSa2gelRJ` 拉取 JSON（失败自动重试 3 次，指数退避）
2. 提取条目、分类（颜色）、emoji 标签映射、层级
3. 时间戳直接使用 API 的 `createdAt` / `modifiedAt`（毫秒转秒；为 0 或缺失时省略该字段，不伪造 1970 时间戳）
4. 参与创作者按拼音全拼排序（无 pypinyin 时回退 Unicode 序）
5. 输出 `iceberg-vue/src/data/iceberg.json`

依赖：**零外部依赖**（仅 Python 标准库）。

## 备用方式：HTML 刮取（API 不可用时）

```bash
python scripts/build_data.py iceberg.html
```

**做了什么：**
1. BeautifulSoup 刮取 HTML，提取词条、分类、标签
2. 从 HTML 图例区动态解析分类颜色映射
3. 对比已有 `data/work/items/*.md` 的时间戳指纹——内容未变的保留 `modifiedAt`
4. 归档判定对比 tiers + introText + 条目内容指纹（title/category/tags/desc/link 连接串），任一有变化即归档到 `data/archive/YYYY-MM-DD_HHMMSS/`
5. 协作者按拼音全拼排序（pypinyin，缺失时回退 Unicode 序）
6. 输出 `iceberg-vue/src/data/iceberg.json`

依赖：`beautifulsoup4`；`pypinyin` 可选（缺失时排序回退 Unicode 序）。

**归档位置：** `data/archive/`（项目根目录，有变化时自动生成）

## 第二步：Vue 应用

```bash
cd iceberg-vue

# 开发
npm run dev          # http://localhost:5173

# 生产构建（含类型检查）
npm run build        # → dist/
npm run preview      # 预览构建结果
```

数据集 `src/data/iceberg.json`（~960KB）在构建时由 Vite 直接打包内联，无需运行时 fetch。构建产物为纯静态文件，直接部署。

## 第三步：生成单页 HTML

从同一份 `iceberg.json` 生成无外部依赖的单文件 HTML。

```bash
python scripts/build_single_page.py
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--data` | `iceberg-vue/src/data/iceberg.json` | JSON 数据源（基于脚本位置推导） |
| `--output` | `Iceberg_时间戳.html` | 输出文件名，自动去重 |
| `--title` | `中文兔子洞冰山图` | 页面标题 |

## 典型工作流

### 日常更新（API 有新增/修改词条）

```bash
python scripts/build_data_api.py        # 1. 拉取 API 数据（推荐）
cd iceberg-vue && npm run build         # 2. 构建 Vue 应用
cd ..
python scripts/build_single_page.py     # 3.（可选）生成单页 HTML
```

### API 不可用时（手动回退）

```bash
python scripts/build_data.py iceberg.html   # 1. SingleFile 插件保存页面后刮取
cd iceberg-vue && npm run build             # 2. 构建 Vue 应用
cd ..
python scripts/build_single_page.py         # 3.（可选）生成单页 HTML
```

### 仅开发前端（不涉及数据更新）

```bash
cd iceberg-vue
npm run dev
```

## 文件位置速查

| 文件/目录 | 说明 |
|-----------|------|
| `iceberg.html` | 源 HTML（SingleFile 导出，备用管线用） |
| `scripts/build_data_api.py` | API 数据获取 + 编译脚本（推荐，零依赖） |
| `scripts/build_data.py` | HTML 刮取 + 编译脚本（备用，依赖 beautifulsoup4） |
| `scripts/build_single_page.py` | 单文件 HTML 生成脚本 |
| `scripts/extract.py` | HTML → CSV 反向导出 |
| `scripts/quality_report.py` | 数据质量报告（原 check_links.py）：链接有效性 + 结构完整性 + 描述/标点规范 + 链接重复与质量 + 回归对比，输出 `data/reports/` 带时间戳 CSV |
| `data/work/` | 中间产物（config.json + items/*.md，仅 HTML 管线用） |
| `iceberg-vue/src/data/` | Vue 数据源（构建时内联） |
| `data/archive/` | 有变化时的 work 旧数据备份 + 历史归档（legacy-2026-08 / tools-2026-08） |
| `iceberg-vue/dist/` | Vue 生产构建输出 |
| `docs/` | 项目文档（plans/ 规划、audits/ 巡检） |