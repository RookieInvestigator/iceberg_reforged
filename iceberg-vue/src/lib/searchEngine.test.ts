import { describe, expect, it } from 'vitest';
import { buildSearchUrl, normalizeSearchEngine } from './searchEngine';

describe('buildSearchUrl', () => {
  it('百度走 /s?wd=', () => {
    expect(buildSearchUrl('baidu', '盗肾传说')).toBe(
      `https://www.baidu.com/s?wd=${encodeURIComponent('盗肾传说')}`,
    );
  });
  it('Google 走 /search?q=', () => {
    expect(buildSearchUrl('google', '双鱼玉佩')).toBe(
      `https://www.google.com/search?q=${encodeURIComponent('双鱼玉佩')}`,
    );
  });
  it('Bing 走 /search?q=', () => {
    expect(buildSearchUrl('bing', '赵连新')).toBe(
      `https://www.bing.com/search?q=${encodeURIComponent('赵连新')}`,
    );
  });
  it('首尾空格收敛 + 特殊字符编码', () => {
    expect(buildSearchUrl('baidu', '  a&b=c  ')).toBe('https://www.baidu.com/s?wd=a%26b%3Dc');
  });
});

describe('normalizeSearchEngine', () => {
  it('三引擎原样通过', () => {
    expect(normalizeSearchEngine('baidu')).toBe('baidu');
    expect(normalizeSearchEngine('google')).toBe('google');
    expect(normalizeSearchEngine('bing')).toBe('bing');
  });
  it('未知/空值回退百度', () => {
    expect(normalizeSearchEngine('yahoo')).toBe('baidu');
    expect(normalizeSearchEngine(null)).toBe('baidu');
    expect(normalizeSearchEngine(undefined)).toBe('baidu');
  });
});
