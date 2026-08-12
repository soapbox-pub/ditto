import { describe, expect, it } from 'vitest';

import { wikimediaImageUrl } from '@/lib/wikimedia';

/** A real thumbnail URL as returned by the Wikimedia REST summary API. */
const THUMB =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Portrait_assis_de_l%27empereur_Ming_Chengzu.jpg/330px-Portrait_assis_de_l%27empereur_Ming_Chengzu.jpg';

/** Width of the file behind {@link THUMB}. */
const ORIGINAL_WIDTH = 13737;

/** Pull the requested width back out of a rewritten URL. */
function widthOf(url: string | undefined): number | undefined {
  const match = /\/(\d+)px-/.exec(url ?? '');
  return match ? Number(match[1]) : undefined;
}

describe('wikimediaImageUrl', () => {
  it('rounds up to a width Wikimedia will render', () => {
    // Anything off the `$wgThumbnailSteps` list is rejected with a 400, so
    // these must land on a step even though none of the targets is one.
    expect(widthOf(wikimediaImageUrl(THUMB, 640, ORIGINAL_WIDTH))).toBe(960);
    expect(widthOf(wikimediaImageUrl(THUMB, 1024, ORIGINAL_WIDTH))).toBe(1280);
    expect(widthOf(wikimediaImageUrl(THUMB, 100, ORIGINAL_WIDTH))).toBe(120);
  });

  it('keeps a target that is already a step', () => {
    expect(widthOf(wikimediaImageUrl(THUMB, 960, ORIGINAL_WIDTH))).toBe(960);
    expect(widthOf(wikimediaImageUrl(THUMB, 500, ORIGINAL_WIDTH))).toBe(500);
  });

  it('never asks for more pixels than the file has', () => {
    // 400px wide original: 960 would be an upscale, so fall back to 330.
    expect(widthOf(wikimediaImageUrl(THUMB, 960, 400))).toBe(330);
  });

  it('leaves the URL alone when the file is tinier than every step', () => {
    expect(wikimediaImageUrl(THUMB, 960, 8)).toBe(THUMB);
  });

  it('caps a target above the largest step', () => {
    expect(widthOf(wikimediaImageUrl(THUMB, 99_999, ORIGINAL_WIDTH))).toBe(3840);
  });

  it('preserves the rest of the URL, including the query', () => {
    const withQuery = `${THUMB}?utm_source=en.wikipedia.org&utm_campaign=api`;
    const result = wikimediaImageUrl(withQuery, 960, ORIGINAL_WIDTH);

    expect(result).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Portrait_assis_de_l%27empereur_Ming_Chengzu.jpg/960px-Portrait_assis_de_l%27empereur_Ming_Chengzu.jpg?utm_source=en.wikipedia.org&utm_campaign=api',
    );
  });

  it('passes through anything it cannot resize', () => {
    const original =
      'https://upload.wikimedia.org/wikipedia/commons/8/83/Portrait_assis_de_l%27empereur_Ming_Chengzu.jpg';
    const foreign = 'https://example.com/330px-Foo.jpg';

    expect(wikimediaImageUrl(original, 960)).toBe(original);
    expect(wikimediaImageUrl(foreign, 960)).toBe(foreign);
    expect(wikimediaImageUrl('not a url', 960)).toBe('not a url');
    expect(wikimediaImageUrl(undefined, 960)).toBeUndefined();
  });
});
