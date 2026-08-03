import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { emojiPackCoord, KIND_EMOJI_SET, KIND_USER_EMOJIS } from '@/hooks/useEmojiPacks';
import { parseAddr } from '@/lib/parseAddr';

/** The pack a custom emoji came from — enough to name it and add it. */
export interface EmojiSource {
  /** `30030:pubkey:dtag`. */
  coord: string;
  /** The pack's human name. */
  name: string;
  /** Pack author, for the add mutation. */
  pubkey: string;
  /** The pack's `d` identifier, for the add mutation. */
  identifier: string;
}

/** How many discovery packs to scan when resolving an emoji's origin. */
const DISCOVERY_PACK_LIMIT = 500;

/** The pack's human name. Clients disagree on `title` vs `name`; try both. */
function packName(event: NostrEvent): string {
  return (
    event.tags.find((t) => t[0] === 'title')?.[1] ||
    event.tags.find((t) => t[0] === 'name')?.[1] ||
    event.tags.find((t) => t[0] === 'd')?.[1] ||
    'Emoji pack'
  );
}

/**
 * Index kind-30030 packs by emoji image URL, so the pack behind a reaction's
 * custom emoji can be named without a fresh round-trip per emoji.
 *
 * A reaction tag carries only `["emoji", code, url]` — no pack reference — and
 * relays can't be filtered by emoji URL, so we cast a wide-but-bounded net: a
 * discovery read of recent packs, plus the packs the current user has actually
 * referenced (so their own emojis always resolve). Newest event per coordinate
 * wins; the first pack to claim a URL keeps it, so an emoji copied into a later
 * pack doesn't reattribute the original.
 */
function usePackIndex() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['emoji-pack-index', user?.pubkey ?? ''],
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<Map<string, EmojiSource>> => {
      const discovery = await nostr
        .query([{ kinds: [KIND_EMOJI_SET], limit: DISCOVERY_PACK_LIMIT }], { signal })
        .catch(() => [] as NostrEvent[]);

      // The user's own referenced packs, resolved so their emojis are always
      // attributable even if the discovery read didn't surface them.
      let ownPacks: NostrEvent[] = [];
      if (user) {
        const lists = await nostr
          .query([{ kinds: [KIND_USER_EMOJIS], authors: [user.pubkey], limit: 1 }], { signal })
          .catch(() => [] as NostrEvent[]);
        const refs = (lists[0]?.tags ?? [])
          .filter((t) => t[0] === 'a' && t[1])
          .map((t) => parseAddr(t[1]))
          .filter((a): a is NonNullable<typeof a> => !!a && a.kind === KIND_EMOJI_SET);
        if (refs.length > 0) {
          const filters = refs.map((r) => ({
            kinds: [KIND_EMOJI_SET],
            authors: [r.pubkey],
            '#d': [r.identifier],
            limit: 1,
          }));
          ownPacks = await nostr.query(filters, { signal }).catch(() => [] as NostrEvent[]);
        }
      }

      // Newest event per coordinate wins, so a renamed/edited pack resolves to
      // its current name rather than whichever revision arrived first.
      const newest = new Map<string, NostrEvent>();
      for (const ev of [...discovery, ...ownPacks]) {
        const identifier = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const coord = emojiPackCoord(ev.pubkey, identifier);
        const prev = newest.get(coord);
        if (!prev || ev.created_at > prev.created_at) newest.set(coord, ev);
      }

      const index = new Map<string, EmojiSource>();
      for (const [coord, ev] of newest) {
        const identifier = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
        const source: EmojiSource = { coord, name: packName(ev), pubkey: ev.pubkey, identifier };
        for (const t of ev.tags) {
          if (t[0] === 'emoji' && t[2] && !index.has(t[2])) index.set(t[2], source);
        }
      }
      return index;
    },
  });
}

/**
 * Resolve which NIP-30 pack a custom emoji came from, for a "from <pack>" line
 * and its Add button. Returns `undefined` for a URL whose pack we've simply
 * never seen — a reaction is never guessed at.
 */
export function useEmojiSource(url: string | undefined): EmojiSource | undefined {
  const { data: index } = usePackIndex();
  return useMemo(() => (url ? index?.get(url) : undefined), [url, index]);
}
