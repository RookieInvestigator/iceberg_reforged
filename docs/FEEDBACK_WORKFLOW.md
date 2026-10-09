# 反馈/订正工作流（人工审阅 + 定时自动化）

> 原则：**判定归人，跑腿归机器**。机器只做搬运和格式校验，不决定对错。
> 前置决策：反馈必须登录提交（匿名不可）；表结构与 RLS 见 `iceberg-vue/supabase/migration.sql` 的
> `entry_feedback` 节；前端见 `src/lib/feedbackData.ts`（与 `supabaseData.ts` 同纪律：
> 只读降级、写错抛出、未配置守卫隐藏入口）。

## 提交表设计（`entry_feedback`）

```sql
CREATE TABLE entry_feedback (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     text NOT NULL,                       -- 8 位词条 ID（写入前经 F30 alias 归一）
  changes     jsonb NOT NULL DEFAULT '{}',         -- 仅存改过的字段 {field: newValue}，见下
  note        text NOT NULL DEFAULT '',            -- 反馈说明（为什么改/出处）
  user_id     uuid NOT NULL REFERENCES auth.users, -- 匿名不可提交，无 anon 列
  status      text NOT NULL DEFAULT 'open',        -- open/accepted/rejected/applied（applied 只由 workflow 写）
  applied     boolean NOT NULL DEFAULT false,      -- 是否已写入副表（防重复合入）
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON entry_feedback (item_id);
CREATE INDEX ON entry_feedback (status) WHERE applied = false;
```

字段说明：只有一种类型——反馈（无举报、无分类）。`changes` 只收五个可改字段
`title/desc/link/category/tags` 里的**差异项**（提交时前端 diff，空对象拒绝写入）；
`note` 是必填的说明（改了什么、为什么、对什么负责，≤2000 字与 `changes` 合计）。

RLS（照抄 comments/interactions 三件套）：

- `SELECT USING (true)` —— 全公开可读（含 `user_id`？不：列表查询只 select
  `id,item_id,changes,note,status,created_at` + 经 `batch_user_display` 解析的显示名，
  与评论同口径，不泄漏 `user_id` 明细）；
- `INSERT WITH CHECK (auth.uid() = user_id)` —— 登录强制绑定，无匿名分支；
- `DELETE USING (auth.uid() = user_id)` —— 仅本人可撤回；管理员删改走 Supabase 后台
  （与 TODO"管理员后台手动顶"一致，不另做法）；
- 防刷：应用层 24h 内同人限 10 条（先粗后细，不值得上触发器）。

## 状态机

```
open（待审） → accepted（已采纳）/ rejected（已驳回，附理由）
accepted → applied（已写入副表，由自动化回填，人勿手改）
```

`rejected(auto:*)` 保留给机器：空内容 / 超长 / item_id 孤儿（对照 `id-index.json`）/
24h 内同人同条目重复。机器只驳回"格式坏"，不碰"内容对错"。

## 用户提交流程（前端）

1. **入口**：词条弹窗动作条"纠错"键（`V2EntryActions` + v1 footer 动作条各一，走 `header-actions`
   插槽模式，不动 modal 本体）。
2. **登录门**：未登录点开先走登录弹窗（UserModal 同款）；匿名不可提交（既定），无昵称框。
3. **表单（整条预填 + 一条说明）**：打开即当前词条五个字段全量预填
   （标题 / 描述 / 链接 / 分类 / 标签），想改就改，不改也行；另附一条"反馈说明"
   （必填：想说什么、对什么负责，最好给出来处）。提交时前端 diff，有改动的字段装进
   `changes`，只写说明不改字段也允许（`changes` 为空对象即纯反馈）；`changes` + `note`
   合计 ≤2000 字前端先拦（说明空 + 全未改才拒绝提交）。
4. **提交**：`postFeedback`（F11：失败抛错回滚 UI）；成功 toast + 落到"我的反馈"列表顶部，
   状态 `open`。
5. **状态可见**：UserModal 内"我的反馈"列表读本人提交：`open` 灰点 / `accepted` 绿点 /
   `rejected` 附理由；`applied` 后词条卡出现"社区订正"角标（渲染层排期见落地顺序 4）。
