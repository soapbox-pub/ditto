import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { parseAddr } from '@/lib/parseAddr';

/** NIP-30 emoji set (a shareable pack). */
export const KIND_EMOJI_SET = 30030;

/** NIP-51 user emoji list (references packs + inline emojis). */
export const KIND_USER_EMOJIS = 10030;

/** The addressable coordinate of an emoji pack: `30030:pubkey:dtag`. */
export function emojiPackCoord(pubkey: string, identifier: string): string {
  return `${KIND_EMOJI_SET}:${pubkey}:${identifier}`;
}

/** The pack's human name. Clients disagree on `title` vs `name`; try both. */
export function emojiPackName(event: NostrEvent): string {
  return (
    event.tags.find((t) => t[0] === 'title')?.[1] ||
    event.tags.find((t) => t[0] === 'name')?.[1] ||
    event.tags.find((t) => t[0] === 'd')?.[1] ||
    'Emoji pack'
  );
}

/** The pack's cover image (`image` or `picture` tag), if any. */
export function emojiPackPicture(event: NostrEvent): string | undefined {
  return (
    event.tags.find((t) => t[0] === 'image')?.[1] ||
    event.tags.find((t) => t[0] === 'picture')?.[1] ||
    undefined
  );
}

/** Extract the `["emoji", shortcode, url]` mappings from a kind 30030 event. */
export function emojiPackEntries(event: NostrEvent): { shortcode: string; url: string }[] {
  return event.tags
    .filter((t) => t[0] === 'emoji' && t[1] && t[2])
    .map((t) => ({ shortcode: t[1], url: t[2] }));
}

/**
 * Whether the current user's kind 10030 emoji list already references the pack
 * at `coord` (`30030:pubkey:dtag`). Read-only; shares the `emoji-list` cache
 * so it flips as soon as a pack is added or removed elsewhere.
 */
export function useHasEmojiPack(coord: string | undefined): boolean {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ['emoji-list', user?.pubkey],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [KIND_USER_EMOJIS], authors: [user.pubkey], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return useMemo(() => {
    if (!coord || !data) return false;
    return data.tags.some(([n, v]) => n === 'a' && v === coord);
  }, [coord, data]);
}

/**
 * Add a NIP-30 emoji pack (kind 30030) to the current user's emoji list
 * (kind 10030) by appending its `["a", "30030:pubkey:dtag"]` coordinate.
 *
 * The freshest list is fetched first (read-modify-write via `fetchFreshEvent`)
 * so we append rather than clobber it, and `published_at`/other tags are
 * preserved by passing the fetched event as `prev`. Already-referenced packs
 * are a no-op. On success the emoji-list, palette, and pack-index caches are
 * invalidated so the pack's emojis become usable immediately.
 */
export function useAddEmojiPack(): UseMutationResult<
  void,
  Error,
  { pubkey: string; identifier: string }
> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pubkey, identifier }) => {
      if (!user) throw new Error('Sign in to add an emoji pack.');

      const coord = emojiPackCoord(pubkey, identifier);

      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_USER_EMOJIS],
        authors: [user.pubkey],
      });

      // Preserve inline emojis and every other referenced pack.
      const existing = prev?.tags.filter(([n]) => n === 'emoji' || n === 'a') ?? [];
      if (existing.some(([n, v]) => n === 'a' && v === coord)) return; // already added

      await publishEvent({
        kind: KIND_USER_EMOJIS,
        content: prev?.content ?? '',
        tags: [...existing, ['a', coord]],
        prev: prev ?? undefined,
      });

      queryClient.invalidateQueries({ queryKey: ['emoji-list'] });
      queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
      queryClient.invalidateQueries({ queryKey: ['emoji-pack-index'] });
      queryClient.invalidateQueries({ queryKey: ['my-emoji-packs'] });
    },
  });
}

/** A pack referenced by the user's kind-10030 list, with its resolved event. */
export interface MyEmojiPack {
  /** The `30030:pubkey:dtag` coordinate from the user's list. */
  coord: string;
  /** The resolved kind-30030 event, or null if it couldn't be fetched. */
  event: NostrEvent | null;
}

