import { describe, it, expect } from 'vitest';
import { getBlobbiMouthAnchor } from './mouthAnchor';

describe('getBlobbiMouthAnchor', () => {
  it('returns baby mouth ratios with visual offset', () => {
    const result = getBlobbiMouthAnchor('baby');
    expect(result.xRatio).toBe(0.5);
    expect(result.yRatio).toBeCloseTo(68 / 100 + 0.12, 5);
  });

  it('returns correct ratio for a high-mouth adult (leafy)', () => {
    const result = getBlobbiMouthAnchor('adult', 'leafy');
    expect(result.xRatio).toBe(0.5);
    expect(result.yRatio).toBeCloseTo(100 / 200 + 0.12, 5);
  });

  it('returns correct ratio for a low-mouth adult (mushie)', () => {
    const result = getBlobbiMouthAnchor('adult', 'mushie');
    expect(result.xRatio).toBe(0.5);
    expect(result.yRatio).toBeCloseTo(153 / 200 + 0.12, 5);
  });

  it('returns fallback for egg stage', () => {
    const result = getBlobbiMouthAnchor('egg');
    expect(result).toEqual({ xRatio: 0.5, yRatio: 0.75 });
  });

  it('returns fallback for unknown adult type', () => {
    const result = getBlobbiMouthAnchor('adult', 'unknownform');
    expect(result).toEqual({ xRatio: 0.5, yRatio: 0.75 });
  });

  it('returns fallback for adult with no adultType', () => {
    const result = getBlobbiMouthAnchor('adult');
    expect(result).toEqual({ xRatio: 0.5, yRatio: 0.75 });
  });
});
