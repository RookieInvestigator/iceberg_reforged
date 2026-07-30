<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '@nanostores/vue'
import { user as userAtom, signUp, signInWithPassword, signInWithOtp, updateNickname, signOut, syncFavoritesWithCloud } from '../../lib/authStore'
import { fetchUserStats } from '../../lib/supabaseData'
import { isSupabaseReady } from '../../lib/supabase'
import type { UserStats } from '../../lib/supabaseData'
import raw from '../../data/iceberg.json'
import BaseModal from './BaseModal.vue'
import GeoAvatar from './GeoAvatar.vue'

const emit = defineEmits(['close'])
const u = useStore(userAtom)
const tab = ref<'login' | 'register'>('login')

const nick = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const otpSent = ref(false)
const editingNick = ref(false)
const editNickVal = ref('')

function reset() {
  errorMsg.value = ''
  otpSent.value = false
}

async function doRegister() {
  reset()
  if (!nick.value.trim() || !email.value.trim() || !password.value) return
  if (password.value.length < 8) {
    errorMsg.value = '密码至少 8 位'
    return
  }
  loading.value = true
  const { error } = await signUp(nick.value.trim(), email.value.trim(), password.value)
  loading.value = false
  if (error) errorMsg.value = error
}

async function doLogin() {
  reset()
  if (!email.value.trim() || !password.value) return
  loading.value = true
  const { error } = await signInWithPassword(email.value.trim(), password.value)
  loading.value = false
  if (error) errorMsg.value = error
}

async function doMagicLink() {
  reset()
  if (!email.value.trim()) return
  loading.value = true
  const { error } = await signInWithOtp(email.value.trim())
  loading.value = false
  if (error) {
    errorMsg.value = error
  } else {
    otpSent.value = true
  }
}

async function saveNick() {
  if (!editNickVal.value.trim()) return
  loading.value = true
  const { error } = await updateNickname(editNickVal.value.trim())
  loading.value = false
  if (error) {
    errorMsg.value = error
  } else {
    editingNick.value = false
  }
}

// ===== 统计 =====
const stats = ref<UserStats | null>(null)
const viewedCount = ref(0)
if (isSupabaseReady()) {
  fetchUserStats().then(s => stats.value = s).catch(() => {})
}

try {
  viewedCount.value = JSON.parse(localStorage.getItem('iceberg-read-items') || '[]').length
} catch {}

const icebergItems = (raw as any).tiers as Record<string, any[]>
const itemMap = new Map<string, any>()
for (const items of Object.values(icebergItems)) {
  for (const it of items) itemMap.set(it.id, it)
}

async function doSync() {
  await syncFavoritesWithCloud()
  stats.value = await fetchUserStats()
  try {
    viewedCount.value = JSON.parse(localStorage.getItem('iceberg-read-items') || '[]').length
  } catch {}
}

function favCategory(): string | null {
  if (!stats.value) return null
  const cats: Record<string, number> = {}
  for (const id of stats.value.favoriteIds) {
    const it = itemMap.get(id)
    if (it) {
      const c = it.category
      cats[c] = (cats[c] || 0) + 1
    }
  }
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] || null
}

function heatLabel() {
  const t = viewedCount.value
  if (t >= 200) return '深度调查员'
  if (t >= 50) return '活跃探索者'
  if (t >= 10) return '好奇路人'
  return '初来乍到'
}

const cat = () => favCategory()
const hl = () => heatLabel()
</script>

<template>
  <BaseModal :title="u ? '账号' : '登录 / 注册'" size="sm" @close="emit('close')">
    
    <!-- === 已登录 === -->
    <template v-if="u">
      <div class="um-top">
        <GeoAvatar class="um-av" :seed="u.avatarSeed" :hue="Number.isFinite(Number(u.avatarColor)) ? Number(u.avatarColor) : 210" />
        <div class="um-info">
          <div v-if="!editingNick" class="um-name">{{ u.displayName }}</div>
          <div v-else class="um-edit-row">
            <input v-model="editNickVal" @keyup.enter="saveNick" class="um-inp um-inp-sm" placeholder="新昵称" style="width:130px" />
            <button @click="saveNick" :disabled="loading" class="um-btn-sm">保存</button>
          </div>
          <div class="um-email">{{ u.email }}</div>
        </div>
        <span class="um-badge">{{ hl() }}</span>
      </div>

      <div class="um-acts">
        <button v-if="!editingNick" @click="editNickVal = u.displayName; editingNick = true" class="um-link">修改昵称</button>
        <button @click="doSync()" class="um-link">同步收藏</button>
        <button @click="signOut()" class="um-link">退出登录</button>
      </div>

      <div v-if="stats" class="um-stats">
        <div class="um-stat">
          <span class="um-n">{{ stats.favorites }}</span>
          <span class="um-sl">收藏</span>
        </div>
        <div class="um-stat">
          <span class="um-n">{{ stats.likes }}</span>
          <span class="um-sl">点赞</span>
        </div>
        <div class="um-stat">
          <span class="um-n">{{ stats.comments }}</span>
          <span class="um-sl">评论</span>
        </div>
        <div class="um-stat">
          <span class="um-n">{{ viewedCount }}</span>
          <span class="um-sl">浏览</span>
        </div>
      </div>
      
      <div v-if="cat()" class="um-foot">
        最爱分类 <span class="um-cat">{{ cat() }}</span>
      </div>
    </template>

    <!-- === 未登录 === -->
    <template v-else>
      <div class="um-tabs">
        <button @click="tab = 'login'; reset()" :class="['um-tab', { on: tab === 'login' }]">登录</button>
        <button @click="tab = 'register'; reset()" :class="['um-tab', { on: tab === 'register' }]">注册</button>
      </div>

      <template v-if="otpSent">
        <div class="um-notice">
          <p class="um-ok">邮件已发送到 <strong>{{ email }}</strong></p>
          <p class="um-ok-sub">请检查您的邮箱收件箱或垃圾邮件。</p>
        </div>
        <button @click="otpSent = false" class="um-link">← 返回重试</button>
      </template>
      
      <template v-else>
        <div v-if="tab === 'register'" class="um-field">
          <label class="um-lbl">昵称</label>
          <input v-model="nick" type="text" class="um-inp" placeholder="您的称呼" autocomplete="username" />
        </div>
        <div class="um-field">
          <label class="um-lbl">邮箱</label>
          <input v-model="email" type="email" class="um-inp" placeholder="example@email.com" autocomplete="email" />
        </div>
        <div class="um-field">
          <label class="um-lbl">密码</label>
          <input 
            v-model="password" 
            type="password" 
            class="um-inp" 
            placeholder="至少 8 位密码"
            :autocomplete="tab === 'register' ? 'new-password' : 'current-password'"
            @keyup.enter="tab === 'register' ? doRegister() : doLogin()" 
          />
        </div>

        <button v-if="tab === 'login'" @click="doLogin" :disabled="loading" class="um-btn">
          {{ loading ? '登录中…' : '登录' }}
        </button>
        <button v-else @click="doRegister" :disabled="loading" class="um-btn">
          {{ loading ? '注册中…' : '注册' }}
        </button>

        <button v-if="tab === 'login'" @click="doMagicLink" :disabled="loading" class="um-link um-ml">
          免密登录（发送链接到邮箱）
        </button>

        <p v-if="errorMsg" class="um-err">{{ errorMsg }}</p>
      </template>
    </template>
  </BaseModal>
