import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { ThemeTokens } from '@/themes';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import { parseYourspaceEvent, yourspaceToTokens, tokensToYourspace } from '@/lib/yourspaceTheme';

/**
 * Query a user's profile theme (kind 30203) and return parsed ThemeTokens.
 * Returns undefined if the user has no published theme.
 */
export function useProfileTheme(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['profileTheme', pubkey],
    queryFn: async () => {
      if (!pubkey) return null;

      const events = await nostr.query(
        [{
          kinds: [30203],
          authors: [pubkey],
          '#d': ['profile-theme'],
          limit: 1,
        }],
        { signal: AbortSignal.timeout(5000) },
      );

      if (events.length === 0) return null;

      const parsed = parseYourspaceEvent(events[0]);
      if (!parsed) return null;

      return {
        tokens: yourspaceToTokens(parsed),
        yourspace: parsed,
        event: events[0],
      };
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to publish the current user's custom theme as a kind 30203 event.
 */
export function usePublishProfileTheme() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();

  const publish = async (tokens: ThemeTokens) => {
    if (!user) throw new Error('Must be logged in to publish theme');

    const yourspaceContent = tokensToYourspace(tokens);

    await publishEvent({
      kind: 30203,
      content: JSON.stringify(yourspaceContent),
      tags: [
        ['d', 'profile-theme'],
        ['alt', 'Profile theme configuration'],
      ],
    });
  };

  return { publish, isPending };
}
