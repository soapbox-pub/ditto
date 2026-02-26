import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { CoreThemeColors } from '@/themes';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import {
  THEME_DEFINITION_KIND,
  ACTIVE_THEME_KIND,
  buildThemeDefinitionTags,
  buildActiveThemeTags,
  titleToSlug,
  type ThemeDefinition,
} from '@/lib/themeEvent';

/**
 * Hook to publish theme-related Nostr events.
 *
 * - `publishTheme`: Publish a kind 33891 theme definition (create or update)
 * - `setActiveTheme`: Publish a kind 11667 active profile theme
 * - `deleteTheme`: Publish a kind 5 deletion for a theme definition
 * - `clearActiveTheme`: Publish a kind 5 deletion for the active profile theme
 */
export function usePublishTheme() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();

  /** Publish or update a kind 33891 theme definition. */
  const publishTheme = useCallback(async (opts: {
    colors: CoreThemeColors;
    title: string;
    description?: string;
    /** Existing identifier to update; if omitted, generates from title */
    identifier?: string;
  }) => {
    if (!user) throw new Error('Must be logged in');

    const identifier = opts.identifier || titleToSlug(opts.title);
    const tags = buildThemeDefinitionTags(identifier, opts.title, opts.description);

    await publishEvent({
      kind: THEME_DEFINITION_KIND,
      content: JSON.stringify(opts.colors),
      tags,
    });

    // Invalidate the user's theme list cache
    queryClient.invalidateQueries({ queryKey: ['userThemes', user.pubkey] });

    return identifier;
  }, [user, publishEvent, queryClient]);

  /** Set a theme as the active profile theme (kind 11667). */
  const setActiveTheme = useCallback(async (opts: {
    colors: CoreThemeColors;
    /** Author of the source theme definition */
    sourceAuthor?: string;
    /** d-tag of the source theme definition */
    sourceIdentifier?: string;
  }) => {
    if (!user) throw new Error('Must be logged in');

    const tags = buildActiveThemeTags(opts.sourceAuthor, opts.sourceIdentifier);

    await publishEvent({
      kind: ACTIVE_THEME_KIND,
      content: JSON.stringify(opts.colors),
      tags,
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  /** Delete a kind 33891 theme definition. */
  const deleteTheme = useCallback(async (theme: ThemeDefinition) => {
    if (!user) throw new Error('Must be logged in');

    await publishEvent({
      kind: 5,
      content: '',
      tags: [
        ['e', theme.event.id],
        ['a', `${THEME_DEFINITION_KIND}:${user.pubkey}:${theme.identifier}`],
        ['k', String(THEME_DEFINITION_KIND)],
      ],
    });

    // Optimistically remove the deleted theme from the query cache immediately
    // (the pool's internal cache may still return the event on re-query)
    queryClient.setQueryData<ThemeDefinition[]>(
      ['userThemes', user.pubkey],
      (old) => old?.filter((t) => t.identifier !== theme.identifier) ?? [],
    );
    // Also invalidate feed caches so the theme disappears from public feeds
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    queryClient.invalidateQueries({ queryKey: ['streamKind'] });
  }, [user, publishEvent, queryClient]);

  /** Clear the active profile theme by publishing an empty kind 11667 replacement. */
  const clearActiveTheme = useCallback(async () => {
    if (!user) throw new Error('Must be logged in');

    await publishEvent({
      kind: ACTIVE_THEME_KIND,
      content: '',
      tags: [],
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  return { publishTheme, setActiveTheme, deleteTheme, clearActiveTheme, isPending };
}
