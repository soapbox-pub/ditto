import { describe, expect, it } from 'vitest';

import { highlightExternalSource } from './highlightSource';

describe('highlightExternalSource', () => {
  it('prefers an i tag holding any URI over r', () => {
    expect(highlightExternalSource([['r', 'https://a.example/'], ['i', 'https://b.example/']])).toBe('https://b.example/');
    expect(highlightExternalSource([['i', 'isbn:9780765382030'], ['r', 'A book']])).toBe('isbn:9780765382030');
  });

  it('skips i tags that are not URIs', () => {
    expect(highlightExternalSource([['i', '#topic'], ['i', 'not a uri'], ['r', 'https://a.example/']])).toBe('https://a.example/');
  });

  it('falls back to r, which may be text, preferring source and skipping mention', () => {
    expect(highlightExternalSource([['r', 'https://m.example/', 'mention'], ['r', 'Some book, p. 12']])).toBe('Some book, p. 12');
    expect(highlightExternalSource([['r', 'https://x.example/'], ['r', 'https://s.example/', 'source']])).toBe('https://s.example/');
    expect(highlightExternalSource([['r', 'https://m.example/', 'mention'], ['e', 'x']])).toBeUndefined();
  });
});
