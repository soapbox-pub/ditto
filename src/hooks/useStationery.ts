import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { COLOR_MOMENT_KIND, THEME_KIND } from '@/lib/letterTypes';

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

const COLOR_MOMENT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

/** Fetch a page of color moments for stationery infinite scroll */
export function useColorMomentsPage(limit = 24, until?: number, authors?: string[]) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['color-moments-page', limit, until, authors ?? null],
    queryFn: async () => {
      const relay = nostr.group(COLOR_MOMENT_RELAYS);
      const filter = {
        kinds: [COLOR_MOMENT_KIND],
        limit,
        ...(until ? { until } : {}),
        ...(authors && authors.length > 0 ? { authors } : {}),
      };
      const events = await relay.query([filter]);
      // Deduplicate by event id
      const seen = new Map<string, NostrEvent>();
      for (const e of events) seen.set(e.id, e);
      return Array.from(seen.values())
        .filter((e): e is NostrEvent => validateColorMoment(e) !== null)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });
}

/** Fetch a page of themes for stationery infinite scroll */
export function useThemesPage(limit = 24, until?: number, authors?: string[]) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['themes-page', limit, until, authors ?? null],
    queryFn: async () => {
      const filter = {
        kinds: [THEME_KIND],
        limit,
        ...(until ? { until } : {}),
        ...(authors && authors.length > 0 ? { authors } : {}),
      };
      const events = await nostr.query([filter]);
      return events
        .filter((e): e is NostrEvent => validateTheme(e) !== null)
        .sort((a, b) => b.created_at - a.created_at);
    },
  });
}
