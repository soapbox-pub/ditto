import { describe, it, expect, beforeEach } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  classifyPublishedInteraction,
  emitPostInteraction,
  interactionKey,
  readPostInteractions,
  resetPostInteractions,
  subscribePostInteractions,
} from './postInteraction';

/**
 * The rules that decide what a published event *was*.
 *
 * These matter more than they look: every consumer downstream trusts
 * `targetAuthorPubkey` to answer "was this somebody else's post". Getting it
 * from the wrong tag — the author of the reply rather than of the post being
 * replied to, or a bystander copied onto a thread's `p` tags — would let a user
 * satisfy an interaction rule by talking to themselves.
 */

const ME = 'a'.repeat(64);
const THEM = 'b'.repeat(64);
const TARGET = 'e'.repeat(64);
const ROOT = 'f'.repeat(64);

function event(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: '1'.repeat(64),
    pubkey: ME,
    kind: 1,
    created_at: 1_700_000_000,
    content: '',
    tags: [],
    sig: 'c'.repeat(128),
    ...overrides,
  };
}

describe('classifyPublishedInteraction — reactions', () => {
  it('classifies a kind 7 reaction and names the reacted post’s author', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 7, content: '❤️', tags: [['e', TARGET], ['p', THEM], ['k', '1']] }),
    );
    expect(result).toMatchObject({
      type: 'reaction',
      actorPubkey: ME,
      targetEventId: TARGET,
      targetAuthorPubkey: THEM,
    });
  });

  it('reports a reaction to the user’s own post faithfully, for the consumer to judge', () => {
    // Ownership is mission policy, not a fact about what happened — see the
    // module docs. What happened is a reaction; who it was aimed at is data.
    const result = classifyPublishedInteraction(
      event({ kind: 7, tags: [['e', TARGET], ['p', ME]] }),
    );
    expect(result?.targetAuthorPubkey).toBe(ME);
  });

  it('ignores a reaction with no target', () => {
    expect(classifyPublishedInteraction(event({ kind: 7, tags: [['p', THEM]] }))).toBeUndefined();
  });

  it('ignores the kind 5 deletion that removes a reaction', () => {
    // Un-reacting publishes a deletion. Undoing something is not doing it.
    expect(
      classifyPublishedInteraction(event({ kind: 5, tags: [['e', TARGET], ['k', '7']] })),
    ).toBeUndefined();
  });
});

describe('classifyPublishedInteraction — reposts', () => {
  it('classifies a kind 6 repost', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 6, tags: [['e', TARGET, 'wss://relay'], ['p', THEM]] }),
    );
    expect(result).toMatchObject({ type: 'repost', targetEventId: TARGET, targetAuthorPubkey: THEM });
  });

  it('classifies a kind 16 generic repost', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 16, tags: [['e', TARGET], ['p', THEM], ['k', '30023']] }),
    );
    expect(result?.type).toBe('repost');
  });

  it('classifies a quote post as sharing', () => {
    // `RepostMenu` offers "Repost" and "Quote post" as two ways to do the same
    // thing, so both count. A quote is a root note, so it can also satisfy the
    // separate "post something" task — two tasks recognising one action, and
    // neither can complete twice.
    const result = classifyPublishedInteraction(
      event({ kind: 1, tags: [['q', TARGET, 'wss://relay', THEM]] }),
    );
    expect(result).toMatchObject({ type: 'repost', targetEventId: TARGET, targetAuthorPubkey: THEM });
  });

  it('reads the author from an addressable quote coordinate', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 1, tags: [['q', `30023:${THEM}:my-article`, 'wss://relay']] }),
    );
    expect(result?.targetAuthorPubkey).toBe(THEM);
  });

  it('ignores an ordinary root note', () => {
    expect(classifyPublishedInteraction(event({ kind: 1, content: 'hello' }))).toBeUndefined();
  });
});

