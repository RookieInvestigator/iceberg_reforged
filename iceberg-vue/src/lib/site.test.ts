import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import siteConfig from '../../site.config.json'
import { SITE_ORIGIN, canonicalUrl, hasNewerData } from './site'
import { REPRINT_URL } from './reprint'

/**
 * 站点域名单一来源守卫：真值在 site.config.json，其余地方只许用占位符或 lib/site.ts。
 */
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = join(SRC_ROOT, '..')
const ORIGIN_LITERAL = /https?:\/\/iceberg\.hezihezi\.com/

/** 递归收集源码文件（跳过测试文件本身与数据目录） */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'data') collectSources(p, out)
    } else if (/\.(ts|vue)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

/**
 * 去掉注释再扫描：注释里引用历史域名是应该的，守卫拦的是代码里的硬编码。
 * 只剥块注释与整行注释 —— 不按 `//` 截断到行尾，否则 `const X = 'https://…'` 会被自己截掉。
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
}

describe('site.config.json 是站点域名的唯一来源', () => {
  it('形态：https + 无尾斜杠 + 与导出常量一致', () => {
    expect(siteConfig.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/)
    expect(SITE_ORIGIN).toBe(siteConfig.origin)
    expect(SITE_ORIGIN.endsWith('/')).toBe(false)
  })

  it('canonicalUrl：根路径保留尾斜杠，其余原样拼接，容错缺前导斜杠', () => {
    expect(canonicalUrl('/')).toBe(`${SITE_ORIGIN}/`)
    expect(canonicalUrl('/home')).toBe(`${SITE_ORIGIN}/home`)
    expect(canonicalUrl('on-this-day')).toBe(`${SITE_ORIGIN}/on-this-day`)
  })

  it('转载模板的原文链接同源（不再各写一份常量）', () => {
    expect(REPRINT_URL).toBe(SITE_ORIGIN)
  })

  it('hasNewerData：只比内容指纹，不看时间', () => {
    const remote = (dataHash: string, total = 1500) => ({ generatedAt: 1, dataHash, total })
    // 指纹不同 → 有新数据
    expect(hasNewerData(remote('b'.repeat(64)), 'a'.repeat(64))).toBe(true)
    // 指纹相同 → 没有新数据（哪怕本地快照很旧、远端构建时间更晚）
    expect(hasNewerData(remote('a'.repeat(64)), 'a'.repeat(64))).toBe(false)
    // 取不到远端 / 任一侧没有指纹 → 不提示（宁可不说，也不误报）
    expect(hasNewerData(null, 'a'.repeat(64))).toBe(false)
    expect(hasNewerData(remote(''), 'a'.repeat(64))).toBe(false)
    expect(hasNewerData(remote('b'.repeat(64)), '')).toBe(false)
  })

  it('🔒 源码里不许再写死域名（除 site.config.json 一处真值）', () => {
    const offenders = collectSources(SRC_ROOT)
      .filter((f) => ORIGIN_LITERAL.test(stripComments(readFileSync(f, 'utf-8'))))
      .map((f) => f.replace(PROJECT_ROOT, '').replace(/\\/g, '/'))
    expect(offenders).toEqual([])
  })

  it('🔒 静态入口用占位符而不是字面量（构建期替换）', () => {
    for (const rel of ['index.html', 'public/robots.txt', 'public/sitemap.xml']) {
      const text = readFileSync(join(PROJECT_ROOT, rel), 'utf-8')
      expect(text, `${rel} 应含 __SITE_ORIGIN__ 占位符`).toContain('__SITE_ORIGIN__')
      expect(ORIGIN_LITERAL.test(stripComments(text)), `${rel} 不应写死域名`).toBe(false)
    }
  })
})
