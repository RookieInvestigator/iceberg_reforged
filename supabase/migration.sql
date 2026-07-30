-- ==========================================
-- 中文兔子洞冰山图 — 用户系统数据库迁移
-- 在 Supabase SQL Editor 中执行
-- ==========================================

-- 1. 评论表 (comments) — user_id nullable 支持匿名
CREATE TABLE IF NOT EXISTS comments (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL,
  content     TEXT NOT NULL,
  anon_name   TEXT,                  -- 匿名显示名，user_id IS NULL 时使用
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (
  (auth.uid() = user_id) OR (user_id IS NULL AND anon_name IS NOT NULL)
);
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
CREATE POLICY "interactions_select" ON interactions FOR SELECT USING (true);
CREATE POLICY "interactions_insert" ON interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "interactions_delete" ON interactions FOR DELETE USING (auth.uid() = user_id);

-- 3. 用户显示名函数（单个 + 批量）
CREATE OR REPLACE FUNCTION user_display(uid UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    raw_user_meta_data->>'display_name',
    SPLIT_PART(email, '@', 1)
  )
  FROM auth.users WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION batch_user_display(uids UUID[])
RETURNS TABLE(user_id UUID, display_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id, COALESCE(raw_user_meta_data->>'display_name', SPLIT_PART(email, '@', 1))
  FROM auth.users WHERE id = ANY(uids);
$$;
