import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { optimisticPatchEventTags, rollbackEvent, rollbackQuery, toggleTag } from './optimisticEvent';

/** A cached kind 10003 (bookmark) event with two bookmarks. */
function bookmarkEvent(ids: string[]): NostrEvent {
  return {
    id: 'existing-event-id',
    pubkey: 'user-pubkey',
    created_at: 1000,
    kind: 10003,
    tags: ids.map((id) => ['e', id]),
    content: 'preserved content',
    sig: 'existing-sig',
  };
}

/** Mirror of how the hooks derive boolean state from the cached event. */
function hasTag(event: NostrEvent | null | undefined, name: string, value: string): boolean {
  return (event?.tags ?? []).some(([n, v]) => n === name && v === value);
}

describe('toggleTag', () => {
  it('appends a tag that is not present', () => {
    const result = toggleTag([['e', 'a']], 'e', 'b');
    expect(result).toEqual([['e', 'a'], ['e', 'b']]);
  });

  it('removes a tag that is present', () => {
    const result = toggleTag([['e', 'a'], ['e', 'b']], 'e', 'a');
    expect(result).toEqual([['e', 'b']]);
  });

  it('only matches on both name AND value', () => {
    // Same value, different tag name — must not be removed.
    const result = toggleTag([['e', 'x'], ['p', 'x']], 'e', 'x');
    expect(result).toEqual([['p', 'x']]);
  });

  it('removes every duplicate of the pair', () => {
    const result = toggleTag([['e', 'a'], ['e', 'a']], 'e', 'a');
    expect(result).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [['e', 'a']];
    toggleTag(input, 'e', 'b');
    expect(input).toEqual([['e', 'a']]);
  });

  it('is its own inverse (toggle twice returns to start)', () => {
    const start = [['e', 'a']];
    const once = toggleTag(start, 'e', 'b');
    const twice = toggleTag(once, 'e', 'b');
    expect(twice).toEqual(start);
  });
});

describe('optimisticPatchEventTags', () => {
  const key = ['bookmarks', 'user-pubkey'];

  it('adds a tag to an existing cached event and flips derived state', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, bookmarkEvent(['post-1']));

    expect(hasTag(qc.getQueryData(key), 'e', 'post-2')).toBe(false);

    optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-2'),
    });

    expect(hasTag(qc.getQueryData(key), 'e', 'post-2')).toBe(true);
    expect(hasTag(qc.getQueryData(key), 'e', 'post-1')).toBe(true);
  });

  it('removes a tag from an existing cached event', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, bookmarkEvent(['post-1', 'post-2']));

    optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-1'),
    });

    expect(hasTag(qc.getQueryData(key), 'e', 'post-1')).toBe(false);
    expect(hasTag(qc.getQueryData(key), 'e', 'post-2')).toBe(true);
  });

  it('preserves the rest of the event (content, id, pubkey) when patching', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, bookmarkEvent(['post-1']));

    optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-2'),
    });

    const patched = qc.getQueryData<NostrEvent>(key)!;
    expect(patched.content).toBe('preserved content');
    expect(patched.id).toBe('existing-event-id');
    expect(patched.pubkey).toBe('user-pubkey');
  });

  it('creates a synthetic event when nothing is cached, so state still flips', () => {
    const qc = new QueryClient();
    // Nothing seeded — user has never bookmarked before.
    expect(qc.getQueryData(key)).toBeUndefined();

    optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-1'),
    });

    const created = qc.getQueryData<NostrEvent>(key)!;
    expect(created.kind).toBe(10003);
    expect(created.pubkey).toBe('user-pubkey');
    expect(hasTag(created, 'e', 'post-1')).toBe(true);
  });

  it('returns undefined snapshot when nothing was cached', () => {
    const qc = new QueryClient();
    const snapshot = optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-1'),
    });
    expect(snapshot).toBeUndefined();
  });

  it('returns the prior event as the snapshot when one was cached', () => {
    const qc = new QueryClient();
    const original = bookmarkEvent(['post-1']);
    qc.setQueryData(key, original);

    const snapshot = optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-2'),
    });

    expect(snapshot).toEqual(original);
  });

  it('does not mutate the cached event in place (snapshot stays clean)', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, bookmarkEvent(['post-1']));

    const snapshot = optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-2'),
    });

    // The snapshot must reflect the PRE-patch state, proving no in-place mutation.
    expect(hasTag(snapshot, 'e', 'post-2')).toBe(false);
    expect(snapshot?.tags).toEqual([['e', 'post-1']]);
  });
});