/**
 * The emoji packs the current user has added — their kind-10030 `["a", …]`
 * refs resolved to the kind-30030 events, for a management UI. Packs whose set
 * didn't load are still returned (`event: null`) so they can be listed and
 * removed by coordinate.
 */
export function useMyEmojiPacks(): UseQueryResult<MyEmojiPack[]> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-emoji-packs', user?.pubkey ?? ''],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<MyEmojiPack[]> => {
      if (!user) return [];

      const lists = await nostr.query(
        [{ kinds: [KIND_USER_EMOJIS], authors: [user.pubkey], limit: 1 }],
        { signal },
      );
      const list = lists[0];
      if (!list) return [];

      const refs = list.tags
        .filter((t) => t[0] === 'a' && t[1])
        .map((t) => ({ coord: t[1], addr: parseAddr(t[1]) }))
        .filter((r): r is { coord: string; addr: NonNullable<ReturnType<typeof parseAddr>> } =>
          !!r.addr && r.addr.kind === KIND_EMOJI_SET);
      if (refs.length === 0) return [];

      const filters = refs.map((r) => ({
        kinds: [KIND_EMOJI_SET],
        authors: [r.addr.pubkey],
        '#d': [r.addr.identifier],
        limit: 1,
      }));
      const packEvents = await nostr.query(filters, { signal }).catch(() => [] as NostrEvent[]);

      // Newest event per coordinate wins.
      const byCoord = new Map<string, NostrEvent>();
      for (const ev of packEvents) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const coord = emojiPackCoord(ev.pubkey, d);
        const existing = byCoord.get(coord);
        if (!existing || ev.created_at > existing.created_at) byCoord.set(coord, ev);
      }

      return refs.map((r) => ({ coord: r.coord, event: byCoord.get(r.coord) ?? null }));
    },
  });
}

/**
 * The emoji packs the current user has *published* (authored kind-30030
 * events), newest per coordinate. Distinct from {@link useMyEmojiPacks}, which
 * returns packs *added* to the user's list — a pack can be one, the other, or
 * both.
 */
export function useMyPublishedPacks(): UseQueryResult<MyEmojiPack[]> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['my-published-packs', user?.pubkey ?? ''],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<MyEmojiPack[]> => {
      if (!user) return [];

      const events = await nostr.query(
        [{ kinds: [KIND_EMOJI_SET], authors: [user.pubkey], limit: 100 }],
        { signal },
      );

      // Newest event per coordinate wins.
      const byCoord = new Map<string, NostrEvent>();
      for (const ev of events) {
        const d = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const coord = emojiPackCoord(ev.pubkey, d);
        const existing = byCoord.get(coord);
        if (!existing || ev.created_at > existing.created_at) byCoord.set(coord, ev);
      }

      return Array.from(byCoord.entries())
        .map(([coord, event]) => ({ coord, event }))
        .sort((a, b) => (b.event?.created_at ?? 0) - (a.event?.created_at ?? 0));
    },
  });
}

/**
 * Remove a NIP-30 emoji pack from the current user's kind-10030 list by
 * stripping its `["a", "30030:pubkey:dtag"]` coordinate. Read-modify-write via
 * `fetchFreshEvent` + `prev`, so inline emojis and every other referenced pack
 * are preserved. A no-op when the pack isn't referenced.
 */
export function useRemoveEmojiPack(): UseMutationResult<void, Error, { coord: string }> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ coord }) => {
      if (!user) throw new Error('Sign in to manage emoji packs.');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_USER_EMOJIS],
        authors: [user.pubkey],
      });
      if (!prev) return; // nothing to remove
      if (!prev.tags.some(([n, v]) => n === 'a' && v === coord)) return; // not referenced

      const tags = prev.tags.filter((t) => !(t[0] === 'a' && t[1] === coord));

      await publishEvent({ kind: KIND_USER_EMOJIS, content: prev.content, tags, prev });

      queryClient.invalidateQueries({ queryKey: ['emoji-list'] });
      queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
      queryClient.invalidateQueries({ queryKey: ['emoji-pack-index'] });
      queryClient.invalidateQueries({ queryKey: ['my-emoji-packs'] });
    },
  });
}
