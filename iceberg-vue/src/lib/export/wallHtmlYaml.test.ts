import { describe, expect, it } from 'vitest';
import { dumpEntriesYaml, toYamlEntries } from './exportYaml';
import { renderWallHtml } from './wallHtml';
import type { ExportStyle, WallExportLayout } from './wallExport';

const style: ExportStyle = {
  fontPx: 18.4, fontFamily: 'sans-serif',
  padX: 12.8, padY: 4.8, gapX: 20, gapY: 16, contentPadX: 60,
  tierPadY: 52, headerPx: 13, headerMarginBottom: 36,
  bg: '#0b0b10', headerColor: '#fff', titleColor: '#fff', introColor: '#fff',
  tagColor: '#fff', shadowColor: '#000', dividerColor: '#fff', legendColor: '#fff',
  tagPillBg: '#fff', emojiRatio: 0.625, float: false,
};

describe('dumpEntriesYaml', () => {
  it('扁平记录 + 特殊字符安全', () => {
    const yml = dumpEntriesYaml(toYamlEntries([{
      id: 'a', title: '甲&乙', tier: 'Tier 1', category: 'C',
      tags: ['x', 'y"z'], desc: '第一行\n第二行', link: 'https://e.com/?a=1&b=2',
    }]));
    expect(yml).toContain('- id: "a"');
    expect(yml).toContain('title: "甲&乙"');
    expect(yml).toContain('- "y\\"z"');
    expect(yml).toContain('desc: "第一行\\n第二行"');
  });
  it('空 tags 写 []', () => {
    const yml = dumpEntriesYaml(toYamlEntries([{
      id: 'a', title: 't', tier: 'T', category: 'C', tags: [], desc: '', link: '',
    }]));
    expect(yml).toContain('tags: []');
  });
});

describe('renderWallHtml', () => {
  const layout: WallExportLayout = {
    width: 1280, height: 1000,
    cover: [{
      text: 'A&B', font: '900 54px sans-serif', color: '#fff',
      letterSpacingPx: 9, baseline: 120, maxWidth: 1280,
    }],
    legend: [{
      y: 200, h: 25, label: '分类', labelX: 600, labelBaseline: 212,
      cells: [{
        x: 500, w: 100, h: 25, color: '#fff', emoji: null,
        text: 'C<D', textX: 510, baseline: 218,
      }],
    }],
    tiers: [{ tier: 'Tier 1', x: 60, y: 300, w: 1160, h: 100, count: 1, headerH: 44, dividerY: 450 }],
    chips: [{
      id: 'a', tier: 'Tier 1', x: 100, y: 340, w: 120, h: 35,
      title: '甲&乙', titleW: 60, titleX: 112, baseline: 365,
      color: '#fff', emojis: [], emojiAdv: [], emojiX: 176, alpha: 1,
    }],
    footer: {
      url: 'https://e.com/?a=1&b=2', qrSize: 72, qrX: 1100, qrY: 800,
      textX: 60, urlBaseline: 836, blockY: 800, blockH: 72, ruleY: 790,
      copy: '© 2026', copyBaseline: 880, qrEl: null,
    },
  };
  const html = renderWallHtml(layout, style, {
    pageTitle: 'T&', pageUrl: 'https://e.com/', qrDataUrl: 'data:image/png;base64,AA',
    labels: { search: '搜索', reset: '重置', categories: '分类', tags: '标签', noResult: '无结果' },
    descs: { a: '描述&<b>' }, links: { a: 'https://e.com/?x=1' },
    cats: { a: '都市传说' }, tags: { a: ['📁'] },
  });
  it('单文件骨架 + 转义', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>T&amp;</title>');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('C&lt;D');
    expect(html).toContain('?a=1&amp;');
  });
  it('布局还原：芯片/层级/分隔线/图例/页脚', () => {
    expect(html).toContain('class="chip"');
    expect(html).toContain('Tier 1');
    expect(html).toContain('class="rule"');
    expect(html).toContain('分类');
    expect(html).toContain('<img src="data:image/png;base64,AA"');
    expect(html).toContain('© 2026');
  });
  it('筛选条 + tooltip 脚本 + 内嵌数据', () => {
    expect(html).toContain('id="fbar"');
    expect(html).toContain('id="tip"');
    expect(html).toContain('data-id="a"');
    expect(html).toContain('data-tier-head');
    expect(html).toContain('var DATA=');
    // 内嵌 JSON 保持原样（仅 </ 转义防闭合 script），tooltip 渲染时才转义
    expect(html).toContain('描述&<b>');
  });
  it('图例即筛选器：分类/tag 可点', () => {
    expect(html).toContain('leg-cell');
    expect(html).toContain('syncLeg');
    expect(html).not.toContain('id="fcats"');
  });
});
