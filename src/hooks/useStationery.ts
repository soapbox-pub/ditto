import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { COLOR_MOMENT_KIND, THEME_KIND } from '@/lib/letterTypes';
import { DISCOVER_RELAYS } from '@/lib/discoverNetwork';
import { isHiddenFromPublicFeeds } from '@/lib/nsfw';

/**
 * Whose stationery a page shows. `authors` narrows it to those people; with
 * `discover`, they're the Discover network (see `useDiscoverAuthors`), read
 * from the relays that accept that many authors, with NSFW-tagged posts left
 * out. `key` stands in for `authors` in query keys, and `authors: undefined`
 * with `discover` means the network is still loading.
 */
export interface StationeryScope {
  authors?: string[];
  key: string;
  discover?: boolean;
}

const ALL: StationeryScope = { key: 'all' };

/** Validate a color moment event. Returns the event if valid, null otherwise. */
function validateColorMoment(event: NostrEvent): NostrEvent | null {
  if (event.kind !== COLOR_MOMENT_KIND) return null;
  const colorTags = event.tags.filter(([name]) => name === 'c');
  if (colorTags.length < 3 || colorTags.length > 6) return null;
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  if (!colorTags.every(([, color]) => hexColorRegex.test(color))) return null;
  return event;
}

/** Validate a theme event. Returns the event if valid, null otherwise. */
function validateTheme(event: NostrEvent): NostrEvent | null {
  if (event.kind !== THEME_KIND) return null;
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  if (!dTag || !title) return null;
  return event;
}

/** Fetch a page of color moments for stationery infinite scroll */
export function useColorMomentsPage(limit = 24, until?: number, scope: StationeryScope = ALL) {
  const { nostr } = useNostr();
  const { authors, discover } = scope;
  return useQuery({
    queryKey: ['color-moments-page', limit, until, scope.key],
    queryFn: async ({ signal }) => {
      if (discover && !authors?.length) return [];
      const filter = {
        kinds: [COLOR_MOMENT_KIND],
        limit,
        ...(until ? { until } : {}),
        ...(authors && authors.length > 0 ? { authors } : {}),
      };
      const events = await (discover ? nostr.group(DISCOVER_RELAYS) : nostr).query([filter], { signal });
      // Deduplicate by event id
      const seen = new Map<string, NostrEvent>();
      for (const e of events) seen.set(e.id, e);
      return Array.from(seen.values())
        .filter((e): e is NostrEvent => validateColorMoment(e) !== null)
        .filter((e) => !discover || !isHiddenFromPublicFeeds(e))
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !discover || !!authors,
  });
}

/** Fetch a page of themes for stationery infinite scroll */
export function useThemesPage(limit = 24, until?: number, scope: StationeryScope = ALL) {
  const { nostr } = useNostr();
  const { authors, discover } = scope;
  return useQuery({
    queryKey: ['themes-page', limit, until, scope.key],
    queryFn: async ({ signal }) => {
      if (discover && !authors?.length) return [];
      const filter = {
        kinds: [THEME_KIND],
        limit,
        ...(until ? { until } : {}),
        ...(authors && authors.length > 0 ? { authors } : {}),
      };
      const events = await (discover ? nostr.group(DISCOVER_RELAYS) : nostr).query([filter], { signal });
      return events
        .filter((e): e is NostrEvent => validateTheme(e) !== null)
        .filter((e) => !discover || !isHiddenFromPublicFeeds(e))
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !discover || !!authors,
  });
}
