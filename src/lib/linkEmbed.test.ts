import { describe, it, expect } from 'vitest';

import {
  extractArchiveOrgId,
  extractRedditPost,
  extractSpotifyEmbed,
  extractTweetId,
  extractYouTubeId,
} from './linkEmbed';

describe('link embed extractors', () => {
  it('accept https links', () => {
    expect(extractRedditPost('https://www.reddit.com/r/nostr/comments/abc123/hi')).not.toBeNull();
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it.each([
    ['reddit', () => extractRedditPost('javascript://reddit.com/r/a/comments/abc%0Aalert(1)')],
    ['youtube', () => extractYouTubeId('javascript://youtu.be/abc')],
    ['twitter', () => extractTweetId('javascript://x.com/a/status/1')],
    ['spotify', () => extractSpotifyEmbed('javascript://open.spotify.com/track/abc')],
    ['archive.org', () => extractArchiveOrgId('javascript://archive.org/details/abc')],
  ])('reject a javascript: URL dressed up as %s', (_name, extract) => {
    expect(extract()).toBeNull();
  });
});
