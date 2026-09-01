import { describe, expect, it } from 'vitest';

import { parseFirstImeta, parseImetaEntries, parseImetaMap } from '@/lib/imeta';

const ENCRYPTED_TAG = [
  'imeta',
  'url https://blossom.example/ciphertexthash',
  'm image/jpeg',
  'x ciphertexthash',
  'ox plaintexthash',
  'dim 1280x720',
  'encryption-algorithm aes-gcm',
  'decryption-key deadbeef',
  'decryption-nonce cafebabe',
  'fallback https://mirror.example/ciphertexthash',
  'fallback https://other.example/ciphertexthash',
];

describe('parseImetaEntries', () => {
  it('parses the encryption fields', () => {
    const [entry] = parseImetaEntries([ENCRYPTED_TAG]);
    expect(entry.encryption).toEqual({
      algorithm: 'aes-gcm',
      key: 'deadbeef',
      nonce: 'cafebabe',
      // `ox` is the plaintext hash — what we verify after decrypting. `x`
      // describes the ciphertext and is not our business here.
      hash: 'plaintexthash',
      mime: 'image/jpeg',
      fallbacks: [
        'https://mirror.example/ciphertexthash',
        'https://other.example/ciphertexthash',
      ],
    });
  });

  it('collects repeated fallback fields instead of overwriting them', () => {
    const [entry] = parseImetaEntries([ENCRYPTED_TAG]);
    expect(entry.fallbacks).toHaveLength(2);
  });

  it('leaves encryption undefined for an ordinary attachment', () => {
    const [entry] = parseImetaEntries([[
      'imeta',
      'url https://blossom.example/abc',
      'm image/png',
      'blurhash abc123',
    ]]);
    expect(entry.encryption).toBeUndefined();
    expect(entry.blurhash).toBe('abc123');
  });

  it('reads the thumbnail from `image`, falling back to `thumb`', () => {
    const [fromImage] = parseImetaEntries([['imeta', 'url https://a.example/1', 'image https://a.example/t']]);
    const [fromThumb] = parseImetaEntries([['imeta', 'url https://a.example/1', 'thumb https://a.example/t']]);
    expect(fromImage.thumbnail).toBe('https://a.example/t');
    expect(fromThumb.thumbnail).toBe('https://a.example/t');
  });

  it('keeps values containing spaces intact', () => {
    const [entry] = parseImetaEntries([['imeta', 'url https://a.example/1', 'alt a red barn at dusk']]);
    expect(entry.alt).toBe('a red barn at dusk');
  });

  it('preserves order and skips entries with no url', () => {
    const entries = parseImetaEntries([
      ['imeta', 'm image/png'],
      ['imeta', 'url https://a.example/1'],
      ['imeta', 'url https://a.example/2'],
      ['p', 'not-an-imeta-tag'],
    ]);
    expect(entries.map((e) => e.url)).toEqual(['https://a.example/1', 'https://a.example/2']);
  });

  it('ignores malformed fields with no space separator', () => {
    const [entry] = parseImetaEntries([['imeta', 'url https://a.example/1', 'garbage']]);
    expect(entry.url).toBe('https://a.example/1');
  });
});

describe('parseImetaMap', () => {
  it('keys entries by url and carries encryption through', () => {
    const map = parseImetaMap([ENCRYPTED_TAG]);
    expect(map.get('https://blossom.example/ciphertexthash')?.encryption?.key).toBe('deadbeef');
  });
});

describe('parseFirstImeta', () => {
  it('returns the first entry', () => {
    const entry = parseFirstImeta([
      ['imeta', 'url https://a.example/1'],
      ['imeta', 'url https://a.example/2'],
    ]);
    expect(entry?.url).toBe('https://a.example/1');
  });

  it('returns undefined when there are no imeta tags', () => {
    expect(parseFirstImeta([['p', 'abc']])).toBeUndefined();
  });
});
