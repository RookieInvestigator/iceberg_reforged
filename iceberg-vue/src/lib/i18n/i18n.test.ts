import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zh from './zh'
import en from './en'
import ja from './ja'

/**
 * i18n 三语对齐 + 死 key 守卫。
 *
 * 背景：2026-08-30 清过 66 条死词条，2026-09-06 又发现 `loading` / `noLink`
 * 在零引用的情况下存活——人工清理不可持续，改由测试锁住：
 * 1. en/ja 的 key 集合必须与 zh 完全一致（无缺失、无多余）；
 * 2. 每个 key 都必须被源码引用：t('key') 字面量、`labelKey` / `descKey`
 *    间接引用，或 `font*` / `sort*` 动态拼接前缀（SettingsPanel 的 t('font'+…)）。
 * 新增带文案的 UI 时若漏加 key，第 1 项失败；删 UI 忘删 key 时第 2 项失败。
 */
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function collectSources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'data') collectSources(p, out)
    } else if (/\.(vue|ts)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

const allSources = collectSources(SRC_ROOT)
  .map((f) => readFileSync(f, 'utf-8'))
  .join('\n')

function isUsed(key: string): boolean {
  if (new RegExp(`\\bt\\(\\s*['"]${key}['"]`).test(allSources)) return true
  if (new RegExp(`(?:labelKey|descKey)\\s*:\\s*['"]${key}['"]`).test(allSources)) return true
  // SettingsPanel 动态拼接：t('font' + …) / t('sort' + …)
  if (/^(font|sort)/.test(key)) return true
  return false
}

describe('i18n 三语对齐与死 key 守卫', () => {
  const zhKeys = Object.keys(zh)

  it('en/ja 与 zh 的 key 集合完全一致', () => {
    expect(Object.keys(en).sort()).toEqual([...zhKeys].sort())
    expect(Object.keys(ja).sort()).toEqual([...zhKeys].sort())
  })

  it('每个 key 都被源码引用，防死词条堆积', () => {
    expect(zhKeys.filter((k) => !isUsed(k))).toEqual([])
  })
})
