import { describe, expect, it } from 'vitest';
import {
  evenSliceBounds, floatOffsetOf, layoutWall,
  type ExportItem, type ExportState, type ExportStyle, type TextMeasurer,
} from './wallExport';

// 假度量：ASCII 10px/字，CJK 16px/字，ascent 固定 12（只验布局几何，不验字形）
const measure: TextMeasurer = (text) => {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0xff ? 16 : 10;
  return { width: w, ascent: 12 };
};

const style: ExportStyle = {
  fontPx: 18.4, fontFamily: 'sans-serif', // 16 × 1.15em（v2 胶囊字号）
  padX: 12.8, padY: 4.8, gapX: 20, gapY: 16, contentPadX: 60,
  tierPadY: 44, headerPx: 12, headerMarginBottom: 32,
  bg: '#000', headerColor: '#fff', tagColor: '#fff',
  titleColor: '#fff', introColor: '#fff',
  shadowColor: 'rgba(0,0,0,.6)', dividerColor: 'rgba(255,255,255,.1)',
  legendColor: 'rgba(255,255,255,.85)', tagPillBg: 'rgba(255,255,255,.06)',
  emojiRatio: 0.625, float: false,
};
const state: ExportState = { visible: null };
const colorOf = (it: ExportItem) => it.categoryColor;
const item = (id: string, title: string, tier = 'Tier 1'): ExportItem =>
  ({ id, tier, title, categoryColor: '#fff', emojis: [] });

describe('layoutWall', () => {
  it('空层跳过、层级按 tierOrder 堆叠', () => {
    const l = layoutWall([item('a', '甲')], ['Tier 1', 'Tier 2'], 1600, style, state, measure, colorOf);
    expect(l.tiers).toHaveLength(1);
    expect(l.tiers[0].tier).toBe('Tier 1');
    expect(l.tiers[0].count).toBe(1);
    expect(l.chips).toHaveLength(1);
    expect(l.height).toBeGreaterThan(0);
  });
  it('行内居中：单行两词条左右留白对称', () => {
    const l = layoutWall([item('a', '甲'), item('b', '乙')], ['Tier 1'], 1600, style, state, measure, colorOf);
    const [a, b] = l.chips;
    const leftGap = a.x - style.contentPadX;
    const rightGap = 1600 - style.contentPadX - (b.x + b.w);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(1);
  });
  it('超宽换行：窄墙分多行且行高累加', () => {
    // 宽 260 → availW 140；单芯片约 41.6px，两词条 103px 同行，第三个被挤到下一行
    const wide = layoutWall([item('a', '甲'), item('b', '乙'), item('c', '丙')], ['Tier 1'], 260, style, state, measure, colorOf);
    const ys = new Set(wide.chips.map((c) => Math.round(c.y)));
    expect(ys.size).toBe(2);
  });
  it('超长标题截断加省略号', () => {
    const long = '甲'.repeat(100);
    const l = layoutWall([item('a', long)], ['Tier 1'], 300, style, state, measure, colorOf);
    expect(l.chips[0].title.endsWith('…')).toBe(true);
    expect(l.chips[0].w).toBeLessThanOrEqual(300 - style.contentPadX * 2 + 1);
  });
  it('visible 过滤：hide 模式不留空洞', () => {
    const st: ExportState = { visible: new Set(['b']) };
    const l = layoutWall([item('a', '甲'), item('b', '乙')], ['Tier 1'], 1600, style, st, measure, colorOf);
    expect(l.chips.map((c) => c.id)).toEqual(['b']);
    expect(l.tiers[0].count).toBe(1);
  });
  it('全透明快照：read/dim 一律不画', () => {
    const l = layoutWall(
      [item('a', '甲'), item('b', '乙')], ['Tier 1'], 1600, style, state, measure, colorOf,
    );
    for (const c of l.chips) expect(c.alpha).toBe(1);
  });
});

describe('cover 题头', () => {
  const cover = {
    kicker: 'Chinese Oddities Iceberg · Reforged',
    title: '中文兔子洞冰山图',
    meta: '2026-09-12 · 1440 词条',
    intro: '',
  };
  it('无题头输入不占位', () => {
    const a = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf);
    const b = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf, cover);
    expect(b.cover).toHaveLength(3);
    expect(b.height).toBeGreaterThan(a.height + 100);
    expect(b.chips[0].y).toBeGreaterThan(a.chips[0].y);
  });
  it('intro 换行增高', () => {
    const noIntro = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf, cover);
    const withIntro = layoutWall(
      [item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf,
      { ...cover, intro: '长'.repeat(100) },
    );
    expect(withIntro.cover.length).toBeGreaterThan(noIntro.cover.length);
    expect(withIntro.height).toBeGreaterThan(noIntro.height);
  });
});

