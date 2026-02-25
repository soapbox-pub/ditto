import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { THEME_DEFINITION_KIND, parseThemeDefinition, type ThemeDefinition } from '@/lib/themeEvent';

/**
 * Query all kind 33891 theme definitions published by a given user.
 * Also queries kind 5 deletion events to filter out deleted themes.
 * Returns an array of parsed ThemeDefinition objects, sorted newest first.
 */
export function useUserThemes(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ThemeDefinition[]>({
    queryKey: ['userThemes', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];

      // Query theme definitions and deletion events in parallel
      const [themeEvents, deletionEvents] = await Promise.all([
        nostr.query(
          [{
            kinds: [THEME_DEFINITION_KIND],
            authors: [pubkey],
            limit: 50,
          }],
          { signal: AbortSignal.timeout(5000) },
        ),
        nostr.query(
          [{
            kinds: [5],
            authors: [pubkey],
            '#k': [String(THEME_DEFINITION_KIND)],
            limit: 50,
          }],
          { signal: AbortSignal.timeout(5000) },
        ),
      ]);

      // Build a set of deleted `a` tag references
      const deletedRefs = new Set<string>();
      for (const del of deletionEvents) {
        for (const [tagName, tagValue] of del.tags) {
          if (tagName === 'a' && tagValue) {
            deletedRefs.add(tagValue);
          }
        }
      }

      // Deduplicate by d-tag (keep latest per identifier)
      const byIdentifier = new Map<string, typeof themeEvents[number]>();
      for (const event of themeEvents) {
        const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';

        // Skip if deleted
        const ref = `${THEME_DEFINITION_KIND}:${event.pubkey}:${d}`;
        if (deletedRefs.has(ref)) continue;

        const existing = byIdentifier.get(d);
        if (!existing || event.created_at > existing.created_at) {
          byIdentifier.set(d, event);
        }
      }

      // Parse and filter invalid
      const themes: ThemeDefinition[] = [];
      for (const event of byIdentifier.values()) {
        const parsed = parseThemeDefinition(event);
        if (parsed) themes.push(parsed);
      }

      // Sort newest first
      return themes.sort((a, b) => b.event.created_at - a.event.created_at);
    },
    enabled: !!pubkey,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
