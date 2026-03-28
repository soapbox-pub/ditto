import React, { useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/hooks/useToast';
import { parseThemeDefinition, parseActiveProfileTheme, THEME_DEFINITION_KIND, ACTIVE_THEME_KIND } from '@/lib/themeEvent';
import { type Theme } from '@/contexts/AppContext';
import { coreToTokens, type CoreThemeColors, type ThemeConfig } from '@/themes';

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
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();
  const isOwn = user?.pubkey === event.pubkey;

  const parsed = useMemo(() => {
    if (event.kind === THEME_DEFINITION_KIND) {
      return parseThemeDefinition(event);
    }
    if (event.kind === ACTIVE_THEME_KIND) {
      const active = parseActiveProfileTheme(event);
      if (!active) return null;
      const title = event.tags.find(([n]) => n === 'title')?.[1];
      const description = event.tags.find(([n]) => n === 'description')?.[1];
      return {
        colors: active.colors,
        title: title ?? 'Profile Theme',
        description,
        identifier: undefined as string | undefined,
        background: active.background,
        font: active.font,
        titleFont: active.titleFont,
        sourceRef: active.sourceRef,
      };
    }
    return null;
  }, [event]);

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

  const previousThemeRef = useRef<{ mode: Theme; config?: ThemeConfig } | undefined>(undefined);

  /** Apply the theme directly when clicked. */
  const handleApplyTheme = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!parsed) return;

    // Snapshot current theme so we can undo
    previousThemeRef.current = { mode: theme, config: customTheme };

    const themeConfig: ThemeConfig = {
      colors: parsed.colors,
      title: parsed.title,
      font: parsed.font,
      titleFont: parsed.titleFont,
      background: parsed.background,
    };
    applyCustomTheme(themeConfig);
    const undo = () => {
      const prev = previousThemeRef.current;
      if (!prev) return;
      if (prev.mode === 'custom' && prev.config) {
        applyCustomTheme(prev.config);
      } else {
        setTheme(prev.mode);
      }
    };

    toast({
      title: 'Theme applied',
      description: `"${parsed.title}" is now your active theme.`,
      action: <ToastAction altText="Undo theme change" onClick={undo}>Undo</ToastAction>,
    });
  }, [parsed, theme, customTheme, applyCustomTheme, setTheme]);

  if (!parsed) return null;

  const { colors, title } = parsed;
  const description = resolvedDescription;
  const backgroundUrl = parsed.background?.url;

  const isDefinition = event.kind === THEME_DEFINITION_KIND;
  const identifier = isDefinition ? (parsed as { identifier?: string }).identifier : undefined;

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        className="w-full text-left cursor-pointer transition-opacity hover:opacity-90 active:opacity-75"
        onClick={handleApplyTheme}
      >
        <ThemeMockup colors={colors} title={title} description={description} backgroundUrl={backgroundUrl} expanded={expanded} />
      </button>

      {/* Actions — only Edit for own theme definitions */}
      {isDefinition && identifier && isOwn && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link to="/themes">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-accent">
              <Pencil className="size-3.5 mr-1" />
              Edit Theme
            </Button>
          </Link>
        </div>
      )}
    </div>
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
  description,
  backgroundUrl,
  expanded,
}: {
  colors: CoreThemeColors;
  title: string;
  description?: string;
  backgroundUrl?: string;
  expanded?: boolean;
}) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Scaled mockup — same 4:3 aspect, elements ~4x the ThemeSelector sizes */}
      <div
        className="aspect-[4/3] relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {/* Background image layer */}
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
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

      {/* Title + description bar */}
      <div className="px-3 py-2.5" style={{ backgroundColor: hsl(tokens.card) }}>
        <span className="text-sm font-semibold block truncate" style={{ color: hsl(tokens.foreground) }}>
          {title}
        </span>
        {description && (
          <span className={`text-xs block mt-0.5 ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`} style={{ color: hsl(tokens.mutedForeground) }}>
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