6. **展示**：弹窗内"社区订正（N）"折叠区默认收起，不抢描述阅读流；未配置 Supabase 时
   整个入口 `supabaseReady` 守卫隐藏（与评论区同条件）。

## 自动化一（⏳ 未落地）：每 N 天推送待审（默认 7 天）

> 2026-10-09 实况核查：`.github/workflows/` 目前**只有 `deploy.yml`** —— 本节与「自动化二」描述的
> 两条 workflow 从未实现，反馈因此一直堆在库里（截至 10-08 积压 189 条全 open）。下方是设计意图，
> 不是现状；现状见「本地审核工作台」一节。

` .github/workflows/feedback-digest.yml`，cron 定时 + `workflow_dispatch` 手动加跑：

1. 读 `status=open` 全量，按 `item_id` 分组；
2. 生成（或更新）一个 tracking issue：标题 `反馈待审 · YYYY-MM-DD`，
   正文逐条列 `item_id / changes（改了哪几个字段）/ note 前 200 字 / created_at` + 直达 Supabase 行链接；
3. 上一期 issue 若还有 open 行，继续追加到同一 issue（不另开，保持"每周只看一个 issue"）；
4. 写 `data/reports/feedback-digest-YYYYMMDD.log`（本期几条、新增几条）——`data/` 不入库，
   log 仅供本次 run 留底，长期审计看 issue 时间线。

N 改一行 cron 即可（`0 2 * */7 *`）；量起来改 3 天。

## 本地审核工作台（2026-10-09 落地，当前唯一可用路径）

两条 workflow 落地之前，审阅走本地页面：**`/feedback-review`**（DEV 专用路由，生产构建不产出）。

```bash
cd iceberg-vue && npm run dev
# → http://localhost:5173/iceberg_reforged/feedback-review
```

- **数据源**：Supabase REST（anon key 只读，RLS `SELECT USING (true)`）或「导入 CSV」离线模式
  （吃 Supabase 导出的 `entry_feedback_rows*.csv`）
- **界面**：左栏清单（类型/域名/决定色点 + 搜索筛选），右栏**当前值 vs 建议值**并排
  （标题 / 描述带字数增减 / 链接带显示名预览）+ 作者说明 + 三个决定键
- **键盘**：`J`/`K` 或 `↑↓` 翻条 · `A` 采纳 · `R` 驳回 · `S` 待定 · `Enter` 下一条 · `Backspace` 撤销
  （决定后自动前进，189 条量级几分钟能过完）
- **决定落盘**：`localStorage` + `data/feedback/decisions.json`（dev 中间件 `/__feedback-decisions`，
  `data/` 整体 gitignore，审核痕迹不入库）；驳回理由一并记录
- **落盘副表**：工作台**不写副表**，只导出决定；写盘由脚本做（可 dry-run、可审计、可回滚）：

```bash
python scripts/apply_feedback.py --decisions data/feedback/decisions.json --write   # 只落盘 accept
python scripts/apply_feedback.py --decisions data/feedback/decisions.json           # 先 dry-run
```

`scripts/apply_feedback.py` 的职责（= 未来 workflow 的引擎，同一份代码）：

| 处理 | 去向 | 规则 |
| --- | --- | --- |
| `link` | `appendix/references.csv` | F34 同款 `normalize_link`（裸域名补 https、非 http(s) 拒绝）；`(source_id, url, role)` 去重，`role=main` 覆盖主链接 |
| `title` / `desc` / `tags` | `appendix/overrides.csv` | `(item_id, field)` upsert（新采纳覆盖旧值）；值内换行归一为单行（前端 `parseCSV` 按行解析） |
| `category` | `appendix/categories.csv` | 写成 `role=main`（覆盖主分类，每词条一条，新采纳覆盖旧 main 行） |
| 署名 | `appendix/contributors.csv` | 落盘时按 `(item_id, by)` upsert（同键保留较晚的 `at`）；只有真写进去的反馈才记名 |

