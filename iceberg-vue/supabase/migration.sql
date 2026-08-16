-- ==========================================
-- 中文兔子洞冰山图 — 用户系统数据库迁移
-- 在 Supabase SQL Editor 中执行
--
-- ⚠️ 本文件后续改动（P0-6 / P1-12 / P1-14）需在 Supabase 重新执行一次。
--    涉及：batch_user_display 函数、comments_content_len 约束、
--    触发器 trg_comments_delete_likes。重复执行安全（IF NOT EXISTS / OR REPLACE）。
-- ==========================================

-- 1. 评论表 (comments) — 仅登录用户可发表（F25：取消匿名评论，服务端强制）
--    anon_name 列保留仅供历史匿名评论展示，新插入必须有 user_id。
CREATE TABLE IF NOT EXISTS comments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  anon_name   TEXT,                  -- 历史匿名显示名（仅存量数据），新插入不再使用
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- P1-12: 内容长度约束（1-2000），防超长内容刷屏
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_len') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_content_len CHECK (char_length(content) BETWEEN 1 AND 2000);
  END IF;
END $$;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_select" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
-- F25：禁止匿名评论 —— 新插入必须 auth.uid() = user_id（anon key 直连 API 也无法绕过）。
-- 存量匿名行（user_id IS NULL）不受影响，仅停止新匿名写入。
DROP POLICY IF EXISTS "comments_insert" ON comments;
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (
  auth.uid() = user_id
);
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (
  auth.uid() = user_id
);

-- 2. 互动表 (interactions) — 点赞 + 收藏
CREATE TABLE IF NOT EXISTS interactions (
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type  TEXT NOT NULL CHECK (target_type IN ('item', 'comment')),
  target_id    TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('like', 'favorite')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id, type)
);

CREATE INDEX IF NOT EXISTS idx_interactions_target ON interactions(target_type, target_id, type);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
-- P0-审计（2026-08-16）：公开读收紧为仅本人 —— 原 USING (true) 允许任何人枚举全站
-- 点赞/收藏明细（user_id + target）。计数场景改走下方 interaction_counts RPC。
DROP POLICY IF EXISTS "interactions_select" ON interactions;
CREATE POLICY "interactions_select" ON interactions FOR SELECT USING (
  auth.uid() = user_id
);
-- 互动计数 RPC：SECURITY DEFINER + search_path 固定，匿名/登录调用方只拿分组聚合数，
-- 不接触任何 user_id 明细。target_id 为 TEXT（同时存字符串 item id 与数字 comment id）。
CREATE OR REPLACE FUNCTION interaction_counts(p_type TEXT, p_ids TEXT[])
RETURNS TABLE(target_id TEXT, cnt BIGINT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_id, count(*)::bigint
  FROM public.interactions
  WHERE type = p_type AND target_id = ANY(p_ids)
  GROUP BY target_id;
$$;
GRANT EXECUTE ON FUNCTION interaction_counts(TEXT, TEXT[]) TO anon, authenticated;
DROP POLICY IF EXISTS "interactions_insert" ON interactions;
CREATE POLICY "interactions_insert" ON interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "interactions_delete" ON interactions;
CREATE POLICY "interactions_delete" ON interactions FOR DELETE USING (auth.uid() = user_id);

-- P1-14: 删除评论时级联清理其点赞行（interactions.target_id 为 TEXT，无法建 FK，用触发器兜底）
-- 注意：触发器以表属主身份执行，可绕过 RLS —— 应用层删除他人点赞行受 RLS 限制，必须靠这里清理。
CREATE OR REPLACE FUNCTION cleanup_comment_likes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM interactions
  WHERE target_type = 'comment' AND target_id = OLD.id::text AND type = 'like';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_delete_likes ON comments;
CREATE TRIGGER trg_comments_delete_likes
AFTER DELETE ON comments
FOR EACH ROW EXECUTE FUNCTION cleanup_comment_likes();

-- 3. 用户显示名函数（单个 + 批量）
-- P0-审计（2026-08-16）：单行版与批量版对齐 —— 只返回有 display_name 的行（防邮箱前缀枚举）、
-- SET search_path = ''（防注入），并收回 anon/authenticated 执行权（前端仅用 batch_user_display）。
CREATE OR REPLACE FUNCTION user_display(uid UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT raw_user_meta_data->>'display_name'
  FROM auth.users
  WHERE id = uid AND raw_user_meta_data->>'display_name' IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION user_display(UUID) FROM anon, authenticated;

-- P0-6（需在 Supabase 重新执行）：
--   - 只返回设置了 display_name 的用户，未设昵称的用户不返回该行 →
--     避免匿名调用方通过 SPLIT_PART(email, '@', 1) 枚举邮箱前缀（SECURITY DEFINER + 无行过滤）。
--   - SET search_path = '' 防止 search_path 注入。
CREATE OR REPLACE FUNCTION batch_user_display(uids UUID[])
RETURNS TABLE(user_id UUID, display_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = ''  -- 必须作为函数选项，不能放在函数体内
AS $$
  SELECT id, raw_user_meta_data->>'display_name'
  FROM auth.users
  WHERE id = ANY(uids) AND raw_user_meta_data->>'display_name' IS NOT NULL;
$$;
