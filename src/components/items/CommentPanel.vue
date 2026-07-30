<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useStore } from '@nanostores/vue'
import { user } from '../../lib/authStore'
import { fetchComments, postComment, deleteComment, toggleInteraction } from '../../lib/supabaseData'
import type { CommentRow } from '../../lib/supabaseData'
import { isSupabaseReady } from '../../lib/supabase'

const props = defineProps<{ itemId: string }>()
const u = useStore(user)

const ANON_KEY = 'iceberg-anon-name'
function getAnonName(): string {
  let name = localStorage.getItem(ANON_KEY)
  if (!name) { name = '匿名用户'; localStorage.setItem(ANON_KEY, name) }
  return name
}

const comments = ref<CommentRow[]>([])
const loading = ref(false)
const opened = ref(false)
const text = ref('')
const posting = ref(false)
const supabaseReady = isSupabaseReady()

const latest = computed(() => comments.value[0] || null)

async function load() {
  loading.value = true
  comments.value = await fetchComments(props.itemId, u.value?.id)
  loading.value = false
}

async function doPost() {
  if (!text.value.trim()) return
  posting.value = true
  try {
    await postComment(props.itemId, text.value.trim(), u.value ? undefined : getAnonName())
    text.value = ''
    await load()
  } catch (e: any) {
    alert(e.message || '发送失败')
  }
  posting.value = false
}

async function doDelete(id: number) {
  if (!confirm('删除这条评论？')) return
  await deleteComment(id)
  await load()
}

async function toggleCommentLike(c: CommentRow) {
  try {
    const liked = await toggleInteraction('comment', String(c.id), 'like')
    c.user_liked = liked
    c.like_count! += liked ? 1 : -1
  } catch (e: any) {
    alert(e.message || '请先登录')
  }
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前'
  return new Date(iso).toLocaleDateString('zh-CN')
}

onMounted(() => { if (supabaseReady) load() })
watch(() => props.itemId, (id) => { opened.value = false; if (supabaseReady) load() })
</script>

