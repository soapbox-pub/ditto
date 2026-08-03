import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { isNostrId } from '@/lib/nostrId';
import { updatePeopleListDetailTags, type PeopleListDetails } from '@/lib/packUtils';
import type { NostrEvent } from '@nostrify/nostrify';

export interface FollowPack {
  /** d-tag identifier */
  id: string;
  title: string;
  pubkeys: string[];
  /** The underlying Nostr event (needed for re-publishing mutations) */
  event: NostrEvent;
}

function parsePackEvent(event: NostrEvent): FollowPack {
  const id = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  const title = event.tags.find((t) => t[0] === 'title')?.[1]
    || event.tags.find((t) => t[0] === 'name')?.[1]
    || 'Untitled Pack';
  // Drop malformed pubkeys so downstream nip19 encoders stay safe.
  const pubkeys = event.tags
    .filter((t) => t[0] === 'p' && t[1])
    .map((t) => t[1])
    .filter(isNostrId);
  return { id, title, pubkeys, event };
}

export function useFollowPacks() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['own-follow-packs', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [39089], authors: [user.pubkey], limit: 100 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) },
      );
      const byId = new Map<string, NostrEvent>();
      for (const event of events) {
        const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
        const existing = byId.get(d);
        if (!existing || event.created_at > existing.created_at) byId.set(d, event);
      }
      return Array.from(byId.values()).map(parsePackEvent);
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

/**
 * Mutations for the current user's own Follow Packs (kind 39089).
 *
 * All mutations follow the read-modify-write pattern: fetch the freshest
 * version of the pack from relays (`fetchFreshEvent`), modify its tags, and
 * republish with `prev` so `published_at` is preserved. After a successful
 * publish, the detail-page cache (`['addr-event', 39089, …]`) is updated in
 * place and the own-packs list is invalidated.
 */
export function useFollowPackActions() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  /** Fetch the freshest version of one of the user's packs from relays. */
  async function fetchFreshPack(packId: string): Promise<NostrEvent> {
    if (!user) throw new Error('Must be logged in');
    const prev = await fetchFreshEvent(nostr, {
      kinds: [39089],
      authors: [user.pubkey],
      '#d': [packId],
    });
    if (!prev) throw new Error('Pack not found');
    return prev;
  }

  /** Sync caches after a successful pack publish. */
  function syncCaches(packId: string, published: NostrEvent): void {
    queryClient.setQueryData<NostrEvent | null>(
      ['addr-event', 39089, user?.pubkey ?? '', packId],
      published,
    );
    queryClient.invalidateQueries({ queryKey: ['own-follow-packs', user?.pubkey] });
  }

  /** Add a pubkey to a pack (no-op if already a member). */
  const addToPack = useMutation({
    mutationFn: async ({ packId, pubkey }: { packId: string; pubkey: string }) => {
      const prev = await fetchFreshPack(packId);
      if (prev.tags.some(([n, pk]) => n === 'p' && pk === pubkey)) return;
      const published = await publishEvent({
        kind: 39089,
        content: prev.content,
        tags: [...prev.tags, ['p', pubkey]],
        prev,
      });
      syncCaches(packId, published);
    },
  });

  /** Remove a pubkey from a pack. */
  const removeFromPack = useMutation({
    mutationFn: async ({ packId, pubkey }: { packId: string; pubkey: string }) => {
      const prev = await fetchFreshPack(packId);
      const published = await publishEvent({
        kind: 39089,
        content: prev.content,
        tags: prev.tags.filter(([n, pk]) => !(n === 'p' && pk === pubkey)),
        prev,
      });
      syncCaches(packId, published);
    },
  });

  /** Update a pack's title / description / image. */
  const updatePack = useMutation({
    mutationFn: async ({ packId, ...details }: { packId: string } & PeopleListDetails) => {
      const prev = await fetchFreshPack(packId);
      const published = await publishEvent({
        kind: 39089,
        content: prev.content,
        tags: updatePeopleListDetailTags(prev.tags, details),
        prev,
      });
      syncCaches(packId, published);
    },
  });

  return { addToPack, removeFromPack, updatePack };
}