**看已审的词条**：拉取范围（`open / 已采纳 / 已驳回 / 全部`）直接作为 Supabase 查询的 `status=eq.X`
过滤 —— 回填之后 `open` 里就查不到已审行，必须能切过去回看；「只看未决」是**另一个**开关，
走本地 `decisions.json`（「我在这台机器上决定过没有」）。两个口径故意不合并：
线上已 accepted、本地没决定过的行，`scope=已采纳` 能捞回来、`只看未决` 也不会把它藏掉。
列表上方显示「筛选后 N 条 · 涉及 M 个词条」——一个词条可能有多条反馈，条数≠词条数。
筛选逻辑是纯函数 `filterReviewRows`（`lib/feedbackReview.ts`），顺序固定
**库状态 → 类型 → 未决 → 关键词**，由 `feedbackReview.test.ts` 锁定。

其他：`item_id` 先过 F30 alias 归一 + `id-index.json` 存在性校验（孤儿跳过并报告）；
`--review-md` 输出人可核的合入清单；`--emit-sql` 输出回填语句（`status='accepted', applied=true`）。

**状态自动回填（2026-10-09）**：落盘成功后，工作台还会把审核结果写回 Supabase —
采纳 → `status='accepted', applied=true`，驳回 → `status='rejected'`（`later` 与未决保持 open）。

- **为什么必须用 service role key**：`entry_feedback` 只有「公开 SELECT + 本人 INSERT/DELETE」三条策略，
  **没有任何 UPDATE 策略**，而这些反馈行属于他人 —— anon key 连「自己的行」都改不了，何况别人的。
  管理性写入只能走 service_role（绕过 RLS）或 Supabase 后台手跑 SQL。
- **怎么开**：Supabase → Project Settings → API → `service_role` secret，写入 `iceberg-vue/.env` 的
  `SUPABASE_SERVICE_ROLE_KEY=…`（`.env` 已 gitignore）。**该 key 只在 Node 中间件与本地脚本里读，
  绝不进浏览器包、也不出现在任何响应里**；没配时工作台会明说「不会回填」，并保留 `--emit-sql` 兜底。
- **顺序**：先写副表再回填 —— 没落盘就标 `applied=true` 等于谎报合入（沿用文档
  「`applied` 只由收尾步骤写，人勿手改」的约定）。
- **已知缺口**：表里没有「驳回理由」列，所以工作台里填的理由只存在本地 `decisions.json`；
  要让投稿人看到理由，需先执行 `ALTER TABLE entry_feedback ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '';`
  再把理由一并 PATCH（前端「我的反馈」也要读该列，属后续改动）。

**渲染层叠加已补**（`lib/iceberg/overrides.ts`，v1/v2 同序接入 `applyOverrides`）：
overrides.csv 的 `title`/`desc` 在词条对象被拷贝进词条墙 / descMap **之前**写回，
所以订正后的描述会真正显示；`CorrectedMark` 角标继续消费同一份数据。

## 人工审阅（手工环节 —— 工作台已把它从「Supabase 后台逐条改」降级为「页面里按键」）

每周看 tracking issue，逐条在 **Supabase 后台改 status**：

- 采纳 → `accepted`
- 驳回 → `rejected`（备注理由，用户在"我的反馈"可见结果）
- 拿不准 → 不动，留到下期（issue 会继续携带）

不写文件、不跑命令、不碰仓库。

## 副表关系：一表一域（2026-10-09 重组）

`iceberg-vue/src/data/appendix/` 下四张表，**一个数据区域只由一张表负责**；同一块数据有两个入口时，
渲染层就不得不打补丁（改主分类还要顺手换 `categories[0]` 防主/副打架），所以边界写死在代码里：

| 区域 | 表 | 列 | 键 | 语义 |
| ---- | -- | -- | -- | ---- |
| 标量字段 | `overrides.csv` | `item_id,field,value` | `(item_id,field)` | `field ∈ {title,desc,tags}`，last-wins |
| 分类 | `categories.csv` | `item_id,category,role` | `(item_id,category)` | `role=main` 覆盖主分类（每词条至多一条）；`role=extra`（缺省）追加副分类，OR 叠加 |
| 链接 | `references.csv` | `source_id,label,url,role` | `(source_id,url,role)` | `role=main` 覆盖主链接（URL / 显示名）；`role=ref`（缺省）附加参考 |
| 关联词条 | `related.csv` | `source_id,target_id` | `(source_id,target_id)` | 双向索引，写一条两侧都出现 |
| 署名 | `contributors.csv` | `item_id,by,at` | `(item_id,by)` | 谁为这个词条出过力；词条卡片的「社区贡献」图标 tooltip |
| 标记 | `extra.csv` | `item_id,flag,note` | `(item_id,flag)` | **行的存在即标记为真**（删行 = 取消）；`flag ∈ {warn, need}`（警示 / 需补充），`note` 是该图标 hover 的提示文案 |

