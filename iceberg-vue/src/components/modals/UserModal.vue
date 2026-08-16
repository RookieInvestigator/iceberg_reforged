<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStore } from '@nanostores/vue'
import { user as userAtom, signUp, signInWithPassword, signInWithOtp, updateNickname, signOut, syncFavoritesWithCloud } from '../../lib/authStore'
import { fetchUserStats } from '../../lib/supabaseData'
import { isSupabaseReady } from '../../lib/supabase'
import { useI18n } from '../../lib/useI18n'
import type { UserStats } from '../../lib/supabaseData'
import raw from '../../data/iceberg.json'
import BaseModal from './BaseModal.vue'
import GeoAvatar from './GeoAvatar.vue'

const emit = defineEmits(['close'])
const { t } = useI18n()
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

// P0-4: 各 handler 加 try/catch + finally 复位 loading，避免未配置 Supabase 或网络异常时
// loading 永久卡 true、产生 unhandled rejection
async function doRegister() {
  reset()
  if (!nick.value.trim() || !email.value.trim() || !password.value) return
  if (password.value.length < 8) {
    errorMsg.value = t('passwordTooShort')
    return
  }
  loading.value = true
  try {
    const { error } = await signUp(nick.value.trim(), email.value.trim(), password.value)
    if (error) errorMsg.value = error
  } catch (e: any) {
    errorMsg.value = e?.message || t('errorGeneric')
  } finally {
    loading.value = false
  }
}

async function doLogin() {
  reset()
  if (!email.value.trim() || !password.value) return
  loading.value = true
  try {
    const { error } = await signInWithPassword(email.value.trim(), password.value)
    if (error) errorMsg.value = error
  } catch (e: any) {
    errorMsg.value = e?.message || t('errorGeneric')
  } finally {
    loading.value = false
  }
}

async function doMagicLink() {
  reset()
  if (!email.value.trim()) return
  loading.value = true
  try {
    const { error } = await signInWithOtp(email.value.trim())
    if (error) {
      errorMsg.value = error
    } else {
      otpSent.value = true
    }
  } catch (e: any) {
    errorMsg.value = e?.message || t('errorGeneric')
  } finally {
    loading.value = false
  }
}

async function saveNick() {
  if (!editNickVal.value.trim()) return
  loading.value = true
  try {
    const { error } = await updateNickname(editNickVal.value.trim())
    if (error) {
      errorMsg.value = error
    } else {
      editingNick.value = false
    }
  } catch (e: any) {
    errorMsg.value = e?.message || t('errorGeneric')
  } finally {
    loading.value = false
  }
}

// ===== 统计 =====
const stats = ref<UserStats | null>(null)
const statsError = ref(false)
const viewedCount = ref(0)

// P1-17: 监听 user atom，登录状态变化（含弹窗内登录）时重新拉取统计
// P1-18: 拉取失败展示错误提示 + 重试入口，不再静默吞错
async function refreshStats() {
  if (!isSupabaseReady()) return
  statsError.value = false
  try {
    const s = await fetchUserStats()
    if (s) stats.value = s
  } catch {
    statsError.value = true
  }
}

watch(u, (val) => {
  if (val) {
    refreshStats()
  } else {
    stats.value = null
    statsError.value = false
  }
}, { immediate: true })

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
  await refreshStats()
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
  const v = viewedCount.value
  if (v >= 200) return t('heatExpert')
  if (v >= 50) return t('heatActive')
  if (v >= 10) return t('heatCurious')
  return t('heatNewbie')
}

const cat = () => favCategory()
const hl = () => heatLabel()
</script>