</template>

<style scoped>
/* 顶部信息区 */
.um-top { display: flex; align-items: center; gap: 0.8rem; }
.um-av {
  width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.um-info { display: flex; flex-direction: column; justify-content: center; }
.um-name { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.9); line-height: 1.2; }
.um-email { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 0.2rem; }
.um-badge { 
  margin-left: auto; font-size: 0.65rem; padding: 0.2rem 0.5rem; 
  border-radius: 4px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); 
}

/* 操作链接区 */
.um-acts { display: flex; gap: 1rem; margin-top: 1rem; margin-bottom: 0.5rem; }
.um-link { 
  font-size: 0.75rem; color: rgba(255,255,255,0.3); background: none; border: none; 
  cursor: pointer; padding: 0; transition: color 0.2s ease; 
}
.um-link:hover { color: rgba(255,255,255,0.7); }
.um-edit-row { display: flex; gap: 0.4rem; align-items: center; }

/* 统计数据区 */
.um-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;
  margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08);
}
.um-stat { text-align: center; }
.um-n { font-size: 1.15rem; font-weight: 700; color: rgba(255,255,255,0.7); display: block; line-height: 1.2; }
.um-sl { font-size: 0.6rem; color: rgba(255,255,255,0.25); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.2rem; display: block;}
.um-foot { margin-top: 1rem; font-size: 0.75rem; color: rgba(255,255,255,0.3); text-align: center; }
.um-cat { color: rgba(255,255,255,0.6); font-weight: 500; }

/* 登录/注册 Tabs */
.um-tabs { display: flex; margin-bottom: 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
.um-tab {
  flex: 1; padding: 0.6rem; font-size: 0.85rem; text-align: center; font-weight: 500;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: rgba(255,255,255,0.3); cursor: pointer; margin-bottom: -1px;
  transition: all 0.2s ease;
}
.um-tab:hover { color: rgba(255,255,255,0.5); }
.um-tab.on { color: rgba(255,255,255,0.85); border-bottom-color: rgba(255,255,255,0.5); }

/* 表单输入区 */
.um-field { margin-bottom: 1rem; }
.um-lbl { 
  display: block; font-size: 0.7rem; color: rgba(255,255,255,0.4); 
  margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; 
}
.um-inp {
  width: 100%; box-sizing: border-box; padding: 0.55rem 0.65rem; font-size: 0.85rem; border-radius: 6px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.85); outline: none; transition: all 0.2s ease;
}
.um-inp::placeholder { color: rgba(255,255,255,0.15); }
.um-inp:focus { border-color: rgba(255,255,255,0.3); background: rgba(255,255,255,0.08); }
.um-inp-sm { width: auto; font-size: 0.8rem; padding: 0.35rem 0.5rem; }

/* 按钮区 */
.um-btn {
  width: 100%; padding: 0.65rem; font-size: 0.85rem; font-weight: 600; border-radius: 6px;
  background: rgba(255,255,255,0.12); border: none; color: rgba(255,255,255,0.85); 
  cursor: pointer; transition: all 0.2s ease; margin-top: 0.5rem;
}
.um-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
.um-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.um-btn-sm {
  font-size: 0.75rem; padding: 0.3rem 0.6rem; border-radius: 4px;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); 
  color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.2s ease;
}
.um-btn-sm:hover:not(:disabled) { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); }

/* 提示与状态信息 */
.um-ml { display: block; text-align: center; margin-top: 1rem; width: 100%; }
.um-notice { margin-bottom: 1.5rem; padding: 1rem; background: rgba(74, 222, 128, 0.05); border-radius: 6px; border: 1px solid rgba(74, 222, 128, 0.1); }
.um-ok { font-size: 0.85rem; color: #4ade80; margin: 0; line-height: 1.4; }
.um-ok-sub { font-size: 0.7rem; color: rgba(74, 222, 128, 0.6); margin: 0.3rem 0 0 0; }
.um-err { font-size: 0.75rem; color: #f87171; margin-top: 0.8rem; text-align: center; }
</style>