**保留字段**：`category` / `link` / `related` 由专表拥有，写进 `overrides.csv` **不生效** ——
但绝不静默：`lib/iceberg/appendix.ts` 解析时记入 `violations`，前端 `console.warn`、
构建门（`build_data_api.check_orphan_relations`）、质量报告（`quality_report` 的「副表字段归属」）
与前端测试（`appendix.test.ts` 的「零越界」）都会报出来。

单一事实源：表定义 / 列名 / 键 / 角色 / 越界判定都在 `iceberg-vue/src/lib/iceberg/appendix.ts`，
**v1（`IndexView`）、v2（`useIcebergDataSource`）、副表编辑器（`/appendix-edit`）三处共用**
（此前各写一遍 parse，导致 role 只在一处生效过）。装配按区域分派：标量 → `overrides.ts`、
分类 → `extraCategories.ts`（含主分类色与墙渐变色标重算）、链接 → `entryLinks.ts`、关联 → `relatedMap`。

**署名独立成表**：`contributors.csv` 是「谁出过力」的唯一出处（原先 `by/at` 散在 overrides / categories 两表里，
等于同一块数据两个家）。词条卡片的「社区贡献」小圆图标只读这张表，tooltip 只给名字 ——
「由 DoneyTon 提供」，**不带日期也不列改了哪些字段**（日期是存档信息，字段清单是审计信息，读者都不需要）。
`overrides.csv` / `categories.csv` 里再出现 `by` / `at` 列会被 `quality_report` 的「副表列名」检查点名。

**标记（警示 / 需补充）**：`extra.csv` 一表两用 —— `flag` 决定是哪种标记，`note` 是它的 hover 文案。
行的存在即标记为真，所以「取消标记」= 删行（编辑器里就是再点一下那个 chip）。加新标记只需在
`lib/iceberg/appendix.ts` 的 `EXTRA_FLAGS` 加一项 + 补三语文案，前端图标行会自动多一个。

手工编辑：`/appendix-edit` 现在四张表齐全（含 `overrides.csv` 的全数据手填），
`field` / `role` 是下拉枚举（越界行标红且**拒绝保存**），保存沿用各文件原有的 BOM / 行尾约定。

## 自动化二（⏳ 未落地；已有本地等价实现）：审阅完成 → 写入订正副表

> 本地等价：`scripts/apply_feedback.py --decisions data/feedback/decisions.json --write`
> （同一套规则与门，只是由人手动触发、不自动开 PR）。下方为 future workflow 的设计意图。

`feedback-apply.yml`，与 digest 同一 cron 串行跑在其后（或同一 workflow 的第二个 job）：

1. 拉 `status=accepted AND applied=false`；
2. 按 `changes` 的 key 落盘（只写副表，永远不碰 `iceberg.json` 主数据与代码）：
   - `link` → `iceberg-vue/src/data/appendix/references.csv`（`source_id,label,url,role`，走 F34 URL 校验）
   - `title/desc/tags` → `overrides.csv`（同目录，渲染层叠加，见下）
   - `category` → `categories.csv`（`role=main` 覆盖主分类）
   - 署名 → `contributors.csv`（`(item_id, by)` upsert，同键保留较晚的 `at`）
3. 跑全套门：`typecheck` + `test` + 字体 `--check` + 副表孤儿校验（`item_id` 必须在 `id-index.json`）；
4. 门全绿 → **开 PR（不直推 master，更不自动合）**，PR 正文贴本次合入清单，@ owner；
5. owner 在网页点 Merge（命令见下）后，同一 workflow 的收尾 step 把对应行标 `applied=true`。
   门变红 → 停 + 在 tracking issue 留言报错原文，等人修。

### merge 命令（网页点之外，命令行二选一）

