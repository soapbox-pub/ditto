import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { emojiPackCoord, emojiPackName } from '@/hooks/useEmojiPacks';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { loadPalette, savePalette } from '@/lib/emojiPalette';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { parseAddr } from '@/lib/parseAddr';

export interface CustomEmoji {
  shortcode: string;
  url: string;
  /**
   * The `30030:pubkey:dtag` coordinate of the pack this emoji came from.
   * Absent for emojis inlined directly on the kind-10030 list. Drives the
   * picker's one-section-per-pack grouping.
   */
  packCoord?: string;
  /** The source pack's human name, resolved at read time for display. */
  packName?: string;
}

// Stable empty: NoteContent keys its emoji map on this, and a fresh `[]` per
// render (logged out, or before the query resolves) rebuilt it every render.
const NO_EMOJIS: CustomEmoji[] = [];

/**
 * Flatten a kind-10030 list plus its resolved kind-30030 packs into a deduped
 * palette. Inline `["emoji", …]` tags on the list and every pack's emoji tags
 * are merged; when the same shortcode maps to different URLs across packs it
 * is prefixed with the pack's `d` tag so both stay reachable.
 */
function paletteFrom(listEvent: NostrEvent, packEvents: NostrEvent[]): CustomEmoji[] {
  interface RawEmoji { shortcode: string; url: string; packId: string; packCoord?: string; packName?: string }
  const raw: RawEmoji[] = [];

  for (const tag of listEvent.tags) {
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      raw.push({ shortcode: tag[1], url: tag[2], packId: '' });
    }
  }
  for (const pack of packEvents) {
    const packId = pack.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const packCoord = emojiPackCoord(pack.pubkey, packId);
    const packName = emojiPackName(pack);
    for (const tag of pack.tags) {
      if (tag[0] === 'emoji' && tag[1] && tag[2]) {
        raw.push({ shortcode: tag[1], url: tag[2], packId, packCoord, packName });
      }
    }
  }

  const urlsByCode = new Map<string, Set<string>>();
  for (const e of raw) {
    let urls = urlsByCode.get(e.shortcode);
    if (!urls) urlsByCode.set(e.shortcode, (urls = new Set()));
    urls.add(e.url);
  }

  // First-seen wins after prefixing.
  const out: CustomEmoji[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const code = urlsByCode.get(e.shortcode)!.size > 1 && e.packId ? `${e.packId}-${e.shortcode}` : e.shortcode;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ shortcode: code, url: e.url, packCoord: e.packCoord, packName: e.packName });
  }
  return out;
}

/** Newest event per addressable coordinate. */
function newestPerCoord(events: NostrEvent[]): NostrEvent[] {
  const newest = new Map<string, NostrEvent>();
  for (const event of events) {
    const coord = emojiPackCoord(event.pubkey, event.tags.find(([n]) => n === 'd')?.[1] ?? '');
    const prev = newest.get(coord);
    if (!prev || event.created_at > prev.created_at) newest.set(coord, event);
  }
  return [...newest.values()];
}

/**
 * The current user's NIP-30 custom emoji palette: inline `['emoji', …]` tags
 * on their kind-10030 list plus every kind-30030 pack it references via
 * `['a', '30030:pubkey:identifier']`.
 *
 * Backed by a durable per-account copy (`@/lib/emojiPalette`) that seeds the
 * query instantly on load. A read only REPLACES it when it produces something
 * (or proves the list genuinely empty): no list, or packs that didn't come
 * back, keep the emojis already seen instead of blanking the picker.
 */
export function useCustomEmojis() {
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { user } = useCurrentUser();

  const query = useQuery({
    queryKey: ['custom-emojis', user?.pubkey ?? ''],
    // Show the durable palette on the first frame; the read below reconciles.
    initialData: () => {
      const stored = user ? loadPalette(user.pubkey) : [];
      return stored.length > 0 ? stored : NO_EMOJIS;
    },
    initialDataUpdatedAt: 0, // still stale, so mount triggers a reconcile
    queryFn: async ({ signal }): Promise<CustomEmoji[]> => {
      if (!user) return NO_EMOJIS;
      const floor = loadPalette(user.pubkey);

      // The local event store is the floor for the list read, so a relay
      // missing or holding an older copy can't shrink the palette.
      const list = await fetchFreshEvent(
        nostr,
        { kinds: [10030], authors: [user.pubkey] },
        { store, signal },
      );
      if (!list) return floor; // list read came up short — keep what we had

      const packRefs = list.tags
        .filter((t) => t[0] === 'a' && t[1])
        .map((t) => parseAddr(t[1]))
        .filter((a): a is NonNullable<typeof a> => !!a && a.kind === 30030);

      let packEvents: NostrEvent[] = [];
      if (packRefs.length > 0) {
        const filters = packRefs.map((ref) => ({
          kinds: [30030],
          authors: [ref.pubkey],
          '#d': [ref.identifier],
          limit: 1,
        }));
        packEvents = newestPerCoord(await nostr.query(filters, { signal }).catch(() => [] as NostrEvent[]));
      }

      const palette = paletteFrom(list, packEvents);

      // Packs the list references but that didn't come back this time keep
      // the emojis we last resolved for them rather than dropping out.
      const resolved = new Set(packEvents.map((p) => emojiPackCoord(p.pubkey, p.tags.find(([n]) => n === 'd')?.[1] ?? '')));
      const missing = new Set(
        packRefs.map((r) => emojiPackCoord(r.pubkey, r.identifier)).filter((c) => !resolved.has(c)),
      );
      if (missing.size > 0) {
        const codes = new Set(palette.map((e) => e.shortcode));
        for (const e of floor) {
          if (e.packCoord && missing.has(e.packCoord) && !codes.has(e.shortcode)) {
            codes.add(e.shortcode);
            palette.push(e);
          }
        }
      }

      // An empty result is only real when the list itself is empty (no inline
      // emojis, no pack refs). Empty DESPITE refs means the pack read came up
      // short — keep the durable floor rather than blank the picker.
      const listIsEmpty = packRefs.length === 0 && !list.tags.some((t) => t[0] === 'emoji' && t[1] && t[2]);
      if (palette.length === 0 && !listIsEmpty) return floor;

      savePalette(user.pubkey, palette);
      return palette.length > 0 ? palette : NO_EMOJIS;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  return {
    emojis: query.data ?? NO_EMOJIS,
    isLoading: query.isLoading,
  };
}