describe('rollbackEvent', () => {
  const key = ['bookmarks', 'user-pubkey'];

  it('restores the exact prior event after a failed optimistic patch', () => {
    const qc = new QueryClient();
    const original = bookmarkEvent(['post-1']);
    qc.setQueryData(key, original);

    const snapshot = optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-2'),
    });

    // Optimistic state applied...
    expect(hasTag(qc.getQueryData(key), 'e', 'post-2')).toBe(true);

    // ...then the publish fails and we roll back.
    rollbackEvent(qc, key, snapshot);

    expect(qc.getQueryData(key)).toEqual(original);
    expect(hasTag(qc.getQueryData(key), 'e', 'post-2')).toBe(false);
  });

  it('restores "no cache" (undefined) when the optimistic add started from nothing', () => {
    const qc = new QueryClient();

    const snapshot = optimisticPatchEventTags(qc, key, {
      kind: 10003,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 'e', 'post-1'),
    });

    // Synthetic event now present.
    expect(hasTag(qc.getQueryData(key), 'e', 'post-1')).toBe(true);

    rollbackEvent(qc, key, snapshot);

    // Back to nothing cached — not a lingering synthetic event.
    expect(qc.getQueryData(key)).toBeUndefined();
  });

  it('round-trips a full add-then-rollback for interest (t) tags too', () => {
    const qc = new QueryClient();
    const key2 = ['interests', 'user-pubkey'];
    const original: NostrEvent = {
      id: 'i', pubkey: 'user-pubkey', created_at: 1, kind: 10015,
      tags: [['t', 'nostr']], content: '', sig: 's',
    };
    qc.setQueryData(key2, original);

    const snapshot = optimisticPatchEventTags(qc, key2, {
      kind: 10015,
      pubkey: 'user-pubkey',
      transform: (tags) => toggleTag(tags, 't', 'bitcoin'),
    });
    expect(hasTag(qc.getQueryData(key2), 't', 'bitcoin')).toBe(true);

    rollbackEvent(qc, key2, snapshot);
    expect(qc.getQueryData(key2)).toEqual(original);
  });
});

describe('rollbackQuery (generic)', () => {
  const key = ['poll-votes', 'evt'];

  it('restores a prior array snapshot', () => {
    const qc = new QueryClient();
    const original = [{ id: 'v1' }];
    qc.setQueryData(key, original);
    qc.setQueryData(key, [{ id: 'v1' }, { id: 'optimistic' }]);

    rollbackQuery(qc, key, original);
    expect(qc.getQueryData(key)).toEqual(original);
  });

  it('removes the query when the snapshot was undefined (cold cache)', () => {
    const qc = new QueryClient();
    // Cold: nothing cached, then an optimistic write seeds it.
    const snapshot = qc.getQueryData(key); // undefined
    qc.setQueryData(key, [{ id: 'optimistic' }]);

    rollbackQuery(qc, key, snapshot);
    // Must NOT leave the optimistic array behind (the setQueryData-undefined no-op trap).
    expect(qc.getQueryData(key)).toBeUndefined();
  });

  it('restores an explicit null snapshot (distinct from undefined)', () => {
    const qc = new QueryClient();
    qc.setQueryData(key, null);
    const snapshot = qc.getQueryData(key); // null
    qc.setQueryData(key, [{ id: 'optimistic' }]);

    rollbackQuery(qc, key, snapshot);
    expect(qc.getQueryData(key)).toBeNull();
  });
});
