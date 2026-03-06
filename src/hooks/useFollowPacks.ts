import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
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
  const pubkeys = event.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]);
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
