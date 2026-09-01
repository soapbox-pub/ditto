import { describe, expect, it } from 'vitest';

import { stripTrackingParams, stripTrackingParamsInText } from './trackingParams';

describe('stripTrackingParams', () => {
  it('strips the YouTube share identifier', () => {
    expect(stripTrackingParams('https://youtu.be/dQw4w9WgXcQ?si=aBcDeFgHiJkL')).toBe(
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(
      stripTrackingParams('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=xyz&feature=shared'),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('keeps YouTube parameters that change what is played', () => {
    expect(
      stripTrackingParams('https://youtu.be/dQw4w9WgXcQ?t=42&si=abc'),
    ).toBe('https://youtu.be/dQw4w9WgXcQ?t=42');
    expect(
      stripTrackingParams(
        'https://www.youtube.com/watch?v=abc&list=PLxyz&index=3&pp=iAQB',
      ),
    ).toBe('https://www.youtube.com/watch?v=abc&list=PLxyz&index=3');
  });

  it('strips click and campaign ids on any host', () => {
    expect(stripTrackingParams('https://example.com/a?fbclid=123')).toBe('https://example.com/a');
    expect(
      stripTrackingParams('https://blog.example.org/post?utm_source=x&utm_medium=y&id=7'),
    ).toBe('https://blog.example.org/post?id=7');
    expect(stripTrackingParams('https://shop.test/p?gclid=1&msclkid=2&ttclid=3')).toBe(
      'https://shop.test/p',
    );
  });

  it('leaves a URL alone when no rule fires', () => {
    const clean = 'https://example.com/path?page=2&q=hello%20world';
    expect(stripTrackingParams(clean)).toBe(clean);
  });

  it('preserves the original encoding of surviving parameters', () => {
    // URLSearchParams would round-trip `%20` to `+` and re-escape the comma.
    expect(
      stripTrackingParams('https://example.com/s?q=a%20b%2Cc&utm_source=news'),
    ).toBe('https://example.com/s?q=a%20b%2Cc');
  });

  it('keeps the fragment', () => {
    expect(stripTrackingParams('https://example.com/doc?utm_source=x#section-2')).toBe(
      'https://example.com/doc#section-2',
    );
    expect(stripTrackingParams('https://example.com/doc#a?utm_source=x')).toBe(
      'https://example.com/doc#a?utm_source=x',
    );
  });

  it('applies host rules only on their own host', () => {
    // `s`/`t` are trackers on x.com but ordinary parameters elsewhere.
    expect(stripTrackingParams('https://x.com/user/status/123?s=20&t=abc')).toBe(
      'https://x.com/user/status/123',
    );
    expect(stripTrackingParams('https://example.com/f?s=20&t=abc')).toBe(
      'https://example.com/f?s=20&t=abc',
    );
    // `source` is meaningful on many sites, tracking on Medium.
    expect(stripTrackingParams('https://medium.com/@a/post-1?source=rss')).toBe(
      'https://medium.com/@a/post-1',
    );
    expect(stripTrackingParams('https://example.com/x?source=rss')).toBe(
      'https://example.com/x?source=rss',
    );
  });

  it('matches subdomains of a ruled host', () => {
    expect(stripTrackingParams('https://music.youtube.com/watch?v=abc&si=xyz')).toBe(
      'https://music.youtube.com/watch?v=abc',
    );
    expect(stripTrackingParams('https://open.spotify.com/track/abc?si=xyz')).toBe(
      'https://open.spotify.com/track/abc',
    );
  });

  it('canonicalizes an Amazon product link to its ASIN', () => {
    expect(
      stripTrackingParams(
        'https://www.amazon.com/Some-Product-Name/dp/B08N5WRWNW/ref=sr_1_3?keywords=thing&qid=1699999999&sr=8-3',
      ),
    ).toBe('https://www.amazon.com/dp/B08N5WRWNW');
    expect(
      stripTrackingParams('https://www.amazon.co.uk/gp/product/B08N5WRWNW?th=1&psc=1'),
    ).toBe('https://www.amazon.co.uk/dp/B08N5WRWNW');
  });

  it('leaves an Amazon search alone apart from its tracking parameters', () => {
    expect(
      stripTrackingParams('https://www.amazon.com/s?k=headphones&crid=ABC&sprefix=head'),
    ).toBe('https://www.amazon.com/s?k=headphones');
  });

  it('strips Google result bookkeeping on any ccTLD', () => {
    expect(
      stripTrackingParams('https://www.google.co.uk/search?q=nostr&ved=2ahUKEwi&ei=abc&sxsrf=xyz'),
    ).toBe('https://www.google.co.uk/search?q=nostr');
    // Not Google, despite the substring.
    expect(stripTrackingParams('https://notgoogle.example/x?ved=1')).toBe(
      'https://notgoogle.example/x?ved=1',
    );
  });

  it('ignores non-http(s) and unparseable input', () => {
    expect(stripTrackingParams('wss://relay.example.com/?utm_source=x')).toBe(
      'wss://relay.example.com/?utm_source=x',
    );
    expect(stripTrackingParams('not a url ?utm_source=x')).toBe('not a url ?utm_source=x');
  });

  it('matches parameter names case-insensitively', () => {
    expect(stripTrackingParams('https://example.com/a?UTM_Source=x&FBCLID=1&keep=2')).toBe(
      'https://example.com/a?keep=2',
    );
  });

  it('drops a value-less tracking parameter and the leftover query marker', () => {
    expect(stripTrackingParams('https://example.com/a?fbclid')).toBe('https://example.com/a');
  });
});

describe('stripTrackingParamsInText', () => {
  it('cleans every URL in a note body', () => {
    expect(
      stripTrackingParamsInText(
        'watch this https://youtu.be/abc?si=1 and this https://example.com/x?utm_source=y',
      ),
    ).toBe('watch this https://youtu.be/abc and this https://example.com/x');
  });

  it('returns the text unchanged when nothing is stripped', () => {
    const text = 'plain text with https://example.com/clean?page=2';
    expect(stripTrackingParamsInText(text)).toBe(text);
    expect(stripTrackingParamsInText('no links at all')).toBe('no links at all');
  });

  it('keeps sentence punctuation outside the URL', () => {
    expect(stripTrackingParamsInText('see https://youtu.be/abc?si=1.')).toBe(
      'see https://youtu.be/abc.',
    );
    expect(stripTrackingParamsInText('(https://youtu.be/abc?si=1)')).toBe(
      '(https://youtu.be/abc)',
    );
  });

  it('keeps a closing paren that belongs to the URL', () => {
    expect(
      stripTrackingParamsInText(
        'https://en.wikipedia.org/wiki/Ditto_(Pok%C3%A9mon)?utm_source=x',
      ),
    ).toBe('https://en.wikipedia.org/wiki/Ditto_(Pok%C3%A9mon)');
  });

  it('leaves a markdown image URL delimiter intact', () => {
    expect(stripTrackingParamsInText('![alt](https://example.com/i.png?utm_source=x)')).toBe(
      '![alt](https://example.com/i.png)',
    );
  });

  it('does not disturb newlines or surrounding text', () => {
    expect(
      stripTrackingParamsInText('line one\nhttps://youtu.be/abc?si=1\nline three'),
    ).toBe('line one\nhttps://youtu.be/abc\nline three');
  });

  it('leaves skipped URLs byte-for-byte', () => {
    // An uploaded attachment is matched to its imeta tag by exact string.
    const upload = 'https://blossom.example/abc.jpg?utm_source=x';
    expect(stripTrackingParamsInText(`caption ${upload}`, new Set([upload]))).toBe(
      `caption ${upload}`,
    );
    expect(stripTrackingParamsInText(`caption ${upload}`)).toBe(
      'caption https://blossom.example/abc.jpg',
    );
  });
});
