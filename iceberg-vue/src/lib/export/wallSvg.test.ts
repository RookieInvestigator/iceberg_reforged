import { describe, expect, it } from 'vitest';
import { esc, renderWallSvg } from './wallSvg';
import type { ExportStyle, WallExportLayout } from './wallExport';

const style: ExportStyle = {
  fontPx: 18.4, fontFamily: 'sans-serif',
  padX: 12.8, padY: 4.8, gapX: 20, gapY: 16, contentPadX: 60,
  tierPadY: 52, headerPx: 13, headerMarginBottom: 36,
  bg: '#0b0b10', headerColor: 'rgba(255,255,255,0.4)',
  titleColor: '#fff', introColor: '#fff',
  tagColor: '#fff', shadowColor: 'rgba(0,0,0,0.6)', dividerColor: '#fff',
  legendColor: '#fff', tagPillBg: '#fff',
  emojiRatio: 0.625, float: false,
};

const layout: WallExportLayout = {
  width: 1280,
  height: 2000,
  cover: [{
    text: '中文兔子洞 & 冰山 <图>', font: '900 54px sans-serif', color: '#fff',
    letterSpacingPx: 9.72, baseline: 120, maxWidth: 1280,
  }],
  legend: [{
    y: 200, h: 25, label: '分类', labelX: 600, labelBaseline: 212,
    cells: [{
      x: 500, w: 120, h: 25, color: '#ff0000', emoji: null,
      text: '都市"A"传说', textX: 510, baseline: 218,
    }],
  }],
  tiers: [{ tier: 'Tier 1', x: 60, y: 300, w: 1160, h: 100, count: 2, dividerY: null }],
  chips: [{
    id: 'a', tier: 'Tier 1', x: 100, y: 340, w: 120, h: 35,
    title: '甲 & 乙', titleW: 60, titleX: 112, baseline: 365,
    color: '#fff', emojis: ['📁'], emojiAdv: [14], emojiX: 176, alpha: 1,
  }],
  footer: {
    url: 'https://example.com/?a=1&b=2', qrSize: 72,
    qrX: 1100, qrY: 1800, textX: 60, urlBaseline: 1836,
    blockY: 1800, blockH: 72, ruleY: 1790,
    copy: '© 2026 x', copyBaseline: 1896, qrEl: null,
  },
};

describe('esc', () => {
  it('转义 XML 五件套', () => {
    expect(esc(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });
});

describe('renderWallSvg', () => {
  const svg = renderWallSvg(layout, style, 'data:image/png;base64,AAA');
  it('根节点与背景', () => {
    expect(svg.startsWith('<svg xmlns=')).toBe(true);
    expect(svg).toContain('viewBox="0 0 1280 2000"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });
  it('特殊字符全转义', () => {
    expect(svg).toContain('中文兔子洞 &amp; 冰山 &lt;图&gt;');
    expect(svg).toContain('都市&quot;A&quot;传说');
    expect(svg).toContain('甲 &amp; 乙');
    expect(svg).toContain('?a=1&amp;b=2');
    expect(svg).not.toContain('& ');
  });
  it('描边/居中/图例/二维码结构', () => {
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('fill-opacity="0.22"');
    expect(svg).toContain('<image ');
    expect(svg).toContain('data:image/png;base64,AAA');
  });
  it('题头字号取 px 数而非字重（400px 事故回归）', () => {
    const svg = renderWallSvg(layout, style, null);
    expect(svg).toContain('font-size="54"');
    expect(svg).not.toContain('font-size="400"');
    expect(svg).not.toContain('font-size="900"');
  });
  it('无二维码时只画网址', () => {
    const noQr = renderWallSvg({ ...layout, footer: { ...layout.footer!, qrEl: null } }, style, null);
    expect(noQr).not.toContain('<image ');
    expect(noQr).toContain('example.com');
  });
});
