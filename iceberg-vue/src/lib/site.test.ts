import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import siteConfig from '../../site.config.json'
import { SITE_ORIGIN, canonicalUrl, isProjectHost } from './site'
import { REPRINT_URL } from './reprint'

/**
 * 权威域名单一来源守卫：真值在 site.config.json，其余地方只许用占位符或 lib/site.ts。
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

describe('site.config.json 是权威域名的唯一来源', () => {
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

  it('isProjectHost：本项目部署（含子域）为真，别人的副本为假', () => {
    // 本项目自己的部署
    expect(isProjectHost('iceberg.hezihezi.com')).toBe(true)
    expect(isProjectHost('ICEBERG.HEZIHEZI.COM')).toBe(true)
    expect(isProjectHost('iceberg-reforged.pages.dev')).toBe(true)
    expect(isProjectHost('abc123.iceberg-reforged.pages.dev')).toBe(true) // CF Pages 预览域名
    expect(isProjectHost('localhost')).toBe(true)
    expect(isProjectHost('127.0.0.1')).toBe(true)
    expect(isProjectHost('localhost:5173')).toBe(true)
    // 别人部署的副本 → 触发「数据可能已落后」提示
    expect(isProjectHost('iceberg.8void.com')).toBe(false)
    expect(isProjectHost('jp0id.github.io')).toBe(false)
    expect(isProjectHost('mirror.example.com')).toBe(false)
    expect(isProjectHost('')).toBe(false)
    // 反向陷阱：不能把「包含」当命中（hezihezi.com.evil.com 不是我们的域）
    expect(isProjectHost('iceberg.hezihezi.com.evil.com')).toBe(false)
    expect(isProjectHost('notlocalhost')).toBe(false)
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