describe('层级分隔线', () => {
  it('n 层 n-1 条，居块间中线，末层无', () => {
    const l = layoutWall(
      [item('a', '甲', 'Tier 1'), item('b', '乙', 'Tier 2')], ['Tier 1', 'Tier 2'],
      1600, style, state, measure, colorOf,
    );
    expect(l.tiers).toHaveLength(2);
    const [t1, t2] = l.tiers;
    expect(t1.dividerY).toBe(t1.y + t1.h + 22);
    expect(t2.dividerY).toBeNull();
  });
});

describe('图例', () => {
  const legend = {
    categoriesLabel: '分类',
    tagsLabel: '标签',
    categories: [
      { name: '都市传说', color: '#fff' },
      { name: '未解之谜', color: '#000' },
    ],
    tags: [{ emoji: '📁', name: '失传' }],
  };
  it('空图例零高度', () => {
    const a = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf);
    const b = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf, undefined,
      { categoriesLabel: '分类', tagsLabel: '标签', categories: [], tags: [] });
    expect(b.legend).toHaveLength(0);
    expect(b.height).toBe(a.height);
  });
  it('分类+标签成组，增高', () => {
    const a = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf);
    const b = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf, undefined, legend);
    const labels = b.legend.map((r) => r.label);
    expect(labels).toContain('分类');
    expect(labels).toContain('标签');
    expect(b.height).toBeGreaterThan(a.height);
    expect(b.chips[0].y).toBeGreaterThan(a.chips[0].y);
    // 胶囊：分类格有色，tag 格走弱化底
    const catCell = b.legend.flatMap((r) => r.cells).find((c) => c.text === '都市传说');
    const tagCell = b.legend.flatMap((r) => r.cells).find((c) => c.text === '失传');
    expect(catCell?.color).toBe('#fff');
    expect(tagCell?.color).toBeNull();
    expect(tagCell?.emoji).toBe('📁');
  });
});

describe('底部二维码块', () => {
  it('无输入零高度，有输入增高', () => {
    const a = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf);
    const b = layoutWall([item('a', '甲')], ['Tier 1'], 1600, style, state, measure, colorOf,
      undefined, undefined, 'https://example.com/', '© 2026 x');
    expect(a.footer).toBeNull();
    expect(b.footer?.url).toBe('https://example.com/');
    expect(b.footer?.copy).toContain('2026');
    expect(b.height).toBeGreaterThan(a.height);
    // 左右结构：文字左对齐在内容左边界，二维码贴右边界
    expect(b.footer!.textX).toBe(60);
    expect(b.footer!.qrX + b.footer!.qrSize).toBe(1600 - 60);
    expect(b.footer!.urlBaseline).toBeLessThan(b.footer!.copyBaseline);
    // 收束线落在末层之后、二维码之前
    const lastTier = b.tiers[b.tiers.length - 1];
    expect(b.footer!.ruleY).toBeGreaterThan(lastTier.y + lastTier.h);
    expect(b.footer!.ruleY).toBeLessThan(b.footer!.qrY);
  });
});

describe('均匀切分不断字', () => {
  const l = layoutWall(
    [item('a', '甲'), item('b', '乙'), item('c', '丙'), item('d', '丁')],
    ['Tier 1'], 260, style, state, measure, colorOf,
  );
  it('边界数 = N+1，首 0 末 total，单调递增', () => {
    const b = evenSliceBounds(l, 3);
    expect(b).toHaveLength(4);
    expect(b[0]).toBe(0);
    expect(b[3]).toBe(l.height);
    for (let i = 1; i < b.length; i++) expect(b[i]).toBeGreaterThan(b[i - 1]);
  });
  it('边界不落在任何芯片/层级名内', () => {
    const occ: Array<[number, number]> = [
      ...l.chips.map((c) => [c.y, c.y + c.h] as [number, number]),
      ...l.tiers.map((t) => [t.y, t.y + t.headerH] as [number, number]),
    ];
    for (const b of evenSliceBounds(l, 4)) {
      if (b === 0 || b === l.height) continue;
      for (const [a, c] of occ) expect(b <= a || b >= c).toBe(true);
    }
  });
  it('N 非法值收敛到 [2, 32]', () => {
    expect(evenSliceBounds(l, 0)).toHaveLength(3);
    expect(evenSliceBounds(l, 99)).toHaveLength(33);
  });
});

describe('floatOffsetOf', () => {
  it('确定性：同 id 同偏移', () => {
    expect(floatOffsetOf('abc123')).toEqual(floatOffsetOf('abc123'));
  });
  it('落在生产同量级范围内', () => {
    // & 0xffffffff 为有符号 32 位（见 layout2 注释），h%300 可为负，x 下探到 -4.5；
    // y = ((h*37)%600)/100-3，范围 (-9, 3)。只锁定量级与有限性。
    for (const id of ['test-id', 'a', '膾炙人口的词条']) {
      const { x, y } = floatOffsetOf(id);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-4.5);
      expect(x).toBeLessThan(1.5);
      expect(y).toBeGreaterThan(-9);
      expect(y).toBeLessThan(3);
    }
  });
});
