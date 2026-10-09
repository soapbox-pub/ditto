import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

import type { ThemeConfig } from '@/themes';
import { useCurrentUser } from './useCurrentUser';
import { useNostrPublish } from './useNostrPublish';
import {
  THEME_DEFINITION_KIND,
  ACTIVE_THEME_KIND,
  buildThemeDefinitionTags,
  buildActiveThemeTags,
  parseActiveProfileTheme,
  titleToSlug,
  type ThemeDefinition,
  type ActiveProfileTheme,
} from '@/lib/themeEvent';
import { resolveFontUrl } from '@/lib/fontLoader';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

/**
 * Resolve font URLs for Nostr publishing.
 * Bundled fonts get CDN URLs, others keep their existing URL.
 * If no title font is set, it falls back to the body font so published
 * events always include both font tags when a body font is present.
 */
function resolveThemeForPublishing(config: ThemeConfig): ThemeConfig {
  const effectiveTitleFont = config.titleFont ?? config.font;
  return {
    ...config,
    font: config.font ? {
      family: config.font.family,
      url: resolveFontUrl(config.font.family, config.font.url),
    } : undefined,
    titleFont: effectiveTitleFont ? {
      family: effectiveTitleFont.family,
      url: resolveFontUrl(effectiveTitleFont.family, effectiveTitleFont.url),
    } : undefined,
  };
}

/** Tags added by the publisher rather than describing the theme. */
const BOOKKEEPING_TAGS = new Set(['client', 'published_at']);

/** Whether two kind 16767 tag lists describe the same theme, ignoring order and bookkeeping tags. */
function sameThemeTags(a: string[][], b: string[][]): boolean {
  const canonical = (tags: string[][]) => tags
    .filter(([name]) => !BOOKKEEPING_TAGS.has(name))
    .map((tag) => JSON.stringify(tag))
    .sort()
    .join('\n');
  return canonical(a) === canonical(b);
}

export function usePublishTheme() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();

  /** Publish or update a kind 36767 theme definition. */
  const publishTheme = useCallback(async (opts: {
    themeConfig: ThemeConfig;
    title: string;
    description?: string;
    /** Existing identifier to update; if omitted, generates from title */
    identifier?: string;
  }) => {
    if (!user) throw new Error('Must be logged in');

    const identifier = opts.identifier || titleToSlug(opts.title);
    const resolved = resolveThemeForPublishing(opts.themeConfig);
    const tags = buildThemeDefinitionTags(identifier, opts.title, resolved, opts.description);

    await publishEvent({
      kind: THEME_DEFINITION_KIND,
      content: '',
      tags,
    });

    // Invalidate the user's theme list cache
    queryClient.invalidateQueries({ queryKey: ['userThemes', user.pubkey] });

    return identifier;
  }, [user, publishEvent, queryClient]);

  /**
   * Set a theme as the active profile theme (kind 16767). The original creator in
   * `themeConfig.source` is credited on the event. Does nothing when the published
   * theme already matches, so re-picking the current theme doesn't sign a new event.
   */
  const setActiveTheme = useCallback(async (opts: {
    themeConfig: ThemeConfig;
    /** Optional description from the source theme definition */
    description?: string;
  }) => {
    if (!user) throw new Error('Must be logged in');

    const resolved = resolveThemeForPublishing(opts.themeConfig);
    const source = resolved.source?.pubkey === user.pubkey ? undefined : resolved.source;
    const tags = buildActiveThemeTags({ ...resolved, source }, opts.description);

    const prev = await fetchFreshEvent(nostr, { kinds: [ACTIVE_THEME_KIND], authors: [user.pubkey] });
    if (prev && sameThemeTags(prev.tags, tags)) return;

    // Optimistically apply the active theme so it takes effect immediately,
    // before the relay round-trip. Parse a synthetic event from the same tags.
    const optimistic = parseActiveProfileTheme({
      id: '', pubkey: user.pubkey, created_at: Math.floor(Date.now() / 1000),
      kind: ACTIVE_THEME_KIND, tags, content: '', sig: '',
    });
    queryClient.setQueryData<ActiveProfileTheme | null>(['activeProfileTheme', user.pubkey], optimistic);

    await publishEvent({
      kind: ACTIVE_THEME_KIND,
      content: '',
      tags,
      prev: prev ?? undefined,
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, nostr, publishEvent, queryClient]);

  /** Delete a kind 36767 theme definition. */
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
    queryClient.invalidateQueries({ queryKey: ['streamKind'] });
  }, [user, publishEvent, queryClient]);

  /** Clear the active profile theme by publishing an empty kind 16767 replacement. */
  const clearActiveTheme = useCallback(async () => {
    if (!user) throw new Error('Must be logged in');

    // Optimistically clear the active theme so it reverts immediately.
    queryClient.setQueryData<ActiveProfileTheme | null>(['activeProfileTheme', user.pubkey], null);

    await publishEvent({
      kind: ACTIVE_THEME_KIND,
      content: '',
      tags: [],
    });

    queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', user.pubkey] });
  }, [user, publishEvent, queryClient]);

  return { publishTheme, setActiveTheme, deleteTheme, clearActiveTheme, isPending };
}
