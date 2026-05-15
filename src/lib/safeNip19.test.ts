import { describe, it, expect } from 'vitest';

import {
  tryNaddrEncode,
  tryNeventEncode,
  tryNoteEncode,
  tryNprofileEncode,
  tryNpubEncode,
} from './safeNip19';

const VALID_HEX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const SHORT_HEX = '123456789';

describe('safeNip19 wrappers', () => {
  describe('tryNpubEncode', () => {
    it('encodes a valid pubkey to npub1...', () => {
      const result = tryNpubEncode(VALID_HEX);
      expect(result).toMatch(/^npub1[a-z0-9]+$/);
    });

    it('returns undefined for malformed hex', () => {
      expect(tryNpubEncode(SHORT_HEX)).toBeUndefined();
      expect(tryNpubEncode('')).toBeUndefined();
      expect(tryNpubEncode(null)).toBeUndefined();
      expect(tryNpubEncode(undefined)).toBeUndefined();
    });
  });

  describe('tryNoteEncode', () => {
    it('encodes a valid event id to note1...', () => {
      const result = tryNoteEncode(VALID_HEX);
      expect(result).toMatch(/^note1[a-z0-9]+$/);
    });

    it('returns undefined for malformed hex', () => {
      expect(tryNoteEncode(SHORT_HEX)).toBeUndefined();
    });
  });

  describe('tryNeventEncode', () => {
    it('encodes a valid event id with author', () => {
      const result = tryNeventEncode({ id: VALID_HEX, author: VALID_HEX });
      expect(result).toMatch(/^nevent1[a-z0-9]+$/);
    });

    it('returns undefined if event id is malformed', () => {
      expect(tryNeventEncode({ id: SHORT_HEX, author: VALID_HEX })).toBeUndefined();
    });

    it('drops a malformed author but still encodes the id', () => {
      const result = tryNeventEncode({ id: VALID_HEX, author: SHORT_HEX });
      expect(result).toMatch(/^nevent1[a-z0-9]+$/);
    });
  });

  describe('tryNaddrEncode', () => {
    it('encodes a valid addressable event reference', () => {
      const result = tryNaddrEncode({ kind: 30023, pubkey: VALID_HEX, identifier: 'slug' });
      expect(result).toMatch(/^naddr1[a-z0-9]+$/);
    });

    it('returns undefined if the pubkey is malformed', () => {
      expect(tryNaddrEncode({ kind: 30023, pubkey: SHORT_HEX, identifier: 'slug' })).toBeUndefined();
    });

    it('accepts an empty identifier (replaceable event)', () => {
      const result = tryNaddrEncode({ kind: 3, pubkey: VALID_HEX, identifier: '' });
      expect(result).toMatch(/^naddr1[a-z0-9]+$/);
    });
  });

  describe('tryNprofileEncode', () => {
    it('encodes a valid profile pointer', () => {
      const result = tryNprofileEncode({ pubkey: VALID_HEX });
      expect(result).toMatch(/^nprofile1[a-z0-9]+$/);
    });

    it('returns undefined for malformed pubkey', () => {
      expect(tryNprofileEncode({ pubkey: SHORT_HEX })).toBeUndefined();
    });
  });
});
