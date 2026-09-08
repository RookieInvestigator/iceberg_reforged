import { describe, expect, it } from 'vitest'
import { MOBILE_BP, resolvePresenter, toEntryView } from './entryView'

describe('toEntryView', () => {
  it('组装完整载荷并统一 categoryColor', () => {
    const v = toEntryView(
      {
        id: 'a1', title: 'T', tier: 'Tier 1', desc: 'D',
        category: 'C', categoryColor: '#fff', tags: ['x'], link: 'https://x',
      },
      { related: [{ id: 'b2', title: 'B' }], prevId: null, nextId: 'c3', depth: 0 },
    )
    expect(v).toMatchObject({
      id: 'a1', categoryColor: '#fff', tags: ['x'],
      related: [{ id: 'b2', title: 'B' }], nextId: 'c3', depth: 0,
    })
    expect(v.prevId).toBeUndefined()
    expect('color' in v).toBe(false)
  })
  it('缺省值兜底', () => {
    const v = toEntryView({ id: 'a', title: 'T', category: 'C', categoryColor: '#000' })
    expect(v.desc).toBe('')
    expect(v.tags).toEqual([])
    expect(v.related).toEqual([])
    expect(v.depth).toBe(0)
  })
})

describe('resolvePresenter', () => {
  it('窄视口一律 sheet', () => {
    expect(resolvePresenter({ viewport: 390, detailMode: 'modal' })).toBe('sheet')
    expect(resolvePresenter({ viewport: MOBILE_BP - 1, detailMode: 'tooltip' })).toBe('sheet')
  })
  it('桌面 modal 模式一律 modal', () => {
    expect(resolvePresenter({ viewport: 1440, detailMode: 'modal' })).toBe('modal')
  })
  it('桌面 tooltip 模式一律 link（调用方有链接才打开，无链接 no-op）', () => {
    expect(resolvePresenter({ viewport: 1440, detailMode: 'tooltip' })).toBe('link')
  })
})
