import { describe, expect, it } from 'vitest'
import { pickLinks, roleOf, type LinkRow } from './entryLinks'

const row = (url: string, label = '', role?: 'main' | 'ref'): LinkRow => ({ url, label, role })

describe('roleOf', () => {
  it('缺省与未知值都视作 ref（旧文件无 role 列 → 行为不变）', () => {
    expect(roleOf(row('https://a'))).toBe('ref')
    expect(roleOf(row('https://a', '', undefined))).toBe('ref')
    expect(roleOf({ url: 'https://a', label: '', role: 'main' })).toBe('main')
    expect(roleOf({ url: 'https://a', label: '', role: 'whatever' as never })).toBe('ref')
  })
})

describe('pickLinks', () => {
  it('没有 role=main 时：主链接取自主数据，副表行全是参考链接', () => {
    const r = pickLinks('https://main.example', [row('https://ref1.example'), row('https://ref2.example')])
    expect(r.main).toEqual({ url: 'https://main.example', label: '' })
    expect(r.refs.map((x) => x.url)).toEqual(['https://ref1.example', 'https://ref2.example'])
  })

  it('role=main 覆盖主链接 URL，且不再出现在参考链接里', () => {
    const r = pickLinks('https://old.example', [row('https://new.example', '', 'main'), row('https://ref.example')])
    expect(r.main?.url).toBe('https://new.example')
    expect(r.refs.map((x) => x.url)).toEqual(['https://ref.example'])
  })

  it('只改显示名：role=main 且 URL 与主数据相同 → 主链接 URL 不变、label 生效', () => {
    const r = pickLinks('https://same.example', [row('https://same.example', '正确站名', 'main')])
    expect(r.main).toEqual({ url: 'https://same.example', label: '正确站名' })
  })

  it('主数据无链接时，role=main 可以凭空补一条主链接', () => {
    const r = pickLinks('', [row('https://added.example', '补的站', 'main')])
    expect(r.main).toEqual({ url: 'https://added.example', label: '补的站' })
  })

  it('两份 role=main 时取第一条；空 URL 的行不算主链接', () => {
    const r = pickLinks('https://data.example', [row('', '', 'main'), row('https://first.example', '', 'main'), row('https://second.example', '', 'main')])
    expect(r.main?.url).toBe('https://first.example')
    expect(r.refs).toHaveLength(0)
  })

  it('两者都空 → main 为 null（模板不会渲染空的链接行）', () => {
    expect(pickLinks('', []).main).toBeNull()
    expect(pickLinks(undefined, undefined).main).toBeNull()
  })
})
