import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { parsePeopleList } from './packUtils';

const VALID_PK_1 = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const VALID_PK_2 = '3d842afecd5e293f43b5454df06653008cd0a51a3cf6d39e0d0cb59c19df3ada';

function makeEvent(kind: number, tags: string[][]): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: VALID_PK_1,
    kind,
    tags,
    content: '',
    created_at: 0,
    sig: 'f'.repeat(128),
  };
}

describe('parsePeopleList', () => {
  it('returns only valid 64-char hex pubkeys from p tags', () => {
    // The original crash: a kind 3 with a 9-char `p` tag would propagate
    // up to `nip19.npubEncode` in PeopleAvatarStack and crash the React
    // tree. Verify the parse layer drops it.
    const event = makeEvent(3, [
      ['p', VALID_PK_1],
      ['p', '123456789'],            // malformed — 9 chars
      ['p', VALID_PK_2],
      ['p', ''],                     // malformed — empty
      ['p', VALID_PK_1.toUpperCase()], // malformed — uppercase
    ]);
    const result = parsePeopleList(event);
    expect(result.pubkeys).toEqual([VALID_PK_1, VALID_PK_2]);
  });

  it('returns an empty pubkeys array when no p tags are valid', () => {
    const event = makeEvent(30000, [
      ['d', 'my-list'],
      ['title', 'Some list'],
      ['p', 'not-hex'],
    ]);
    const result = parsePeopleList(event);
    expect(result.pubkeys).toEqual([]);
    // The list metadata (title, etc.) is preserved even when all p tags are bad.
    expect(result.title).toBe('Some list');
  });

  it('parses follow-set metadata correctly', () => {
    const event = makeEvent(30000, [
      ['d', 'pals'],
      ['title', 'Pals'],
      ['description', 'My friends'],
      ['image', 'https://example.com/img.png'],
      ['p', VALID_PK_1],
    ]);
    const result = parsePeopleList(event);
    expect(result.title).toBe('Pals');
    expect(result.description).toBe('My friends');
    expect(result.image).toBe('https://example.com/img.png');
    expect(result.variant).toBe('follow-set');
  });
});
