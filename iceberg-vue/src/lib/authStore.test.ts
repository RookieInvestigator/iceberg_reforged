import { beforeEach, describe, expect, it, vi } from 'vitest'

// F13 验收：收藏同步冲突矩阵（本地新增 / 云端新增 / 两端删除 / 首次登录 / 同步失败）

vi.mock('./supabase', () => ({
  supabase: {
    auth: { updateUser: vi.fn(() => Promise.resolve({ error: null })) },
  },
  isSupabaseReady: () => true,
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthChange: vi.fn(),
}))

vi.mock('./supabaseData', () => ({
  fetchMyFavorites: vi.fn(),
  syncFavorites: vi.fn(),
}))

import { syncFavoritesWithCloud } from './authStore'
import { fetchMyFavorites, syncFavorites } from './supabaseData'
import { favorites } from './settingsStore'

const mockFetch = vi.mocked(fetchMyFavorites)
const mockSync = vi.mocked(syncFavorites)

function setLocal(ids: string[]) {
  localStorage.setItem('iceberg-favorites', JSON.stringify(ids))
}

beforeEach(() => {
  localStorage.clear()
  favorites.set([])
  mockFetch.mockReset()
  mockSync.mockReset().mockResolvedValue(undefined)
})

describe('syncFavoritesWithCloud（F13 冲突矩阵）', () => {
  it('首次登录（本地为空，云端有收藏）：仅合并显示，不传播删除', async () => {
    mockFetch.mockResolvedValue(['c1', 'c2'])
    await syncFavoritesWithCloud()
    expect(favorites.get()).toEqual(['c1', 'c2'])
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('本地新增：本地非空 → 双向 diff 同步以本地为权威，成功后校正显示', async () => {
    setLocal(['a', 'b'])
    mockFetch.mockResolvedValue(['a'])
    await syncFavoritesWithCloud()
    expect(mockSync).toHaveBeenCalledWith(['a', 'b'])
    expect(favorites.get()).toEqual(['a', 'b'])
  })

  it('云端新增（本地权威删云端多余）：diff 由 syncFavorites 传播删除', async () => {
    setLocal(['a'])
    mockFetch.mockResolvedValue(['a', 'b'])
    await syncFavoritesWithCloud()
    expect(mockSync).toHaveBeenCalledWith(['a'])
  })

  it('两端删除（登出期间本地删光）：护栏不传播删除，仅展示云端', async () => {
    mockFetch.mockResolvedValue(['a'])
    await syncFavoritesWithCloud()
    expect(mockSync).not.toHaveBeenCalled()
    expect(favorites.get()).toEqual(['a'])
  })

  it('同步失败：显示保持并集，不被本地覆盖（本地与云端不漂移）', async () => {
    setLocal(['a'])
    mockFetch.mockResolvedValue(['b'])
    mockSync.mockRejectedValue(new Error('network down'))
    await syncFavoritesWithCloud()
    // 并集显示仍保留云端 b（syncFavorites 抛错后不执行 favorites.set(local)）
    expect(favorites.get()).toEqual(['a', 'b'])
  })

  it('同步请求排队：多次触发串行执行而非丢弃', async () => {
    mockFetch.mockResolvedValue(['x'])
    syncFavoritesWithCloud()
    syncFavoritesWithCloud()
    const last = syncFavoritesWithCloud()
    // 排队链：3 次都会执行（fetch 被调用 3 次），而不是布尔锁只执行 1 次；await 队尾等待全部完成
    await last
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})
