import { describe, expect, it } from 'vitest';

import { blossomAlternatives, mediaCandidates } from './blossomFallback';

const HASH = 'a'.repeat(64);
const SERVERS = ['https://a.example/', 'https://b.example/', 'https://c.example/'];

describe('blossomAlternatives', () => {
  it('returns the same blob on every other server for a content-addressed URL', () => {
    expect(blossomAlternatives(`https://a.example/${HASH}`, SERVERS)).toEqual([
      `https://b.example/${HASH}`,
      `https://c.example/${HASH}`,
    ]);
  });

  it('keeps the extension and query, and excludes the source origin', () => {
    expect(blossomAlternatives(`https://b.example/${HASH}.png?x=1`, SERVERS)).toEqual([
      `https://a.example/${HASH}.png?x=1`,
      `https://c.example/${HASH}.png?x=1`,
    ]);
  });

  it('dedupes servers by origin and skips unparseable ones', () => {
    expect(
      blossomAlternatives(`https://a.example/${HASH}`, ['https://B.EXAMPLE///', 'https://b.example/', 'not a url']),
    ).toEqual([`https://b.example/${HASH}`]);
  });

  it('returns [] for a non-content-addressed URL', () => {
    expect(blossomAlternatives('https://a.example/photo.png', SERVERS)).toEqual([]);
  });

  it('returns [] for an unparseable URL', () => {
    expect(blossomAlternatives('not a url', SERVERS)).toEqual([]);
  });
});

/**
 * The order a media reference is walked, and what is allowed into that walk
 * at all: sender-declared `fallback` entries come straight off an untrusted
 * event, and every candidate ends up in an `<img src>` or a `fetch`.
 */
describe('mediaCandidates', () => {
  const PRIMARY = `https://one.example/${HASH}`;

  it('starts with the primary URL', () => {
    expect(mediaCandidates(PRIMARY, undefined, [])[0]).toBe(PRIMARY);
  });

  it('puts declared fallbacks ahead of derived Blossom mirrors', () => {
    expect(mediaCandidates(PRIMARY, ['https://declared.example/blob'], ['https://mirror.example'])).toEqual([
      PRIMARY,
      'https://declared.example/blob',
      `https://mirror.example/${HASH}`,
    ]);
  });

  it('drops a `javascript:` fallback and a plain-http one', () => {
    expect(mediaCandidates(PRIMARY, ['javascript:alert(1)', 'http://other.example/blob'], [])).toEqual([PRIMARY]);
  });

  it('does not repeat a source', () => {
    expect(
      mediaCandidates(PRIMARY, [PRIMARY, 'https://other.example/blob', 'https://other.example/blob'], []),
    ).toEqual([PRIMARY, 'https://other.example/blob']);
  });

  it('leaves a non-content-addressed URL with no derived mirrors', () => {
    const url = 'https://one.example/photo.jpg';
    expect(mediaCandidates(url, undefined, ['https://mirror.example'])).toEqual([url]);
  });
});