<template>
  <div v-if="supabaseReady" class="cmt">
    <!-- === 折叠状态 (极致紧凑的单行) === -->
    <button v-if="!opened" @click="opened = true" class="cmt-collapsed">
      <span class="cmt-collapsed-label">💬 评论</span>
      <span v-if="comments.length" class="cmt-collapsed-n">{{ comments.length }}</span>
      <span v-if="latest" class="cmt-collapsed-divider">·</span>
      <span v-if="latest" class="cmt-collapsed-text">{{ latest.content }}</span>
      <span v-else-if="comments.length === 0 && !loading" class="cmt-collapsed-none">暂无评论</span>
    </button>

    <!-- === 展开状态 === -->
    <template v-else>
      <div class="cmt-hd">
        <span class="cmt-hd-title">💬 评论</span>
        <span v-if="comments.length" class="cmt-hd-n">{{ comments.length }}</span>
        <span class="cmt-hd-gap" />
        <button @click="opened = false" class="cmt-fold">收起 ▲</button>
      </div>

      <!-- 输入 -->
      <div class="cmt-input-wrap">
        <textarea v-model="text"
          :placeholder="u ? `以 ${u.displayName} 的身份发表…` : '以匿名身份发表…'"
          class="cmt-input" rows="2" :disabled="posting" />
        <div class="cmt-input-ft">
          <span class="cmt-author">{{ u ? u.displayName : '匿名用户' }}</span>
          <button @click="doPost" :disabled="posting || !text.trim()" class="cmt-btn">
            {{ posting ? '发送中…' : '发送' }}
          </button>
        </div>
      </div>

      <!-- 列表 -->
      <div v-if="loading" class="cmt-loading">加载中…</div>
      <div v-else-if="comments.length === 0" class="cmt-empty">还没有人评论</div>
      <div v-else class="cmt-list">
        <div v-for="c in comments" :key="c.id" class="cmt-item">
          <div class="cmt-item-hd">
            <span class="cmt-item-author">{{ c.author_name }}</span>
            <span class="cmt-item-time">{{ timeAgo(c.created_at) }}</span>
            <button v-if="u && u.id === c.user_id" @click="doDelete(c.id)" class="cmt-item-del" title="删除">×</button>
          </div>
          <p class="cmt-item-body antialiased">{{ c.content }}</p>
          <button @click="toggleCommentLike(c)" class="cmt-like" :class="{ on: c.user_liked }">
            ♥ {{ c.like_count || '' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 容器：大幅缩减留白，从 1.5rem/1rem 减小到 1rem/0.5rem */
.cmt { margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.5rem; }

/* === 折叠条 (极限单行) === */
.cmt-collapsed {
  display: flex; align-items: center; width: 100%; min-width: 0;
  padding: 0.15rem 0; /* 压缩内边距 */
  background: none; border: none; cursor: pointer;
  font: inherit; text-align: left; opacity: 0.75; transition: opacity 0.2s;
  line-height: 1; /* 强制单行行高 */
}
.cmt-collapsed:hover { opacity: 1; }

.cmt-collapsed-label { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.35); flex-shrink: 0; }
.cmt-collapsed-n { font-size: 0.65rem; color: rgba(255,255,255,0.3); margin-left: 0.25rem; flex-shrink: 0; }
.cmt-collapsed-divider { margin: 0 0.35rem; color: rgba(255,255,255,0.15); font-size: 0.7rem; flex-shrink: 0; }
.cmt-collapsed-text {
  font-size: 0.7rem; color: rgba(255,255,255,0.35); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
}
.cmt-collapsed-none {
  margin-left: 0.35rem; font-size: 0.65rem; color: rgba(255,255,255,0.15); font-style: italic;
}

/* === 展开头部 === */
.cmt-hd { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem; }
.cmt-hd-title { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.cmt-hd-n { font-size: 0.65rem; color: rgba(255,255,255,0.15); }
.cmt-hd-gap { flex: 1; }
.cmt-fold { font-size: 0.6rem; color: rgba(255,255,255,0.25); background: none; border: none; cursor: pointer; }
.cmt-fold:hover { color: rgba(255,255,255,0.6); }

/* === 输入框区 === */
.cmt-input-wrap { margin-bottom: 0.8rem; }
.cmt-input {
  width: 100%; padding: 0.4rem 0.5rem; font-size: 0.75rem; line-height: 1.5;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;
  color: rgba(255,255,255,0.8); outline: none; resize: none;
}
.cmt-input:focus { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.05); }
.cmt-input-ft { display: flex; align-items: center; justify-content: space-between; margin-top: 0.3rem; }
.cmt-author { font-size: 0.65rem; color: rgba(255,255,255,0.25); }
.cmt-btn {
  font-size: 0.7rem; padding: 0.15rem 0.6rem; border-radius: 3px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); cursor: pointer;
}
.cmt-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); }
.cmt-btn:disabled { opacity: 0.3; cursor: default; }

.cmt-loading, .cmt-empty { font-size: 0.7rem; color: rgba(255,255,255,0.2); padding: 0.5rem 0; font-style: italic; }

/* === 评论列表 === */
.cmt-list { display: flex; flex-direction: column; gap: 0.2rem; }
.cmt-item { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.03); }
.cmt-item:last-child { border-bottom: none; }
.cmt-item-hd { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.2rem; }
.cmt-item-author { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.45); }
.cmt-item-time { font-size: 0.55rem; color: rgba(255,255,255,0.15); }
.cmt-item-del { font-size: 0.8rem; padding: 0 0.2rem; background: none; border: none; color: rgba(255,255,255,0.15); cursor: pointer; margin-left: auto; line-height: 1; }
.cmt-item-del:hover { color: #f87171; }
.cmt-item-body { font-size: 0.78rem; color: rgba(255,255,255,0.65); line-height: 1.6; white-space: pre-wrap; margin: 0; }
.cmt-like {
  font-size: 0.65rem; padding: 0.1rem 0; margin-top: 0.3rem; display: inline-block;
  background: none; border: none; color: rgba(255,255,255,0.15); cursor: pointer; line-height: 1;
}
.cmt-like:hover { color: rgba(255,255,255,0.4); }
.cmt-like.on { color: #f87171; }
</style>