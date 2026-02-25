import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { ThemeTokens } from '@/themes';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import {
  THEME_DEFINITION_KIND,
  ACTIVE_THEME_KIND,
  buildThemeDefinitionTags,
  buildActiveThemeTags,
  titleToSlug,
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
    tokens: ThemeTokens;
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
      content: JSON.stringify(opts.tokens),
      tags,
    });

    // Invalidate the user's theme list cache
    queryClient.invalidateQueries({ queryKey: ['userThemes', user.pubkey] });

    return identifier;
  }, [user, publishEvent, queryClient]);

  /** Set a theme as the active profile theme (kind 11667). */
  const setActiveTheme = useCallback(async (opts: {
    tokens: ThemeTokens;
    /** Author of the source theme definition */
    sourceAuthor?: string;
    /** d-tag of the source theme definition */
    sourceIdentifier?: string;
  }) => {
    if (!user) throw new Error('Must be logged in');

    const tags = buildActiveThemeTags(opts.sourceAuthor, opts.sourceIdentifier);

    await publishEvent({
      kind: ACTIVE_THEME_KIND,
      content: JSON.stringify(opts.tokens),
      tags,
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  /** Delete a kind 33891 theme definition. */
  const deleteTheme = useCallback(async (identifier: string) => {
    if (!user) throw new Error('Must be logged in');

    await publishEvent({
      kind: 5,
      content: '',
      tags: [
        ['a', `${THEME_DEFINITION_KIND}:${user.pubkey}:${identifier}`],
      ],
    });

    queryClient.invalidateQueries({ queryKey: ['userThemes', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  /** Clear the active profile theme (kind 5 deletion of kind 11667). */
  const clearActiveTheme = useCallback(async () => {
    if (!user) throw new Error('Must be logged in');

    await publishEvent({
      kind: 5,
      content: '',
      tags: [
        ['k', String(ACTIVE_THEME_KIND)],
      ],
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  return { publishTheme, setActiveTheme, deleteTheme, clearActiveTheme, isPending };
}