describe('classifyPublishedInteraction — replies', () => {
  it('classifies a NIP-10 reply to a top-level note', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 1, tags: [['e', TARGET, 'wss://relay', 'root', THEM], ['p', THEM]] }),
    );
    expect(result).toMatchObject({ type: 'reply', targetEventId: TARGET, targetAuthorPubkey: THEM });
  });

  it('targets the direct parent, not the thread root, in a nested reply', () => {
    // The mission asks "did you engage with someone" — with the person you
    // actually answered, not whoever happened to start the thread.
    const result = classifyPublishedInteraction(
      event({
        kind: 1,
        tags: [
          ['e', ROOT, 'wss://relay', 'root', 'd'.repeat(64)],
          ['e', TARGET, 'wss://relay', 'reply', THEM],
          ['p', 'd'.repeat(64)],
          ['p', THEM],
        ],
      }),
    );
    expect(result).toMatchObject({ targetEventId: TARGET, targetAuthorPubkey: THEM });
  });

  it('classifies a NIP-22 kind 1111 comment', () => {
    const result = classifyPublishedInteraction(
      event({
        kind: 1111,
        tags: [
          ['E', TARGET],
          ['K', '30023'],
          ['P', THEM],
          ['e', TARGET],
          ['k', '30023'],
          ['p', THEM],
        ],
      }),
    );
    expect(result).toMatchObject({ type: 'reply', targetEventId: TARGET, targetAuthorPubkey: THEM });
  });

  it('classifies voice replies (kinds 1222 and 1244)', () => {
    for (const kind of [1222, 1244]) {
      const result = classifyPublishedInteraction(
        event({ kind, tags: [['e', TARGET, 'wss://relay', 'root', THEM], ['p', THEM]] }),
      );
      expect(result?.type).toBe('reply');
    }
  });

  it('falls back to a p tag when the reply tag carries no author hint', () => {
    const result = classifyPublishedInteraction(
      event({ kind: 1, tags: [['e', TARGET], ['p', THEM]] }),
    );
    expect(result?.targetAuthorPubkey).toBe(THEM);
  });

  it('never names the replier as the target author', () => {
    // Only the user's own pubkey is available: with no way to know whose post
    // this answers, reporting nothing beats reporting a self-interaction.
    const result = classifyPublishedInteraction(
      event({ kind: 1, tags: [['e', TARGET], ['p', ME]] }),
    );
    expect(result).toBeUndefined();
  });
});

describe('classifyPublishedInteraction — non-interactions', () => {
  it.each([
    ['a profile update', 0],
    ['a follow list', 3],
    ['a bookmark list', 10003],
    ['encrypted settings', 30078],
  ])('ignores %s', (_label, kind) => {
    expect(
      classifyPublishedInteraction(event({ kind, tags: [['e', TARGET], ['p', THEM]] })),
    ).toBeUndefined();
  });
});

describe('the interaction store', () => {
  beforeEach(resetPostInteractions);

  const base = {
    type: 'reaction' as const,
    actorPubkey: ME,
    targetEventId: TARGET,
    targetAuthorPubkey: THEM,
  };

  it('records an emitted interaction', () => {
    emitPostInteraction(base);
    expect(readPostInteractions()).toHaveLength(1);
    expect(readPostInteractions()[0]).toMatchObject(base);
  });

  it('deduplicates the same logical interaction', () => {
    emitPostInteraction(base);
    emitPostInteraction({ ...base, publishedEventId: 'different' });
    expect(readPostInteractions()).toHaveLength(1);
  });

  it('treats swapping one reaction for another on the same post as the same engagement', () => {
    // Two kind 7s are published, but the user has engaged with that one post
    // once. Counting the replacement as new engagement would be a lie.
    expect(interactionKey(base)).toBe(interactionKey({ ...base, publishedEventId: 'x' }));
  });

  it('treats a different action on the same post as a distinct interaction', () => {
    emitPostInteraction(base);
    emitPostInteraction({ ...base, type: 'bookmark' });
    expect(readPostInteractions()).toHaveLength(2);
  });

  it('keeps the snapshot identity stable when nothing is emitted', () => {
    emitPostInteraction(base);
    const first = readPostInteractions();
    emitPostInteraction(base); // deduped, so nothing changes
    expect(readPostInteractions()).toBe(first);
  });

  it('rejects malformed signals rather than storing them', () => {
    emitPostInteraction({ ...base, targetAuthorPubkey: 'not-a-pubkey' });
    emitPostInteraction({ ...base, targetEventId: '' });
    emitPostInteraction({ ...base, actorPubkey: 'nope' });
    expect(readPostInteractions()).toHaveLength(0);
  });

  it('notifies subscribers exactly once per new interaction', () => {
    let calls = 0;
    emitPostInteraction(base);
    const unsubscribe = subscribePostInteractions(() => {
      calls += 1;
    });
    emitPostInteraction(base); // deduped
    expect(calls).toBe(0);
    emitPostInteraction({ ...base, type: 'reply' });
    expect(calls).toBe(1);
    unsubscribe();
  });
});
