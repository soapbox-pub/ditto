import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { THEME_DEFINITION_KIND, parseThemeDefinition, type ThemeDefinition } from '@/lib/themeEvent';

/**
 * Query all kind 36767 theme definitions published by a given user.
 * Returns an array of parsed ThemeDefinition objects, sorted newest first.
 */
export function useUserThemes(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<ThemeDefinition[]>({
    queryKey: ['userThemes', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];

      const events = await nostr.query(
        [{
          kinds: [THEME_DEFINITION_KIND],
          authors: [pubkey],
          limit: 50,
        }],
        { signal: AbortSignal.timeout(5000) },
      );

      // Deduplicate by d-tag (keep latest per identifier)
      const byIdentifier = new Map<string, typeof events[number]>();
      for (const event of events) {
        const d = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
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
    staleTime: 30 * 1000, // 30 seconds — short so deletions/updates are reflected quickly
    gcTime: 5 * 60 * 1000,
  });
}
