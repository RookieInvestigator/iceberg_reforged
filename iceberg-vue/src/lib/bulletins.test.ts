import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bulletinIdFromPath,
  collectBulletins,
  dismissBulletinBanner,
  loadBulletins,
  markBulletinSeen,
  parseBulletin,
  pendingBulletin,
  readBulletinState,
  shouldShowBanner,
  type Bulletin,
} from './bulletins'

const VALID = `---
date: 2026-09-24
author: AAA冰山图除锈
title: 站点更新
---

正文第一段。

- 列表项
`

function bullet(id: string, date: string, title = id): Bulletin {
  return { id, date, title, author: '', content: '' }
}

beforeEach(() => {
  localStorage.clear()
})

describe('parseBulletin', () => {
  it('解析出各字段，正文保留原样并 trim', () => {
    const r = parseBulletin('001-test', VALID)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bulletin).toEqual({
      id: '001-test',
      title: '站点更新',
      date: '2026-09-24',
      author: 'AAA冰山图除锈',
      content: '正文第一段。\n\n- 列表项',
    })
  })

  it('值内的冒号保留（只按首个冒号切分）', () => {
    const r = parseBulletin('x', '---\ntitle: 提示: 请看这里\ndate: 2026-01-01\n---\n正文')
    expect(r.ok && r.bulletin.title).toBe('提示: 请看这里')
  })

  it('去掉成对引号，保留引号内的冒号', () => {
    const r = parseBulletin('x', '---\ntitle: "A: B"\ndate: 2026-01-01\n---\n')
    expect(r.ok && r.bulletin.title).toBe('A: B')
  })

  it('author 可缺失，内容允许为空', () => {
    const r = parseBulletin('x', '---\ntitle: 只有标题\ndate: 2026-01-01\n---\n')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bulletin.author).toBe('')
    expect(r.bulletin.content).toBe('')
  })

  it('容忍 BOM 与 CRLF（Windows 编辑器常见写法）', () => {
    const raw = '\uFEFF---\r\ndate: 2026-01-01\r\ntitle: 换行\r\n---\r\n正文\r\n'
    const r = parseBulletin('x', raw)
    expect(r.ok && r.bulletin.title).toBe('换行')
    expect(r.ok && r.bulletin.content).toBe('正文')
  })

  it('忽略 frontmatter 里的注释行与空行', () => {
    const r = parseBulletin('x', '---\n# 注释\n\ndate: 2026-01-01\ntitle: T\n---\n')
    expect(r.ok && r.bulletin.title).toBe('T')
  })

  it('hidden 缺省为 false，显式 true / false 各自生效', () => {
    const base = (extra: string) => `---\ntitle: T\ndate: 2026-01-01\n${extra}---\n正文`
    const absent = parseBulletin('x', base(''))
    const on = parseBulletin('x', base('hidden: true\n'))
    const off = parseBulletin('x', base('hidden: false\n'))
    expect(absent.ok && absent.hidden).toBe(false)
    expect(on.ok && on.hidden).toBe(true)
    expect(off.ok && off.hidden).toBe(false)
    // hidden 不进 Bulletin 本身：消费方拿到的列表里不存在「隐藏但仍被渲染」的可能
    expect(Object.keys(on.ok ? on.bulletin : {})).not.toContain('hidden')
  })

  it('缺 frontmatter / 缺 title / 缺 date / 日期格式错 / hidden 值非法 都给出原因', () => {
    const cases: Array<[string, string]> = [
      ['无 frontmatter 正文', '就是一段普通文本'],
      ['缺 title', '---\ndate: 2026-01-01\n---\n正文'],
      ['缺 date', '---\ntitle: T\n---\n正文'],
      ['日期格式错', '---\ntitle: T\ndate: 2026/01/01\n---\n正文'],
      ['frontmatter 行无冒号', '---\ntitle: T\ndate: 2026-01-01\n乱写一行\n---\n正文'],
      ['hidden 值非法', '---\ntitle: T\ndate: 2026-01-01\nhidden: yes\n---\n正文'],
    ]
    for (const [label, raw] of cases) {
      const r = parseBulletin('x', raw)
      expect(r.ok, label).toBe(false)
      if (!r.ok) expect(r.error.length, label).toBeGreaterThan(0)
    }
  })
})

describe('bulletinIdFromPath', () => {
  it('取文件名去扩展名（glob 键与裸文件名都支持）', () => {
    expect(bulletinIdFromPath('../data/bulletins/001-dev-status.md')).toBe('001-dev-status')
    expect(bulletinIdFromPath('006-cf-pages.md')).toBe('006-cf-pages')
  })
})

