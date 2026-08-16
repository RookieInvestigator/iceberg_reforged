<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { MessageCircle, Heart } from '@lucide/vue'
import { useStore } from '@nanostores/vue'
import { user } from '../../lib/authStore'
import { fetchComments, postComment, deleteComment, toggleInteraction, fetchInteractionCount } from '../../lib/supabaseData'
import type { CommentRow } from '../../lib/supabaseData'
import { isSupabaseReady } from '../../lib/supabase'
import { useI18n } from '../../lib/useI18n'

// opened 由宿主受控（动作条评论按钮唯一开关）：未展开时宿主不渲染本组件区域
const props = defineProps<{ itemId: string; opened?: boolean }>()
const { t, lang } = useI18n()
const u = useStore(user)

const PAGE_SIZE = 50
const comments = ref<CommentRow[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
// P1-12: 加载失败错误态（首屏加载 / 加载更多各一），失败时展示重试按钮，不再永久卡「加载中…」
const loadError = ref(false)
const loadMoreError = ref(false)
const text = ref('')
const posting = ref(false)
const supabaseReady = isSupabaseReady()

// P1-19: 递增请求序号，过期响应（itemId 已切换）直接丢弃
let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = false
  try {
    const res = await fetchComments(props.itemId, u.value?.id, { offset: 0, limit: PAGE_SIZE })
    if (seq !== loadSeq) return
    comments.value = res.rows
    hasMore.value = res.hasMore
  } catch {
    if (seq !== loadSeq) return
    loadError.value = true
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

// P1-13: 分页「加载更多」（offset 递增，服务端 limit+1 判定 hasMore）
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  const seq = loadSeq
  loadingMore.value = true
  loadMoreError.value = false
  try {
    const res = await fetchComments(props.itemId, u.value?.id, { offset: comments.value.length, limit: PAGE_SIZE })
    if (seq !== loadSeq) return
    // F10：按 comment id 去重合并，防止分页边界/数据变动导致重复
    const seen = new Set(comments.value.map(c => c.id))
    comments.value = [...comments.value, ...res.rows.filter(r => !seen.has(r.id))]
    hasMore.value = res.hasMore
  } catch {
    if (seq !== loadSeq) return
    loadMoreError.value = true
  } finally {
    if (seq === loadSeq) loadingMore.value = false
  }
}

// P1-12: 客户端轻量节流 —— localStorage 记录上次发评时间，10 秒内禁止再发
const POST_COOLDOWN = 10_000
function isThrottled(): boolean {
  const last = Number(localStorage.getItem('iceberg-comment-last-ts') || 0)
  return Date.now() - last < POST_COOLDOWN
}
function markPosted() {
  localStorage.setItem('iceberg-comment-last-ts', String(Date.now()))
}

async function doPost() {
  if (!text.value.trim()) return
  // 取消匿名评论：未登录不提供输入框，此处双重守卫
  if (!u.value) return
  if (isThrottled()) { alert(t('sendTooFast')); return }
  posting.value = true
  try {
    await postComment(props.itemId, text.value.trim())
    markPosted()
    text.value = ''
    await load()
  } catch (e: any) {
    alert(e.message || t('errorGeneric'))
  }
  posting.value = false
}

async function doDelete(id: number) {
  if (!confirm(t('confirmDeleteComment'))) return
  try {
    await deleteComment(id)
    await load()
  } catch (e: any) {
    alert(e.message || t('deleteFailed'))
  }
}

// P1-19: 乐观点赞（先更新 UI）+ 「提交成功后回读修正」+ 防并发双击漂移
const pendingLikes = new Set<number>()
async function toggleCommentLike(c: CommentRow) {
  if (pendingLikes.has(c.id)) return
  pendingLikes.add(c.id)
  const wasLiked = c.user_liked
  c.user_liked = !wasLiked
  c.like_count = (c.like_count || 0) + (c.user_liked ? 1 : -1)
  try {
    const liked = await toggleInteraction('comment', String(c.id), 'like')
    if (c.user_liked !== liked) {
      c.user_liked = liked
      c.like_count = (c.like_count || 0) + (liked ? 1 : -1)
    }
    // 回读服务端权威计数，消除多次点击/并发漂移
    const count = await fetchInteractionCount('comment', String(c.id), 'like')
    c.like_count = count
  } catch (e: any) {
    // 失败回滚到原状态
    c.user_liked = wasLiked
    c.like_count = (c.like_count || 0) + (wasLiked ? 1 : -1)
    alert(e.message || t('errorGeneric'))
  } finally {
    pendingLikes.delete(c.id)
  }
}

function timeAgo(iso: string): string {
  // P1-19: clamp 到 0，未来时间戳（时钟偏差）显示「刚刚」
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return t('timeJustNow')
  if (diff < 3600) return Math.floor(diff / 60) + ' ' + t('minAgo')
  if (diff < 86400) return Math.floor(diff / 3600) + ' ' + t('hourAgo')
  if (diff < 2592000) return Math.floor(diff / 86400) + ' ' + t('dayAgo')
  const locale = lang.value === 'ja' ? 'ja-JP' : lang.value === 'en' ? 'en-US' : 'zh-CN'
  return new Date(iso).toLocaleDateString(locale)
}

// P1-7: iOS 键盘弹出时把评论输入框滚到可视区中央，避免键盘遮挡输入区
const inputEl = ref<HTMLTextAreaElement | null>(null)
function focusInput() {
  inputEl.value?.scrollIntoView({ block: 'center' })
}

onMounted(() => { if (supabaseReady) load() })
watch(() => props.itemId, (id) => { if (supabaseReady) load() })
</script>

<template>
  <div v-if="supabaseReady && opened" class="cmt">
    <!-- 展开状态：宿主（动作条评论按钮）控制 opened -->
    <div class="cmt-hd flex items-center gap-1.5 mb-2.5">
      <MessageCircle class="shrink-0" :size="12" :stroke-width="1.7" aria-hidden="true" />
      <span class="text-tiny font-semibold text-white-40 tracking-[0.06em]">{{ t('commentsTitle') }}</span>
      <span v-if="comments.length" class="text-tiny text-white-45">{{ comments.length }}</span>
      <span class="flex-1" />
    </div>

    <!-- 输入（P1-12: maxlength=2000 与数据库 CHECK 一致；取消匿名评论，未登录仅提示） -->
    <div v-if="u" class="mb-3">
      <textarea v-model="text"
        ref="inputEl"
        :placeholder="t('commentAsLogin').replace('{name}', u.displayName)"
        class="w-full px-2 py-1.5 text-xs leading-[1.5] bg-white-03 border border-white-08 rounded text-white-80 resize-none focus:border-white-18 focus:bg-white-05 max-sm:text-base"
        rows="2" :disabled="posting" maxlength="2000" @focus="focusInput" />
      <div class="flex items-center justify-between mt-1">
        <span class="text-tiny text-white-55">{{ u.displayName }}</span>
        <button @click="doPost" :disabled="posting || !text.trim()"
          class="text-xs px-2.5 py-0.5 rounded-[3px] bg-white-06 border border-white-10 text-white-60 cursor-pointer enabled:hover:bg-white-12 enabled:hover:text-white-90 disabled:opacity-30 disabled:cursor-default max-sm:min-h-10 max-sm:px-4 max-sm:py-2">
          {{ posting ? t('posting') : t('sendPost') }}
        </button>
      </div>
    </div>
    <p v-else class="text-xs text-white-45 py-2 italic">{{ t('commentLoginHint') }}</p>

    <!-- 列表 -->
    <div v-if="loadError" class="cmt-error flex items-center justify-between gap-2 text-xs text-white-50 py-2">
      <span>{{ t('commentsLoadFailed') }}</span>
      <button @click="load" class="cmt-retry text-tiny px-2.5 py-0.5 rounded-[3px] bg-white-06 border border-white-10 text-white-60 cursor-pointer hover:bg-white-12 hover:text-white-90 max-sm:min-h-10 max-sm:px-2.5 max-sm:py-2">{{ t('retry') }}</button>
    </div>
    <div v-else-if="loading" class="cmt-loading text-xs text-white-45 py-2">{{ t('loadingComments') }}</div>
    <div v-else-if="comments.length === 0" class="cmt-empty text-xs text-white-45 py-2">{{ t('noCommentsYet') }}</div>
    <div v-else class="cmt-list flex flex-col gap-1">
      <div v-for="c in comments" :key="c.id" class="cmt-item py-2 border-b border-white-03 last:border-none">
        <div class="flex items-baseline gap-1.5 mb-1">
          <span class="text-xs font-semibold text-white-45">{{ c.author_name }}</span>
          <span class="text-micro text-white-45">{{ timeAgo(c.created_at) }}</span>
          <button v-if="u && u.id === c.user_id" @click="doDelete(c.id)"
            class="text-sm px-1 bg-transparent border-none text-white-50 cursor-pointer ml-auto leading-none hover:text-danger max-sm:min-w-10 max-sm:min-h-10 max-sm:px-2.5" :title="t('delete')">×</button>
        </div>
        <p class="text-xs text-white-65 leading-[1.6] whitespace-pre-wrap m-0 antialiased">{{ c.content }}</p>
        <button @click="toggleCommentLike(c)"
          class="inline-flex items-center gap-1 text-micro px-1 py-0.5 mt-1 bg-transparent border-none cursor-pointer leading-none"
          :class="c.user_liked ? 'text-danger' : 'text-white-55 hover:text-white-45'" :title="t('like')">
          <Heart :size="12" :stroke-width="2" :fill="c.user_liked ? 'currentColor' : 'none'" />
          <span v-if="c.like_count">{{ c.like_count }}</span>
        </button>
      </div>
      <!-- P1-13: 加载更多（失败时原地变错误态，可直接重试） -->
      <button v-if="hasMore && !loadMoreError" @click="loadMore" :disabled="loadingMore"
        class="cmt-loadmore block w-full mt-1.5 py-1 text-tiny text-center text-white-60 bg-transparent border border-white-06 rounded-[3px] cursor-pointer enabled:hover:border-white-15 disabled:opacity-40 disabled:cursor-default max-sm:min-h-10 max-sm:py-2">
        {{ loadingMore ? t('loadingComments') : t('loadMore') }}
      </button>
      <button v-else-if="loadMoreError" @click="loadMore"
        class="cmt-loadmore cmt-loadmore--error block w-full mt-1.5 py-1 text-tiny text-center text-white-55 bg-transparent border border-white-16 rounded-[3px] cursor-pointer max-sm:min-h-10 max-sm:py-2">
        {{ t('commentsLoadFailed') }} · {{ t('retry') }}
      </button>
    </div>
  </div>
</template>
