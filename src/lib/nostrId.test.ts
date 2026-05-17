import { describe, it, expect } from 'vitest';

import { isNostrId } from './nostrId';

describe('isNostrId', () => {
  it('accepts a valid 64-char lowercase hex string', () => {
    const id = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    expect(isNostrId(id)).toBe(true);
  });

  it('rejects strings shorter than 64 chars', () => {
    expect(isNostrId('deadbeef')).toBe(false);
    expect(isNostrId('a'.repeat(63))).toBe(false);
  });

  it('rejects strings longer than 64 chars', () => {
    expect(isNostrId('a'.repeat(65))).toBe(false);
  });

  it('rejects uppercase hex (Nostr canonicalises to lowercase)', () => {
    expect(isNostrId('A'.repeat(64))).toBe(false);
    expect(isNostrId('79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isNostrId('z'.repeat(64))).toBe(false);
    expect(isNostrId('g'.repeat(64))).toBe(false);
  });

  it('rejects surrounding whitespace', () => {
    const id = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    expect(isNostrId(` ${id}`)).toBe(false);
    expect(isNostrId(`${id} `)).toBe(false);
  });

  it('rejects empty / null / undefined / non-string inputs', () => {
    expect(isNostrId('')).toBe(false);
    expect(isNostrId(undefined)).toBe(false);
    expect(isNostrId(null)).toBe(false);
    expect(isNostrId(123)).toBe(false);
    expect(isNostrId({})).toBe(false);
  });

  it('rejects the malformed length-9 hex string from the original bug report', () => {
    // The crash that started this work: "padded hex string expected, got
    // unpadded hex of length 9".
    expect(isNostrId('123456789')).toBe(false);
  });
});
