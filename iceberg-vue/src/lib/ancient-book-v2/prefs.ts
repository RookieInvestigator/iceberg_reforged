import { atom } from 'nanostores'
import { defaultPrefs } from './layout'
import type { TypographyPrefs } from './types'

/**
 * 古籍模式排版偏好（持久化）。
 *
 * 与 settingsStore 分开：古籍模式的参数（字体/列间距/句读/鱼尾）只对这一页有意义，
 * 混进全站设置会让「设置面板」变成杂物间。
 */

const KEY = 'iceberg:ancient-book:prefs'

function load(): TypographyPrefs {
  const base = defaultPrefs()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<TypographyPrefs>
    // 逐字段合并：新增字段用默认值补齐，旧存档不会因缺字段而崩
    return { ...base, ...saved }
  } catch {
    return base
  }
}

export const typographyPrefs = atom<TypographyPrefs>(load())

typographyPrefs.listen((v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* 隐私模式下 localStorage 不可写，忽略 */
  }
})

/** 局部更新（合并，不整体替换） */
export function updatePrefs(patch: Partial<TypographyPrefs>): void {
  typographyPrefs.set({ ...typographyPrefs.get(), ...patch })
}

/** 恢复默认 */
export function resetPrefs(): void {
  typographyPrefs.set(defaultPrefs())
}
