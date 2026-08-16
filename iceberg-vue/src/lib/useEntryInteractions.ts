import { ref, watch, nextTick, onScopeDispose, type Ref } from 'vue'
import { useStore } from '@nanostores/vue'
import { favorites } from './settingsStore'
import { user } from './userState'
import { isSupabaseReady } from './supabase'
import { toggleInteraction, fetchInteractionCount, fetchMyInteractions, fetchCommentCount } from './supabaseData'
import { reportError } from './report'

/**
 * P2-14（codeq）：词条详情交互共享 composable —— 收敛 EntryDetailCardNext / MobileSheet
 * 原先三处重复的逻辑：toggleFav（逐字相同）、点赞/评论计数加载（F12 序号防串项，同构）、
 * toggleItemLike、copyShareLink（带定时器清理）、评论区展开开关。
 *
 * @param itemId          当前词条 id（响应式；切换时自动重置状态并重载计数）
 * @param commentSectionEl 评论区元素引用（openComments 展开后滚动定位，可空）
 */
export function useEntryInteractions(
  itemId: Ref<string | null | undefined>,
  commentSectionEl: Ref<HTMLElement | null> | null = null,
) {
  const favs = useStore(favorites)
  const u = useStore(user)
  const supabaseReady = isSupabaseReady()

  const copied = ref(false)
  const liked = ref(false)
  const likeCount = ref(0)
  const commentCount = ref(0)
  const updatingLike = ref(false)
  const commentsOpen = ref(false)

  // F12：请求序号 —— 快速切换词条时丢弃过期响应，不串项
  let likeSeq = 0
  watch(itemId, (id) => {
    const seq = ++likeSeq
    liked.value = false
    likeCount.value = 0
    commentCount.value = 0
    copied.value = false
    commentsOpen.value = false
    if (!id || !isSupabaseReady()) return
    Promise.all([
      fetchInteractionCount('item', id, 'like'),
      fetchMyInteractions('item', [id], 'like'),
      fetchCommentCount(id),
    ]).then(([count, likedSet, cCount]) => {
      if (seq !== likeSeq) return
      likeCount.value = count
      liked.value = likedSet.has(id)
      commentCount.value = cCount
    }).catch((e) => reportError('supabase', e, { op: 'like-load' }))
  }, { immediate: true })

  async function toggleItemLike() {
    const id = itemId.value
    if (!id || !isSupabaseReady()) return
    updatingLike.value = true
    try {
      const result = await toggleInteraction('item', id, 'like')
      if (id !== itemId.value) return // F12：词条已切换，丢弃过期响应
      liked.value = result
      likeCount.value += result ? 1 : -1
    } catch (e) {
      if (id !== itemId.value) return
      alert((e as Error).message || '请先登录')
    } finally {
      updatingLike.value = false
    }
  }

  // 收藏：本地 store 优先 + 登录时异步同步 supabase（失败仅上报，不回滚）
  function toggleFav(id: string) {
    if (!id) return
    const cur = favorites.get()
    favorites.set(cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id])
    if (u.value) {
      toggleInteraction('item', id, 'favorite').catch((e) => reportError('supabase', e, { op: 'favorite-sync' }))
    }
  }

  // 复制分享链接（标题点击，反馈切换标题文案；失败静默）
  let copyTimer: number | null = null
  async function copyShareLink(id: string) {
    if (!id) return
    const url = window.location.origin + window.location.pathname + '#' + id
    try {
      await navigator.clipboard.writeText(url)
      copied.value = true
      if (copyTimer) window.clearTimeout(copyTimer)
      copyTimer = window.setTimeout(() => { copied.value = false }, 1500)
    } catch {
      // 剪贴板不可用时静默失败
      copied.value = false
    }
  }

  // 评论区开关：唯一开关（未展开不渲染区域），展开后滚动定位
  function openComments() {
    commentsOpen.value = !commentsOpen.value
    if (commentsOpen.value) {
      nextTick(() => {
        commentSectionEl?.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  // 组件卸载时清理复制反馈定时器
  onScopeDispose(() => {
    if (copyTimer) window.clearTimeout(copyTimer)
  })

  return {
    favs, copied, liked, likeCount, commentCount, updatingLike, commentsOpen, supabaseReady,
    toggleItemLike, toggleFav, copyShareLink, openComments,
  }
}
