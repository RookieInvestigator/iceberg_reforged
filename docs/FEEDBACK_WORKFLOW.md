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

## 自动化一：每 N 天推送待审（默认 7 天）

` .github/workflows/feedback-digest.yml`，cron 定时 + `workflow_dispatch` 手动加跑：

1. 读 `status=open` 全量，按 `item_id` 分组；
2. 生成（或更新）一个 tracking issue：标题 `反馈待审 · YYYY-MM-DD`，
   正文逐条列 `item_id / changes（改了哪几个字段）/ note 前 200 字 / created_at` + 直达 Supabase 行链接；
3. 上一期 issue 若还有 open 行，继续追加到同一 issue（不另开，保持"每周只看一个 issue"）；
4. 写 `data/reports/feedback-digest-YYYYMMDD.log`（本期几条、新增几条）——`data/` 不入库，
   log 仅供本次 run 留底，长期审计看 issue 时间线。

N 改一行 cron 即可（`0 2 * */7 *`）；量起来改 3 天。

## 人工审阅（唯一手工环节）

每周看 tracking issue，逐条在 **Supabase 后台改 status**：

- 采纳 → `accepted`
- 驳回 → `rejected`（备注理由，用户在"我的反馈"可见结果）
- 拿不准 → 不动，留到下期（issue 会继续携带）

不写文件、不跑命令、不碰仓库。

## 自动化二：审阅完成 → 写入订正副表

`feedback-apply.yml`，与 digest 同一 cron 串行跑在其后（或同一 workflow 的第二个 job）：

1. 拉 `status=accepted AND applied=false`；
2. 按 `changes` 的 key 落盘（只写副表，永远不碰 `iceberg.json` 主数据与代码）：
   - `link` → `iceberg-vue/src/data/appendix/references.csv`（`source_id,label,url`，走 F34 URL 校验）
   - `title/desc/category/tags` → `overrides.csv`（同目录，渲染层叠加，见下）
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
- `references.csv` 以 `(source_id, url)` 为键：同 url 已存在则跳过（log 记一笔 `skip:dup`），
  不同 url 才追加（一个词条允许多条参考链接）；
- workflow 收尾在 PR 正文附"覆盖 N 处 / 跳过 M 处"，肉眼可对；
- 冲突升级：同一 `(item_id, field)` 在**同一期**被两条以上 accepted 覆盖 → 不自动合，
  留在 tracking issue 标 `conflict` 等人挑（机器不替你做选择题）。

渲染层（前端另行排期，不在本阶段）：`overrides.csv` 由 `useIcebergDataSource` 加载，
`desc` 等字段被覆盖时词条卡加"社区订正"角标；`references.csv` 链路已存在，零新增。

## 安全阀

- 自动写只碰 `iceberg-vue/src/data/appendix/` 下两个 CSV，回滚 = revert 一个 commit；
- `applied` 标志只能由 workflow 收尾 step 写，人勿手改（手改会导致重复合入）；
- F30：写入前 `item_id` 经 alias 归一 + 存在性校验，标题改名不产生孤儿；
- anon 不可提交（既定），`user_id NOT NULL`，RLS `auth.uid() = user_id`。

## 落地顺序

1. migration（表 + RLS + `item_id` 索引）+ `feedbackData.ts` + colocated 单测；
2. 弹窗入口 + 折叠展示 + "我的反馈"列表 + i18n；
3. 两个 workflow（digest 先行，apply 随后）+ 本文档同步；
4. 渲染层叠加（`overrides.csv` 接线 + 订正角标）。
