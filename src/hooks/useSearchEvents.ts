import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useDebounce } from '@/hooks/useDebounce';
import { encodeEventAddress, type NAddr, type NEvent } from '@/lib/encodeEvent';

/** Result kinds searched alongside profiles in the global search dropdown. */
export type SearchEventKind = 'article' | 'list' | 'follow-pack' | 'emoji-pack';

export interface SearchEventResult {
  /** Classification used to pick an icon and label. */
  type: SearchEventKind;
  /** Human-readable title (never empty — falls back to a sensible default). */
  title: string;
  /** Optional description / summary. */
  description?: string;
  /** Optional cover image URL. */
  image?: string;
  /** Path to navigate to (an naddr-based route). */
  path: string;
  /** The underlying Nostr event. */
  event: NostrEvent;
}

/** Article (NIP-23), NIP-51 follow set, emoji set, and follow-pack kinds. */
const ARTICLE_KIND = 30023;
const LIST_KIND = 30000;
const EMOJI_PACK_KIND = 30030;
const FOLLOW_PACK_KIND = 39089;

const SEARCH_KINDS = [ARTICLE_KIND, LIST_KIND, EMOJI_PACK_KIND, FOLLOW_PACK_KIND];

function classify(kind: number): SearchEventKind | null {
  if (kind === ARTICLE_KIND) return 'article';
  if (kind === LIST_KIND) return 'list';
  if (kind === EMOJI_PACK_KIND) return 'emoji-pack';
  if (kind === FOLLOW_PACK_KIND) return 'follow-pack';
  return null;
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

function parseEvent(event: NostrEvent): SearchEventResult | null {
  const type = classify(event.kind);
  if (!type) return null;

  // Addressable kinds require a d-tag to build a stable naddr route.
  const dTag = getTag(event, 'd');
  if (!dTag) return null;

  const fallbackTitle = type === 'follow-pack'
    ? 'Untitled Pack'
    : type === 'emoji-pack'
      ? dTag
      : type === 'list'
        ? dTag
        : 'Untitled';
  const title = getTag(event, 'title') || getTag(event, 'name') || fallbackTitle;
  const description = getTag(event, 'summary') || getTag(event, 'description');
  const image = getTag(event, 'image') || getTag(event, 'thumb') || getTag(event, 'banner');

  // event.pubkey is Nostrify-validated hex, so encodeEventAddress is safe.
  const addr: NAddr | NEvent = encodeEventAddress(event);

  return { type, title, description, image, path: `/${addr}`, event };
}

/**
 * Search for articles (kind 30023), NIP-51 follow sets (kind 30000), emoji
 * sets/packs (kind 30030), and follow packs (kind 39089) by title/name using
 * NIP-50 search.
 *
 * Mirrors {@link useSearchProfiles}: internal 300ms debounce, the same
 * `autocomplete:true` NIP-50 token to prefer name-shaped prefix matching,
 * and `placeholderData` so results don't flicker between keystrokes.
 */
export function useSearchEvents(query: string) {
  const { nostr } = useNostr();
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<SearchEventResult[]>({
    queryKey: ['search-events', debouncedQuery],
    queryFn: async ({ signal }) => {
      const search = debouncedQuery.trim();
      if (!search) return [];

      const events = await nostr.query(
        [{ kinds: SEARCH_KINDS, search: `${search} autocomplete:true`, limit: 12 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      // Deduplicate by addressable coordinate (kind:pubkey:d), keeping newest.
      const seen = new Map<string, SearchEventResult>();
      for (const event of events) {
        const result = parseEvent(event);
        if (!result) continue;
        const dTag = getTag(event, 'd') ?? '';
        const coord = `${event.kind}:${event.pubkey}:${dTag}`;
        const existing = seen.get(coord);
        if (!existing || event.created_at > existing.event.created_at) {
          seen.set(coord, result);
        }
      }

      return Array.from(seen.values());
    },
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}
