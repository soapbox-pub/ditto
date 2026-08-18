import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { useDebounce } from '@/hooks/useDebounce';
import { encodeEventAddress, type NAddr, type NEvent } from '@/lib/encodeEvent';
import { NSITE_NAMED_KIND, NSITE_ROOT_KIND } from '@/lib/nsiteSubdomain';

/** Result kinds searched alongside profiles in the global search dropdown. */
export type SearchEventKind = 'article' | 'list' | 'follow-pack' | 'emoji-pack' | 'nsite' | 'app';

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

/** NIP-89 handler information — the app/DVM announcement kind. */
const APP_HANDLER_KIND = 31990;

/** Longform and list-shaped content, ranked against each other. */
const CONTENT_KINDS = [ARTICLE_KIND, LIST_KIND, EMOJI_PACK_KIND, FOLLOW_PACK_KIND];

/**
 * Software: NIP-5A nsite manifests and NIP-89 handlers.
 *
 * Snapshots (kind 5128) are deliberately excluded — they're point-in-time
 * versions of a site that's already in this list, so including them would
 * fill the dropdown with duplicates of the same site.
 */
const APP_KINDS = [NSITE_ROOT_KIND, NSITE_NAMED_KIND, APP_HANDLER_KIND];

function classify(kind: number): SearchEventKind | null {
  if (kind === ARTICLE_KIND) return 'article';
  if (kind === LIST_KIND) return 'list';
  if (kind === EMOJI_PACK_KIND) return 'emoji-pack';
  if (kind === FOLLOW_PACK_KIND) return 'follow-pack';
  if (kind === NSITE_ROOT_KIND || kind === NSITE_NAMED_KIND) return 'nsite';
  if (kind === APP_HANDLER_KIND) return 'app';
  return null;
}

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Shown when an event carries neither a title tag nor a usable name. */
const FALLBACK_TITLES: Record<SearchEventKind, string> = {
  'article': 'Untitled',
  'list': 'Untitled list',
  'follow-pack': 'Untitled Pack',
  'emoji-pack': 'Untitled pack',
  'nsite': 'Untitled site',
  'app': 'Untitled app',
};

/**
 * Types whose `d` tag is a human-meaningful slug (`nostube`, `moot-feeds`)
 * worth showing when the event has no title tag. Article `d` tags are usually
 * opaque timestamps, so articles fall straight through to the placeholder.
 */
const D_TAG_TITLE_TYPES: ReadonlySet<SearchEventKind> = new Set<SearchEventKind>([
  'list',
  'emoji-pack',
  'nsite',
  'app',
]);

/** Whether a kind is addressable (30000-39999) and thus keyed by its `d` tag. */
function isAddressableKind(kind: number): boolean {
  return kind >= 30000 && kind < 40000;
}

/**
 * NIP-89 handlers carry their metadata as a kind-0-shaped JSON object in
 * `content` rather than in tags. Parse it defensively: the content is
 * attacker-controlled and frequently absent, malformed, or not an object.
 */
function parseHandlerMetadata(content: string): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed JSON — fall back to tags.
  }
  return {};
}

/** Read a string field from parsed handler metadata, ignoring non-string values. */
function getString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value ? value : undefined;
}

function parseEvent(event: NostrEvent): SearchEventResult | null {
  const type = classify(event.kind);
  if (!type) return null;

  // Addressable kinds need a d-tag to build a stable naddr route. Replaceable
  // kinds (a root nsite is kind 15128) are addressed by kind+pubkey alone, so
  // requiring one here would drop every root site.
  const dTag = getTag(event, 'd');
  if (isAddressableKind(event.kind) && !dTag) return null;

  const metadata = type === 'app' ? parseHandlerMetadata(event.content) : {};

  const fallbackTitle = (D_TAG_TITLE_TYPES.has(type) && dTag) || FALLBACK_TITLES[type];

  const title = getTag(event, 'title') || getTag(event, 'name') ||
    getString(metadata, 'name') || getString(metadata, 'display_name') ||
    fallbackTitle;

  const description = getTag(event, 'summary') || getTag(event, 'description') ||
    getString(metadata, 'about');

  const image = getTag(event, 'image') || getTag(event, 'thumb') || getTag(event, 'banner') ||
    getString(metadata, 'picture');

  // event.pubkey is Nostrify-validated hex, so encodeEventAddress is safe.
  const addr: NAddr | NEvent = encodeEventAddress(event);

  return { type, title, description, image, path: `/${addr}`, event };
}

/**
 * Interleave results round-robin by type, preserving each type's relevance order.
 *
 * The dropdown renders only the first handful of results, and NIP-50 relevance
 * ranking is dominated by whichever kind has the most indexed events — in
 * practice articles, by a wide margin. Without interleaving, sites and apps are
 * fetched and ranked correctly but never survive the slice.
 */
function interleaveByType(results: SearchEventResult[]): SearchEventResult[] {
  const buckets = new Map<SearchEventKind, SearchEventResult[]>();
  for (const result of results) {
    const bucket = buckets.get(result.type);
    if (bucket) {
      bucket.push(result);
    } else {
      buckets.set(result.type, [result]);
    }
  }

  const lists = [...buckets.values()];
  const depth = Math.max(0, ...lists.map((list) => list.length));
  const interleaved: SearchEventResult[] = [];

  for (let i = 0; i < depth; i++) {
    for (const list of lists) {
      if (i < list.length) interleaved.push(list[i]);
    }
  }

  return interleaved;
}

/**
 * Search for articles (kind 30023), NIP-51 follow sets (kind 30000), emoji
 * sets/packs (kind 30030), follow packs (kind 39089), NIP-5A nsites (kinds
 * 15128 and 35128), and NIP-89 app handlers (kind 31990) by title/name using
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

      // Two filters in one REQ rather than one filter listing every kind:
      // relays apply `limit` per filter, and a combined filter's relevance
      // ranking hands the entire limit to articles, so sites and apps never
      // come back at all. Both filters carry `search`, so the pool still
      // routes the whole subscription to the search relays.
      const searchTerm = `${search} autocomplete:true sort:top`;
      const events = await nostr.query(
        [
          { kinds: CONTENT_KINDS, search: searchTerm, limit: 12 },
          { kinds: APP_KINDS, search: searchTerm, limit: 8 },
        ],
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

      return interleaveByType(Array.from(seen.values()));
    },
    enabled: debouncedQuery.trim().length >= 1,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });
}
