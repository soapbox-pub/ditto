import { describe, expect, it } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseMusicTrack } from '@/lib/musicHelpers';
import { parsePodcastEpisode, parsePodcastTrailer } from '@/lib/podcastHelpers';

const KEY = 'aa'.repeat(32);
const NONCE = 'bb'.repeat(12);

function event(tags: string[][], kind = 36787): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: 'e'.repeat(64),
    created_at: 0,
    kind,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

/** An `imeta` tag with the encryption fields the NIP-94 proposal defines. */
function encryptedImeta(extra: string[] = []): string[] {
  return [
    'imeta',
    'url https://media.example/song.mp3',
    'm audio/mpeg',
    'encryption-algorithm aes-gcm',
    `decryption-key ${KEY}`,
    `decryption-nonce ${NONCE}`,
    ...extra,
  ];
}

describe('parseMusicTrack encryption', () => {
  it('carries the imeta encryption params onto the track', () => {
    const parsed = parseMusicTrack(event([encryptedImeta(), ['title', 'Song']]));

    expect(parsed?.url).toBe('https://media.example/song.mp3');
    expect(parsed?.encryption).toMatchObject({ algorithm: 'aes-gcm', key: KEY, nonce: NONCE });
  });

  it('leaves an unencrypted track without encryption params', () => {
    const parsed = parseMusicTrack(event([
      ['imeta', 'url https://media.example/song.mp3', 'm audio/mpeg'],
    ]));

    expect(parsed?.encryption).toBeUndefined();
  });

  it('does not apply imeta params to a URL from a bare `url` tag', () => {
    // The imeta entry has no URL of its own, so the `url` tag it fell back to
    // is a different blob and the key doesn't describe it.
    const parsed = parseMusicTrack(event([
      ['imeta', 'm audio/mpeg', 'encryption-algorithm aes-gcm', `decryption-key ${KEY}`, `decryption-nonce ${NONCE}`],
      ['url', 'https://other.example/song.mp3'],
    ]));

    expect(parsed?.url).toBe('https://other.example/song.mp3');
    expect(parsed?.encryption).toBeUndefined();
  });

  it('encrypts the thumbnail under the same key, minus the file-specific fields', () => {
    const parsed = parseMusicTrack(event([
      encryptedImeta(['thumb https://media.example/cover.jpg', `ox ${'c'.repeat(64)}`]),
    ]));

    expect(parsed?.artwork).toBe('https://media.example/cover.jpg');
    expect(parsed?.artworkEncryption).toEqual({ algorithm: 'aes-gcm', key: KEY, nonce: NONCE });
    // `ox` and `m` describe the audio file, not the cover.
    expect(parsed?.artworkEncryption?.hash).toBeUndefined();
    expect(parsed?.artworkEncryption?.mime).toBeUndefined();
  });

  it('does not encrypt artwork that came from a standalone image tag', () => {
    const parsed = parseMusicTrack(event([
      encryptedImeta(),
      ['image', 'https://cdn.example/cover.jpg'],
    ]));

    expect(parsed?.artwork).toBe('https://cdn.example/cover.jpg');
    expect(parsed?.artworkEncryption).toBeUndefined();
  });
});

describe('parsePodcastEpisode encryption', () => {
  it('carries the imeta encryption params when the audio comes from imeta', () => {
    const parsed = parsePodcastEpisode(event([encryptedImeta(), ['title', 'Ep 1']], 30054));

    expect(parsed?.audioUrl).toBe('https://media.example/song.mp3');
    expect(parsed?.encryption).toMatchObject({ algorithm: 'aes-gcm', key: KEY, nonce: NONCE });
  });

  it('does not apply imeta params to an `audio` tag pointing elsewhere', () => {
    const parsed = parsePodcastEpisode(event([
      encryptedImeta(),
      ['audio', 'https://other.example/ep1.mp3', 'audio/mpeg'],
    ], 30054));

    expect(parsed?.audioUrl).toBe('https://other.example/ep1.mp3');
    expect(parsed?.encryption).toBeUndefined();
  });

  it('encrypts an imeta thumbnail when no image tag overrides it', () => {
    const parsed = parsePodcastEpisode(event([
      encryptedImeta(['thumb https://media.example/cover.jpg']),
    ], 30054));

    expect(parsed?.artwork).toBe('https://media.example/cover.jpg');
    expect(parsed?.artworkEncryption).toEqual({ algorithm: 'aes-gcm', key: KEY, nonce: NONCE });
  });
});

describe('parsePodcastTrailer encryption', () => {
  it('carries the imeta encryption params', () => {
    const parsed = parsePodcastTrailer(event([encryptedImeta()], 30055));

    expect(parsed?.encryption).toMatchObject({ algorithm: 'aes-gcm', key: KEY, nonce: NONCE });
  });
});
