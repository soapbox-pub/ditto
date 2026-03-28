import { describe, expect, it } from 'vitest';
import { buildTagFilterValues } from '@/lib/tagFilterValues';

describe('buildTagFilterValues', () => {
  it('returns unique hashtag case variants', () => {
    expect(buildTagFilterValues('HOWDONOSTR', '#t')).toEqual(['HOWDONOSTR', 'howdonostr']);
    expect(buildTagFilterValues('howdonostr', '#t')).toEqual(['howdonostr', 'HOWDONOSTR']);
    expect(buildTagFilterValues('HowDoNostr', '#t')).toEqual(['HowDoNostr', 'howdonostr', 'HOWDONOSTR']);
  });

  it('returns exact value for non-hashtag filters', () => {
    expect(buildTagFilterValues('u4pruydqqvj', '#g')).toEqual(['u4pruydqqvj']);
  });

  it('trims and ignores empty input', () => {
    expect(buildTagFilterValues('  HOWDONOSTR  ', '#t')).toEqual(['HOWDONOSTR', 'howdonostr']);
    expect(buildTagFilterValues('   ', '#t')).toEqual([]);
  });
});