<template>
  <BaseModal :title="u ? t('account') : t('loginRegister')" size="sm" @close="emit('close')">

    <!-- === 已登录 === -->
    <template v-if="u">
      <div class="flex items-center gap-3">
        <GeoAvatar class="w-11 h-11 rounded-full shrink-0 overflow-hidden flex items-center justify-center" :seed="u.avatarSeed" :hue="Number.isFinite(Number(u.avatarColor)) ? Number(u.avatarColor) : 210" />
        <div class="flex flex-col justify-center">
          <div v-if="!editingNick" class="text-base font-bold text-white-90 leading-[1.2]">{{ u.displayName }}</div>
          <div v-else class="flex gap-1.5 items-center">
            <input v-model="editNickVal" @keyup.enter="saveNick" class="w-auto px-2 py-1.5 text-sm bg-white-06 border border-white-10 rounded-md text-white-85 transition-colors duration-200 placeholder:text-white-15 focus:border-white-30 focus:bg-white-08 max-sm:text-base" :placeholder="t('newNickname')" style="width:130px" />
            <button @click="saveNick" :disabled="loading" class="text-xs px-2.5 py-1 rounded bg-white-10 border border-white-15 text-white-60 cursor-pointer transition-colors duration-200 enabled:hover:bg-white-18 enabled:hover:text-white-90">{{ t('save') }}</button>
          </div>
          <div class="text-xs text-white-40 mt-1">{{ u.email }}</div>
        </div>
        <span class="ml-auto text-tiny px-2 py-0.5 rounded bg-white-06 text-white-50">{{ hl() }}</span>
      </div>

      <div class="flex gap-4 mt-4 mb-2">
        <button v-if="!editingNick" @click="editNickVal = u.displayName; editingNick = true" class="text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">{{ t('editNickname') }}</button>
        <button @click="doSync()" class="text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">{{ t('syncFavoritesBtn') }}</button>
        <button @click="signOut()" class="text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">{{ t('signOutBtn') }}</button>
      </div>

      <div v-if="statsError" class="text-xs text-danger mt-3 text-center">
        {{ t('statsError') }}
        <button @click="refreshStats()" class="block text-center mt-4 w-full text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">{{ t('retry') }}</button>
      </div>

      <div v-if="stats" class="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white-08">
        <div class="text-center">
          <span class="text-[1.15rem] font-bold text-white-70 block leading-[1.2]">{{ stats.favorites }}</span>
          <span class="text-micro text-white-25 uppercase tracking-[0.05em] mt-1 block">{{ t('statFavorites') }}</span>
        </div>
        <div class="text-center">
          <span class="text-[1.15rem] font-bold text-white-70 block leading-[1.2]">{{ stats.likes }}</span>
          <span class="text-micro text-white-25 uppercase tracking-[0.05em] mt-1 block">{{ t('statLikes') }}</span>
        </div>
        <div class="text-center">
          <span class="text-[1.15rem] font-bold text-white-70 block leading-[1.2]">{{ stats.comments }}</span>
          <span class="text-micro text-white-25 uppercase tracking-[0.05em] mt-1 block">{{ t('statComments') }}</span>
        </div>
        <div class="text-center">
          <span class="text-[1.15rem] font-bold text-white-70 block leading-[1.2]">{{ viewedCount }}</span>
          <span class="text-micro text-white-25 uppercase tracking-[0.05em] mt-1 block">{{ t('statViews') }}</span>
        </div>
      </div>

      <div v-if="cat()" class="mt-4 text-xs text-white-30 text-center">
        {{ t('favCategory') }} <span class="text-white-60 font-medium">{{ cat() }}</span>
      </div>
    </template>

    <!-- === 未登录 === -->
    <template v-else>
      <div class="flex mb-5 border-b border-white-08">
        <button @click="tab = 'login'; reset()" class="flex-1 py-2.5 text-sm text-center font-medium bg-transparent border-none border-b-2 cursor-pointer -mb-px transition-colors duration-200 hover:text-white-50" :class="tab === 'login' ? 'text-white-85 border-b-white-50' : 'text-white-30 border-b-transparent'">{{ t('login') }}</button>
        <button @click="tab = 'register'; reset()" class="flex-1 py-2.5 text-sm text-center font-medium bg-transparent border-none border-b-2 cursor-pointer -mb-px transition-colors duration-200 hover:text-white-50" :class="tab === 'register' ? 'text-white-85 border-b-white-50' : 'text-white-30 border-b-transparent'">{{ t('register') }}</button>
      </div>

      <template v-if="otpSent">
        <div class="mb-6 p-4 rounded-md border bg-[color-mix(in_srgb,var(--color-success)_5%,transparent)] border-[color-mix(in_srgb,var(--color-success)_10%,transparent)]">
          <p class="text-sm text-success m-0 leading-[1.4]">{{ t('emailSent') }} <strong>{{ email }}</strong></p>
          <p class="text-xs mt-1 m-0 text-[color-mix(in_srgb,var(--color-success)_60%,transparent)]">{{ t('emailSentSub') }}</p>
        </div>
        <button @click="otpSent = false" class="text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">{{ t('backRetry') }}</button>
      </template>

      <template v-else>
        <div v-if="tab === 'register'" class="mb-4">
          <label class="block text-xs text-white-40 mb-1 uppercase tracking-[0.05em]" for="um-nick">{{ t('nicknameLbl') }}</label>
          <input id="um-nick" v-model="nick" type="text" class="w-full box-border px-2.5 py-2 text-sm rounded-md bg-white-06 border border-white-10 text-white-85 transition-colors duration-200 placeholder:text-white-15 focus:border-white-30 focus:bg-white-08 max-sm:text-base" :placeholder="t('nicknamePlaceholder')" autocomplete="username" :aria-invalid="!!errorMsg" />
        </div>
        <div class="mb-4">
          <label class="block text-xs text-white-40 mb-1 uppercase tracking-[0.05em]" for="um-email">{{ t('emailLbl') }}</label>
          <input id="um-email" v-model="email" type="email" class="w-full box-border px-2.5 py-2 text-sm rounded-md bg-white-06 border border-white-10 text-white-85 transition-colors duration-200 placeholder:text-white-15 focus:border-white-30 focus:bg-white-08 max-sm:text-base" :placeholder="t('emailPlaceholder')" autocomplete="email" :aria-invalid="!!errorMsg" />
        </div>
        <div class="mb-4">
          <label class="block text-xs text-white-40 mb-1 uppercase tracking-[0.05em]" for="um-password">{{ t('passwordLbl') }}</label>
          <input
            id="um-password"
            v-model="password"
            type="password"
            class="w-full box-border px-2.5 py-2 text-sm rounded-md bg-white-06 border border-white-10 text-white-85 transition-colors duration-200 placeholder:text-white-15 focus:border-white-30 focus:bg-white-08 max-sm:text-base"
            :placeholder="t('passwordPlaceholder')"
            :autocomplete="tab === 'register' ? 'new-password' : 'current-password'"
            :aria-invalid="!!errorMsg"
            @keyup.enter="tab === 'register' ? doRegister() : doLogin()"
          />
        </div>

        <button v-if="tab === 'login'" @click="doLogin" :disabled="loading" class="w-full px-4 py-2.5 text-sm font-semibold rounded-md bg-white-12 border-none text-white-85 cursor-pointer transition-colors duration-200 mt-2 enabled:hover:bg-white-20 disabled:opacity-40 disabled:cursor-not-allowed">
          {{ loading ? t('loggingIn') : t('login') }}
        </button>
        <button v-else @click="doRegister" :disabled="loading" class="w-full px-4 py-2.5 text-sm font-semibold rounded-md bg-white-12 border-none text-white-85 cursor-pointer transition-colors duration-200 mt-2 enabled:hover:bg-white-20 disabled:opacity-40 disabled:cursor-not-allowed">
          {{ loading ? t('registering') : t('register') }}
        </button>

        <button v-if="tab === 'login'" @click="doMagicLink" :disabled="loading" class="block text-center mt-4 w-full text-xs text-white-30 bg-transparent border-none cursor-pointer p-0 transition-colors duration-200 hover:text-white-70">
          {{ t('magicLink') }}
        </button>

        <p v-if="errorMsg" class="text-xs text-danger mt-3 text-center" role="alert">{{ errorMsg }}</p>
      </template>
    </template>
  </BaseModal>
</template>
