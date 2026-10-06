import React, { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { Pencil } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { TryThemeButton } from '@/components/TryThemeButton';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getDisplayName } from '@/lib/getDisplayName';
import { parseThemeDefinition, parseActiveProfileTheme, themeEventToConfig, THEME_DEFINITION_KIND, ACTIVE_THEME_KIND } from '@/lib/themeEvent';
import { startThemePreview } from '@/lib/themePreview';
import { coreToTokens, type CoreThemeColors, type ThemeSource, type ThemeTokens } from '@/themes';

interface ThemeContentProps {
  event: NostrEvent;
  /** When true, shows the full description instead of truncating it (used on detail page). */
  expanded?: boolean;
}

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/**
 * Renders the inline theme preview content for kind 36767 (Theme Definition)
 * and kind 16767 (Active Profile Theme) events within NoteCard.
 * Uses the same mini-mockup design as ThemeSelector, scaled up.
 */
export function ThemeContent({ event, expanded }: ThemeContentProps) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const isOwn = user?.pubkey === event.pubkey;

  const parsed = useMemo(() => {
    if (event.kind === THEME_DEFINITION_KIND) {
      return parseThemeDefinition(event);
    }
    if (event.kind === ACTIVE_THEME_KIND) {
      const active = parseActiveProfileTheme(event);
      if (!active) return null;
      return {
        colors: active.colors,
        title: active.title ?? intl.formatMessage({ id: 'themeContent.profileTheme', defaultMessage: 'Profile Theme' }),
        description: active.description,
        identifier: undefined as string | undefined,
        background: active.background,
        sourceRef: active.sourceRef,
        source: active.source,
      };
    }
    return null;
  }, [event, intl]);

  // A kind 16767 adopted from another user credits that theme's creator.
  const creator = (parsed as { source?: ThemeSource } | null)?.source;
  const creatorLink = creator ? <CreatorLink pubkey={creator.pubkey} /> : undefined;

  // For kind 16767 events without a description tag, look up the source theme definition
  const sourceRef = (parsed as { sourceRef?: string } | null)?.sourceRef;
  const needsSourceLookup = event.kind === ACTIVE_THEME_KIND && !parsed?.description && !!sourceRef;

  const sourceCoords = useMemo(() => {
    if (!needsSourceLookup || !sourceRef) return null;
    const parts = sourceRef.split(':');
    if (parts.length < 3) return null;
    return { kind: parseInt(parts[0], 10), pubkey: parts[1], identifier: parts[2] };
  }, [needsSourceLookup, sourceRef]);

  const { data: sourceDescription } = useQuery({
    queryKey: ['themeSourceDescription', sourceRef],
    queryFn: async () => {
      if (!sourceCoords) return null;
      const events = await nostr.query([{
        kinds: [sourceCoords.kind],
        authors: [sourceCoords.pubkey],
        '#d': [sourceCoords.identifier],
        limit: 1,
      }], { signal: AbortSignal.timeout(5000) });
      const source = events[0];
      if (!source) return null;
      return source.tags.find(([n]) => n === 'description')?.[1] ?? null;
    },
    enabled: !!sourceCoords,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Use direct description from event, or fall back to source theme description
  const resolvedDescription = parsed?.description ?? sourceDescription ?? undefined;

  /** Try the theme on. Nothing is saved or published until the user confirms in the ThemePreviewBar. */
  const handlePreviewTheme = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const themeConfig = themeEventToConfig(event);
    if (themeConfig) startThemePreview(themeConfig);
  }, [event]);

  if (!parsed) return null;

  const { colors, title } = parsed;
  const description = resolvedDescription;
  const backgroundUrl = parsed.background?.url;

  const isDefinition = event.kind === THEME_DEFINITION_KIND;
  const identifier = isDefinition ? (parsed as { identifier?: string }).identifier : undefined;

  return (
    <div className="mt-2 space-y-2">
      {/* The whole mockup previews on click; the pill inside is the obvious, keyboard-reachable way in. */}
      <div
        className="cursor-pointer transition-opacity hover:opacity-95"
        onClick={handlePreviewTheme}
      >
        <ThemeMockup
          colors={colors}
          title={title}
          creator={creatorLink}
          description={description}
          backgroundUrl={backgroundUrl}
          expanded={expanded}
          renderAction={(tokens) => (
            <TryThemeButton
              onClick={handlePreviewTheme}
              style={{ backgroundColor: hsl(tokens.primary), color: hsl(tokens.primaryForeground) }}
            />
          )}
        />
      </div>

      {/* Edit for own theme definitions */}
      <div className="flex items-center gap-2 empty:hidden" onClick={(e) => e.stopPropagation()}>
        {isDefinition && identifier && isOwn && (
          <Link to="/themes">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-accent">
              <Pencil className="size-3.5 mr-1" />
              Edit Theme
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/** The original creator's name, linked to their profile with the same hover card as post authors. */
function CreatorLink({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);
  const name = getDisplayName(author.data?.metadata, pubkey);

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {author.data?.event ? <EmojifiedText tags={author.data.event.tags}>{name}</EmojifiedText> : name}
      </Link>
    </ProfileHoverCard>
  );
}

/**
 * Scaled-up version of the ThemePreviewCard mini-mockup from ThemeSelector.
 * Same proportions (4:3 aspect ratio, simulated header/content/sidebar),
 * with sizes multiplied ~4x so it reads well in a feed card.
 * Includes title and optional description below the mockup.
 */
function ThemeMockup({
  colors,
  title,
  creator,
  description,
  backgroundUrl,
  expanded,
  renderAction,
}: {
  colors: CoreThemeColors;
  title: string;
  /** Link to the theme's original creator, shown when it isn't the event's author */
  creator?: React.ReactNode;
  description?: string;
  backgroundUrl?: string;
  expanded?: boolean;
  /** Action rendered at the right of the title bar, given the theme's tokens */
  renderAction?: (tokens: ThemeTokens) => React.ReactNode;
}) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Scaled mockup — same 4:3 aspect, elements ~4x the ThemeSelector sizes */}
      <div
        className="aspect-4/3 relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {/* Background image layer */}
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            decoding="async"
          />
        )}
        {/* Content preview area */}
        <div className="p-6 pt-10 space-y-4 relative">
          {/* Simulated text lines */}
          <div
            className="h-4 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }}
          />
          <div
            className="h-4 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }}
          />
          {/* Simulated button */}
          <div className="pt-2">
            <div
              className="h-8 w-32 rounded"
              style={{ backgroundColor: hsl(tokens.primary) }}
            />
          </div>
        </div>
      </div>

      {/* Title + description bar, with the action on the right */}
      <div className="flex items-center gap-3 px-3 py-2.5" style={{ backgroundColor: hsl(tokens.card) }}>
        <div className="min-w-0 flex-1">
          <span className="text-sm block truncate" style={{ color: hsl(tokens.foreground) }}>
            <span className="font-semibold">{title}</span>
            {creator && (
              <span style={{ color: hsl(tokens.mutedForeground) }}>
                {' '}<FormattedMessage id="themeContent.byCreator" defaultMessage="by {creator}" values={{ creator }} />
              </span>
            )}
          </span>
          {description && (
            <span className={`text-xs block mt-0.5 ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`} style={{ color: hsl(tokens.mutedForeground) }}>
              {description}
            </span>
          )}
        </div>
        {renderAction && <div className="shrink-0">{renderAction(tokens)}</div>}
      </div>
    </div>
  );
}