describe('collectBulletins', () => {
  it('按日期倒序；同日按 id 倒序，结果确定', () => {
    const list = collectBulletins({
      'a/002-old.md': '---\ntitle: 旧\ndate: 2026-01-01\n---\n',
      'a/003-new.md': '---\ntitle: 新\ndate: 2026-02-01\n---\n',
      'a/001-same.md': '---\ntitle: 同日\ndate: 2026-02-01\n---\n',
    })
    expect(list.map((b) => b.id)).toEqual(['003-new', '001-same', '002-old'])
  })

  it('hidden: true 的公告不上列表，且不算错误（不触发 onError）', () => {
    const onError = vi.fn()
    const list = collectBulletins(
      {
        'a/001-live.md': '---\ntitle: 在架\ndate: 2026-01-01\n---\n',
        'a/002-old.md': '---\ntitle: 下线\ndate: 2026-02-01\nhidden: true\n---\n',
        'a/003-broken.md': '没有 frontmatter',
      },
      onError,
    )
    // 002 虽日期更新，但被隐藏后 001 才是列表首条
    expect(list.map((b) => b.id)).toEqual(['001-live'])
    expect(onError).toHaveBeenCalledTimes(1) // 只有真损坏的 003 被回报
    expect(onError.mock.calls[0][0]).toBe('003-broken')
  })

  it('非法文件被跳过并回报原因，不阻断其余公告', () => {
    const onError = vi.fn()
    const list = collectBulletins(
      {
        'a/001-ok.md': VALID,
        'a/002-broken.md': '没有 frontmatter',
      },
      onError,
    )
    expect(list.map((b) => b.id)).toEqual(['001-ok'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe('002-broken')
  })
})

describe('已读 / 关闭状态', () => {
  it('读写走 localStorage，未写过时为 null', () => {
    expect(readBulletinState()).toEqual({ seenId: null, dismissedId: null })
    markBulletinSeen('005-a')
    dismissBulletinBanner('006-b')
    expect(readBulletinState()).toEqual({ seenId: '005-a', dismissedId: '006-b' })
  })

  it('key 以 iceberg- 开头（自动进入设置面板导出/导入/清空范围）', () => {
    markBulletinSeen('x')
    dismissBulletinBanner('y')
    // 与 SettingsPanel 同口径枚举（Storage 不是普通对象，不能用 Object.keys）
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) || '')
    expect(keys.filter((k) => k.startsWith('iceberg-'))).toEqual([
      'iceberg-bulletin-seen',
      'iceberg-bulletin-banner-dismissed',
    ])
  })
})

describe('条幅与自动弹窗判定', () => {
  const list = [bullet('006-c', '2026-07-30'), bullet('005-b', '2026-06-01')]
  const empty = { seenId: null, dismissedId: null }

  it('条幅不因「已读」而隐藏，只有被手动关闭才让位', () => {
    expect(shouldShowBanner(list, empty)).toBe(true)
    expect(shouldShowBanner(list, { seenId: '006-c', dismissedId: null })).toBe(true)
    expect(shouldShowBanner(list, { seenId: null, dismissedId: '006-c' })).toBe(false)
    // 关掉的是旧公告：条幅仍显示最新一条
    expect(shouldShowBanner(list, { seenId: null, dismissedId: '005-b' })).toBe(true)
  })

  it('自动弹窗只看最新一条，且已读或已关闭都不再弹', () => {
    expect(pendingBulletin(list, empty)?.id).toBe('006-c')
    expect(pendingBulletin(list, { seenId: '006-c', dismissedId: null })).toBeNull()
    expect(pendingBulletin(list, { seenId: null, dismissedId: '006-c' })).toBeNull()
    expect(pendingBulletin([], empty)).toBeNull()
  })
})

describe('loadBulletins（站内真实公告）', () => {
  it('在架公告都能解析，id 唯一且日期倒序', () => {
    const list = loadBulletins()
    expect(list.length).toBeGreaterThan(0)
    expect(new Set(list.map((b) => b.id)).size).toBe(list.length)
    for (const b of list) {
      expect(b.title, b.id).not.toBe('')
      expect(b.date, b.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    const dates = list.map((b) => b.date)
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
  })

  // 站内只留在架的欢迎公告；此断言也是 hidden 机制的实地守卫 ——
  // 任何一条旧公告因 frontmatter 拼写（如 `Hidden:`）而漏出，这里立刻失败。
  it('旧公告已全部隐藏，在架只剩欢迎公告', () => {
    expect(loadBulletins().map((b) => b.id)).toEqual(['007-welcome'])
  })
})
