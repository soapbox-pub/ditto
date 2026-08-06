import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useBookmarks } from './useBookmarks';
import { useNostrPublish } from './useNostrPublish';
import { readPostInteractions, resetPostInteractions } from '@/lib/postInteraction';

/**
 * Where the post-interaction signal actually comes from.
 *
 * The classification rules are unit-tested in `postInteraction.test.ts`; what
 * these pin down is the *timing* — that nothing is reported until the write has
 * genuinely been accepted, and that removing something reports nothing at all.
 * A signal emitted on intent rather than on success would let a failed publish,
 * or an un-bookmark, count as engagement.
 */

const ME = 'a'.repeat(64);
const THEM = 'b'.repeat(64);
const TARGET = 'e'.repeat(64);

let publishShouldFail = false;
let publishedEvents: NostrEvent[] = [];
let bookmarkList: NostrEvent | null = null;

const signEvent = vi.fn(async (template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>) => ({
  ...template,
  id: '1'.repeat(64),
  pubkey: ME,
  sig: 'c'.repeat(128),
}));

const relayEvent = vi.fn(async (event: NostrEvent) => {
  if (publishShouldFail) throw new Error('no relay accepted the event');
  publishedEvents.push(event);
});

vi.mock('@nostrify/react', () => ({
  useNostr: () => ({
    nostr: {
      event: relayEvent,
      query: async () => (bookmarkList ? [bookmarkList] : []),
      req: async function* () {},
    },
  }),
}));
vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: ME, signer: { signEvent } } }),
}));
vi.mock('./useAppContext', () => ({
  useAppContext: () => ({ config: { appName: 'Ditto', clientName: 'Ditto' } }),
}));
vi.mock('@/lib/inboxRelays', () => ({ sendToInboxRelays: async () => {} }));
vi.mock('@/lib/fetchFreshEvent', () => ({
  fetchFreshEvent: async () => bookmarkList,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  resetPostInteractions();
  publishShouldFail = false;
  publishedEvents = [];
  bookmarkList = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('useNostrPublish — reporting interactions', () => {
  it('reports a reaction once the relay has accepted it', async () => {
    const { result } = renderHook(() => useNostrPublish(), { wrapper });

    await result.current.mutateAsync({
      kind: 7,
      content: '❤️',
      tags: [['e', TARGET], ['p', THEM], ['k', '1']],
    } as never);

    await waitFor(() => expect(readPostInteractions()).toHaveLength(1));
    expect(readPostInteractions()[0]).toMatchObject({
      type: 'reaction',
      actorPubkey: ME,
      targetAuthorPubkey: THEM,
    });
  });

  it('reports nothing when the publish fails', async () => {
    // Clicking is not interacting. A reaction the relays rejected did not
    // happen, and the optimistic UI that showed it will roll back.
    publishShouldFail = true;
    const { result } = renderHook(() => useNostrPublish(), { wrapper });

    await expect(
      result.current.mutateAsync({
        kind: 7,
        content: '❤️',
        tags: [['e', TARGET], ['p', THEM]],
      } as never),
    ).rejects.toThrow();

    expect(readPostInteractions()).toHaveLength(0);
  });

  it('reports nothing for the deletion that removes a reaction', async () => {
    const { result } = renderHook(() => useNostrPublish(), { wrapper });

    await result.current.mutateAsync({
      kind: 5,
      content: '',
      tags: [['e', '2'.repeat(64)], ['k', '7']],
    } as never);

    expect(readPostInteractions()).toHaveLength(0);
  });

  it('reports a reply once published', async () => {
    const { result } = renderHook(() => useNostrPublish(), { wrapper });

    await result.current.mutateAsync({
      kind: 1,
      content: 'nice one',
      tags: [['e', TARGET, 'wss://relay', 'root', THEM], ['p', THEM]],
    } as never);

    await waitFor(() => expect(readPostInteractions()[0]?.type).toBe('reply'));
  });

  it('reports a repost once published', async () => {
    const { result } = renderHook(() => useNostrPublish(), { wrapper });

    await result.current.mutateAsync({
      kind: 6,
      content: '',
      tags: [['e', TARGET], ['p', THEM]],
    } as never);

    await waitFor(() => expect(readPostInteractions()[0]?.type).toBe('repost'));
  });
});

describe('useBookmarks — reporting saves', () => {
  function bookmarkEvent(ids: string[]): NostrEvent {
    return {
      id: '9'.repeat(64),
      pubkey: ME,
      kind: 10003,
      created_at: 1_700_000_000,
      content: '',
      tags: ids.map((id) => ['e', id]),
      sig: 'c'.repeat(128),
    };
  }

  it('reports a save once the bookmark list has been published', async () => {
    const { result } = renderHook(() => useBookmarks(), { wrapper });

    await result.current.toggleBookmark.mutateAsync({
      eventId: TARGET,
      authorPubkey: THEM,
    });

    await waitFor(() => expect(readPostInteractions()).toHaveLength(1));
    expect(readPostInteractions()[0]).toMatchObject({
      type: 'bookmark',
      targetEventId: TARGET,
      targetAuthorPubkey: THEM,
    });
    // Bookmarks are not local-only: a real kind 10003 went out.
    expect(publishedEvents.at(-1)?.kind).toBe(10003);
  });

  it('reports nothing when un-bookmarking', async () => {
    // Removing republishes the same list with one fewer tag — indistinguishable
    // downstream, which is exactly why the difference is decided here.
    bookmarkList = bookmarkEvent([TARGET]);
    const { result } = renderHook(() => useBookmarks(), { wrapper });

    await result.current.toggleBookmark.mutateAsync({
      eventId: TARGET,
      authorPubkey: THEM,
    });

    expect(readPostInteractions()).toHaveLength(0);
  });

  it('reports nothing when the bookmark write fails', async () => {
    publishShouldFail = true;
    const { result } = renderHook(() => useBookmarks(), { wrapper });

    await expect(
      result.current.toggleBookmark.mutateAsync({ eventId: TARGET, authorPubkey: THEM }),
    ).rejects.toThrow();

    expect(readPostInteractions()).toHaveLength(0);
  });

  it('reports nothing when the caller cannot name the post’s author', async () => {
    // Without an author there is no way to tell whose post this is, and a
    // signal that cannot answer that is worse than no signal.
    const { result } = renderHook(() => useBookmarks(), { wrapper });

    await result.current.toggleBookmark.mutateAsync({ eventId: TARGET });

    expect(readPostInteractions()).toHaveLength(0);
  });
});