```bash
# 方式一：gh（推荐，PR 编号在 tracking issue 里）
gh pr merge <number> --merge
git pull origin master

# 方式二：纯 git（无 gh 时）
git fetch origin
git merge --no-ff origin/feedback-apply-YYYYMMDD -m "合入社区订正 YYYY-MM-DD"
git push origin master
```

合入策略一律 `--merge`（保留合入点，回滚时 revert 一个 commit 即可；
副表自动写只碰两个 CSV，回滚半径最小）。

### 副表已有同条目订正时的处理（upsert，不堆历史）

- `overrides.csv` 以 `(item_id, field)` 为键：新采纳的同键覆盖旧值（last-accepted-wins），
  被覆盖的旧值不删记录——DB 行 immutable，`applied` 保留，审计链不断；
- `categories.csv` 以 `(item_id)` 上的 `role=main` 行为键：新采纳的主分类覆盖旧 main 行
  （**不是追加**，否则一个词条会有两个主分类）；`role=extra` 才按 `(item_id,category)` 去重追加；
- `references.csv` 以 `(source_id, url, role)` 为键：同 url 同角色已存在则跳过（log 记一笔 `skip:dup`），
  不同 url / 不同角色才追加（一个词条允许多条参考链接，主链接覆盖与附加参考互不干扰）；
- `contributors.csv` 以 `(item_id, by)` 为键：同一人再贡献只更新 `at`（取较晚），不会堆出重复署名；
- workflow 收尾在 PR 正文附"覆盖 N 处 / 跳过 M 处"，肉眼可对；
- 冲突升级：同一 `(item_id, field)`（或同一词条的两条 `role=main` 分类）在**同一期**被两条以上
  accepted 覆盖 → 不自动合，留在 tracking issue 标 `conflict` 等人挑（机器不替你做选择题）。

渲染层叠加（**2026-10-09 已落地**）：`lib/iceberg/appendix.ts` 统一解析五张表，
`useIcebergDataSource`（v2）与 `IndexView`（v1）按区域分派装配 ——
`overrides.ts` 就地把 title/desc/tags 写回词条对象（`tags` 连带重算 `emojis`）、
`extraCategories.ts` 装配主分类覆盖 + 副分类 + 墙渐变色标、链接与关联只提供 Map、
`contributors.csv` 供词条详情页脚的署名行（`EntryByline`）。实测：给某词条写一行 `role=main`，
词条墙里**只有它**的分类变了（1454 条词条全量比对，差异恰好 1 条）。

副表编辑器（`/appendix-edit`，DEV）：默认**所见即所得**（直接改词条的标题/描述/标签/分类/链接/关联/署名，
按区域落到对应表；被副表覆盖的字段旁给出「原 …」与还原），另有「原始行」模式编辑 role / by / at / 越界。
模型在 `lib/iceberg/useAppendixEditor.ts`，界面在 `components/appendix/`（Sidebar / EntryEditor / RawRows / EntryPicker）。

## 安全阀

- 自动写只碰 `iceberg-vue/src/data/appendix/` 下两个 CSV，回滚 = revert 一个 commit；
  本地路径（`apply_feedback.py`）另存 `.bak`，且默认 dry-run；
- `applied` 标志只由收尾步骤写，人勿手改（手改会导致重复合入）：workflow 落地前用
  `apply_feedback.py --emit-sql` 生成的 `UPDATE … SET status='accepted', applied=true WHERE id IN (…)`，
  在 Supabase SQL Editor 执行；
- F30：写入前 `item_id` 经 alias 归一 + 存在性校验，标题改名不产生孤儿；
- anon 不可提交（既定），`user_id NOT NULL`，RLS `auth.uid() = user_id`。

## 落地顺序

1. ✅ migration（表 + RLS + `item_id` 索引）+ `feedbackData.ts` + colocated 单测；
2. ✅ 弹窗入口 + 折叠展示 + "我的反馈"列表 + i18n；
3. ✅ 审阅与落盘：**本地审核工作台 `/feedback-review` + `scripts/apply_feedback.py`**（2026-10-09）；
   ⏳ 两条 workflow（digest / apply）仍未落地 —— 落地后把工作台与脚本当引擎直接复用；
4. ✅ 渲染层叠加（`overrides.csv` 接线 + 订正角标 + `lib/iceberg/overrides.ts` 的 `applyOverrides`）。
