import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { parseRepostContent } from './feedUtils';

const attackerKey = generateSecretKey();
const victimKey = generateSecretKey();
const victimPubkey = getPublicKey(victimKey);

/** A genuine note by the victim. */
function victimNote(content = 'a real note'): NostrEvent {
  return finalizeEvent(
    { kind: 1, content, tags: [], created_at: Math.floor(Date.now() / 1000) - 60 },
    victimKey,
  );
}

/** A kind-6 repost, honestly signed by the attacker, wrapping `embedded`. */
function repostOf(embedded: unknown, targetId?: string): NostrEvent {
  const content = JSON.stringify(embedded);
  return finalizeEvent(
    {
      kind: 6,
      content,
      tags: [['e', targetId ?? ''], ['p', victimPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    },
    attackerKey,
  );
}

describe('parseRepostContent', () => {
  it('returns a genuinely signed embedded event', () => {
    const note = victimNote();
    const parsed = parseRepostContent(repostOf(note, note.id));
    expect(parsed?.id).toBe(note.id);
    expect(parsed?.pubkey).toBe(victimPubkey);
  });

  it('drops an embedded event with a garbage signature', () => {
    // The reported attack: the outer repost is validly signed by the attacker
    // and passes the relay verifier, while the embedded JSON claims any
    // identity at all and carries a signature nobody ever checked.
    const forged = { ...victimNote(), content: 'FORGED', sig: '0'.repeat(128) };
    expect(parseRepostContent(repostOf(forged))).toBeUndefined();
  });

  it('drops an embedded event whose id is not the hash of its content', () => {
    // Setting the id to a real note's id shadows that note in the
    // ['event', id] query cache for the rest of the session.
    const real = victimNote('the genuine text');
    const shadow = { ...victimNote('substituted text'), id: real.id };
    expect(parseRepostContent(repostOf(shadow, real.id))).toBeUndefined();
  });

  it('drops an embedded event signed by a different key than it claims', () => {
    const note = victimNote();
    const impostor = { ...note, pubkey: getPublicKey(attackerKey) };
    expect(parseRepostContent(repostOf(impostor))).toBeUndefined();
  });

  it('drops malformed payloads instead of throwing', () => {
    // A non-array `tags` used to reach shouldHideFeedEvent inside the feed's
    // own useMemo — above NoteCard's error boundary — and blank the route.
    const cases: unknown[] = [
      { ...victimNote(), tags: 'not-an-array' },
      { ...victimNote(), tags: [['e', 1]] },
      { ...victimNote(), content: 42 },
      { ...victimNote(), created_at: 'soon' },
      { ...victimNote(), id: 'short' },
      { ...victimNote(), pubkey: undefined },
      { id: 'x', pubkey: 'y', kind: 1 },
      'a bare string',
      null,
      42,
    ];
    for (const value of cases) {
      expect(() => parseRepostContent(repostOf(value))).not.toThrow();
      expect(parseRepostContent(repostOf(value))).toBeUndefined();
    }
  });

  it('returns undefined for empty or unparseable content', () => {
    const bare = finalizeEvent(
      { kind: 6, content: '', tags: [], created_at: Math.floor(Date.now() / 1000) },
      attackerKey,
    );
    expect(parseRepostContent(bare)).toBeUndefined();

    const notJson = finalizeEvent(
      { kind: 6, content: '{oops', tags: [], created_at: Math.floor(Date.now() / 1000) },
      attackerKey,
    );
    expect(parseRepostContent(notJson)).toBeUndefined();
  });
});
