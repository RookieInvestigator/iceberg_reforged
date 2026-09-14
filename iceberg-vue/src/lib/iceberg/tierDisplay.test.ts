import { describe, expect, it } from 'vitest';
import { cnNum, tierDisplayName, totalTiersText } from './tierDisplay';

describe('cnNum', () => {
  it('1–10', () => {
    expect(['一', '二', '三', '四', '五', '六', '七', '八', '九'].map((_, i) => cnNum(i + 1)).join('')).toBe('一二三四五六七八九');
  });
  it('十位数', () => {
    expect(cnNum(10)).toBe('十');
    expect(cnNum(11)).toBe('十一');
    expect(cnNum(20)).toBe('二十');
    expect(cnNum(25)).toBe('二十五');
  });
  it('非法回退', () => {
    expect(cnNum(0)).toBe('0');
    expect(cnNum(100)).toBe('100');
  });
});

describe('tierDisplayName', () => {
  it('层级 N → 第N层', () => {
    expect(tierDisplayName('层级 1')).toBe('第一层');
    expect(tierDisplayName('层级 8')).toBe('第八层');
  });
  it('非标准名原样返回', () => {
    expect(tierDisplayName('深渊')).toBe('深渊');
    expect(tierDisplayName('')).toBe('');
  });
});

describe('totalTiersText', () => {
  it('共八层', () => {
    expect(totalTiersText(8)).toBe('共八层');
  });
});
