import { describe, expect, it } from 'vitest'
import { applyFilter, buildCategoryShapeMap, buildWall, CAT_SHAPE_COUNT, markFavOne, markReadOne, setTooltipActive } from './wall'
import { colorblindMode, fontSize, reducedMotion, resetV3Settings, showScrollProgress, v3Align, v3Density } from './store'
import type { V3Item } from './keys'

function makeItem(id: string, tier: string, tierIndex: number, extra: Partial<V3Item> = {}): V3Item {
  return {
    id,
    title: `词条-${id}`,
    category: '民俗',
    tags: [],
    desc: '',
    link: '',
    modifiedAt: 0,
    related: [],
    categoryColor: '#ffaa00',
    emojis: [],
    tier,
    tierIndex,
    ...extra,
  }
}

describe('v3/wall', () => {
  it('渐进挂载先挂首批层级，flush 后补齐并触发 onTierMounted 回调', () => {
    const host = document.createElement('div')
    const mountedTiers: string[] = []
    const builder = buildWall(host, {
      tiers: [
        { name: '第一层', items: [makeItem('a1', '第一层', 0)] },
        { name: '第二层', items: [makeItem('b1', '第二层', 1)] },
        { name: '第三层', items: [makeItem('c1', '第三层', 2)] },
      ],
      categoryColors: { 民俗: '#ffaa00' },
      drift: true,
      initialTiers: 1,
      onTierMounted: (t) => mountedTiers.push(t.name),
    })

    expect(builder.handles.ids).toEqual(['a1'])
    expect(mountedTiers).toEqual(['第一层'])

    builder.flush()
    expect(builder.handles.ids).toEqual(['a1', 'b1', 'c1'])
    expect(mountedTiers).toEqual(['第一层', '第二层', '第三层'])
    builder.destroy()
  })

  it('构建期直接应用 is-new / data-read / data-fav 与逐个 emoji 标签，多分类渲染双层同步渐变结构', () => {
    const host = document.createElement('div')
    const builder = buildWall(host, {
      tiers: [
        {
          name: '第一层',
          items: [
            makeItem('s1', '第一层', 0, { modifiedAt: 2000, emojis: ['🔥', '👻'] }),
            makeItem('m1', '第一层', 0, {
              title: '廻戮戈之谜',
              categories: ['民俗', '悬疑'],
              gradStops: '#ffaa00 10%, #00ffd5 90%',
            }),
          ],
        },
      ],
      categoryColors: { 民俗: '#ffaa00', 悬疑: '#00ffd5' },
      drift: false,
      readIds: new Set(['s1']),
      favIds: new Set(['m1']),
      showRead: true,
      showNew: true,
      newCutoff: 1000,
    })

    const elS = builder.handles.els[0]
    expect(elS.classList.contains('is-new')).toBe(true)
    expect(elS.hasAttribute('data-read')).toBe(true)
    expect(elS.querySelectorAll('.v3-entry-tag').length).toBe(2)

    const elM = builder.handles.els[1]
    expect(elM.classList.contains('is-multi')).toBe(true)
    expect(elM.hasAttribute('data-fav')).toBe(true)
    expect(elM.style.getPropertyValue('--grad-stops')).toBe('#ffaa00 10%, #00ffd5 90%')
    const stroke = elM.querySelector('.v3-entry-stroke')
    const fill = elM.querySelector('.v3-entry-fill')
    expect(stroke?.getAttribute('aria-hidden')).toBe('true')
    expect(stroke?.querySelectorAll('.mir').length).toBe(3)
    expect(fill?.querySelectorAll('.mir').length).toBe(3)

    setTooltipActive(builder.handles, 'm1')
    expect(elM.classList.contains('tooltip-active')).toBe(true)
    setTooltipActive(builder.handles, 's1')
    expect(elM.classList.contains('tooltip-active')).toBe(false)
    expect(elS.classList.contains('tooltip-active')).toBe(true)
    setTooltipActive(builder.handles, null)
    expect(elS.classList.contains('tooltip-active')).toBe(false)

    builder.destroy()
  })

  it('hide 模式下单层无命中保留层级标题与空态提示，全空时隐藏所有层', () => {
    const host = document.createElement('div')
    const builder = buildWall(host, {
      tiers: [
        { name: '第一层', items: [makeItem('a1', '第一层', 0)] },
        { name: '第二层', items: [makeItem('b1', '第二层', 1)] },
      ],
      categoryColors: { 民俗: '#ffaa00' },
      drift: false,
      tierEmptyText: '暂无词条',
    })

    // 仅命中第一层 → 第二层保留标题且展示 tier-empty
    const c1 = applyFilter(builder.handles, new Set(['a1']), 'hide')
    expect(c1).toBe(1)
    expect(builder.handles.tiers[0].el.hidden).toBe(false)
    expect(builder.handles.tiers[0].emptyEl.hidden).toBe(true)
    expect(builder.handles.tiers[1].el.hidden).toBe(false)
    expect(builder.handles.tiers[1].emptyEl.hidden).toBe(false)

    // 全部 0 命中 → 全部层级 hidden（交由外层显示全局空状态）
    const c0 = applyFilter(builder.handles, new Set(), 'hide')
    expect(c0).toBe(0)
    expect(builder.handles.tiers[0].el.hidden).toBe(true)
    expect(builder.handles.tiers[1].el.hidden).toBe(true)
    builder.destroy()
  })

  it('散落模式将全部词条并入单一分区且支持 O(1) 已读/收藏状态标记', () => {
    const host = document.createElement('div')
    const builder = buildWall(host, {
      tiers: [
        { name: '第一层', items: [makeItem('a1', '第一层', 0)] },
        { name: '第二层', items: [makeItem('b1', '第二层', 1)] },
      ],
      categoryColors: { 民俗: '#ffaa00' },
      drift: false,
      scatter: true,
    })

    expect(builder.handles.tiers.length).toBe(1)
    expect(builder.handles.tiers[0].el.classList.contains('v3-tier--scatter')).toBe(true)
    expect(builder.handles.ids.length).toBe(2)

    markReadOne(builder.handles, 'a1', true)
    markFavOne(builder.handles, 'b1', true)
    const elA = builder.handles.els[builder.handles.indexOf.get('a1')!]
    const elB = builder.handles.els[builder.handles.indexOf.get('b1')!]
    expect(elA.hasAttribute('data-read')).toBe(true)
    expect(elB.hasAttribute('data-fav')).toBe(true)
    builder.destroy()
  })

  it('色盲模式为单分类和多分类词条追加几何分类小标记，且非色盲模式不产生多余节点', () => {
    const colors: Record<string, string> = {}
    for (let i = 0; i < CAT_SHAPE_COUNT + 2; i++) colors[`cat${i}`] = '#abcdef'
    const shapeMap = buildCategoryShapeMap(colors)
    expect(shapeMap.get('cat0')).toBe(0)
    expect(shapeMap.get(`cat${CAT_SHAPE_COUNT}`)).toBe(0)

    const hostNormal = document.createElement('div')
    const normalWall = buildWall(hostNormal, {
      tiers: [{ name: '第一层', items: [makeItem('n1', '第一层', 0, { category: 'cat0' })] }],
      categoryColors: colors,
      drift: false,
      colorblind: false,
    })
    expect(normalWall.handles.els[0].querySelector('.v3-cmarks')).toBeNull()
    normalWall.destroy()

    const hostCb = document.createElement('div')
    const cbWall = buildWall(hostCb, {
      tiers: [
        {
          name: '第一层',
          items: [
            makeItem('s1', '第一层', 0, { category: 'cat2', categoryColor: '#ff0000' }),
            makeItem('m1', '第一层', 0, {
              category: 'cat1',
              categories: ['cat1', 'cat4'],
              gradStops: '#111 0%, #222 100%',
            }),
          ],
        },
      ],
      categoryColors: colors,
      drift: false,
      colorblind: true,
    })

    const elS = cbWall.handles.els[0]
    const marksS = elS.querySelectorAll('.v3-cmarks .v3-cmark')
    expect(marksS.length).toBe(1)
    expect(marksS[0].classList.contains('cm-2')).toBe(true)

    const elM = cbWall.handles.els[1]
    const marksM = elM.querySelectorAll('.v3-cmarks .v3-cmark')
    expect(marksM.length).toBe(2)
    expect(marksM[0].classList.contains('cm-1')).toBe(true)
    expect(marksM[1].classList.contains('cm-4')).toBe(true)
    cbWall.destroy()
  })

  it('resetV3Settings 将显示与无障碍偏好恢复默认', () => {
    fontSize.set('xl')
    v3Density.set('compact')
    v3Align.set('left')
    colorblindMode.set(true)
    reducedMotion.set(true)
    showScrollProgress.set(false)

    resetV3Settings()

    expect(fontSize.get()).toBe('md')
    expect(v3Density.get()).toBe('airy')
    expect(v3Align.get()).toBe('center')
    expect(colorblindMode.get()).toBe(false)
    expect(reducedMotion.get()).toBe(false)
    expect(showScrollProgress.get()).toBe(true)
  })
})
