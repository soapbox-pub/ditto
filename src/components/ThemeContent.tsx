import { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/hooks/useToast';
import { parseThemeDefinition, parseActiveProfileTheme, THEME_DEFINITION_KIND, ACTIVE_THEME_KIND } from '@/lib/themeEvent';
import { coreToTokens, type CoreThemeColors, type ThemeConfig } from '@/themes';

interface ThemeContentProps {
  event: NostrEvent;
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
export function ThemeContent({ event }: ThemeContentProps) {
  const { user } = useCurrentUser();
  const { applyCustomTheme } = useTheme();
  const isOwn = user?.pubkey === event.pubkey;

  const parsed = useMemo(() => {
    if (event.kind === THEME_DEFINITION_KIND) {
      return parseThemeDefinition(event);
    }
    if (event.kind === ACTIVE_THEME_KIND) {
      const active = parseActiveProfileTheme(event);
      if (!active) return null;
      const title = event.tags.find(([n]) => n === 'title')?.[1];
      return {
        colors: active.colors,
        title: title ?? 'Profile Theme',
        description: undefined as string | undefined,
        identifier: undefined as string | undefined,
        background: active.background,
        font: active.font,
        sourceRef: active.sourceRef,
      };
    }
    return null;
  }, [event]);

  if (!parsed) return null;

  const { colors, title, description } = parsed;
  const backgroundUrl = parsed.background?.url;

  const isDefinition = event.kind === THEME_DEFINITION_KIND;
  const identifier = isDefinition ? (parsed as { identifier?: string }).identifier : undefined;

  /** Apply the theme directly when clicked (non-own themes only). */
  const handleApplyTheme = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const themeConfig: ThemeConfig = {
      colors: parsed.colors,
      title: parsed.title,
      font: parsed.font,
      background: parsed.background,
    };
    applyCustomTheme(themeConfig);
    toast({ title: 'Theme applied', description: `"${parsed.title}" is now your active theme.` });
  }, [parsed, applyCustomTheme]);

  return (
    <div className="mt-2 space-y-2">
      {!isOwn ? (
        <button
          type="button"
          className="w-full text-left cursor-pointer transition-opacity hover:opacity-90 active:opacity-75"
          onClick={handleApplyTheme}
        >
          <ThemeMockup colors={colors} title={title} description={description} backgroundUrl={backgroundUrl} />
        </button>
      ) : (
        <ThemeMockup colors={colors} title={title} description={description} backgroundUrl={backgroundUrl} />
      )}

      {/* Actions — only Edit for own theme definitions */}
      {isDefinition && identifier && isOwn && (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link to={`/settings/theme/edit?edit=${identifier}`}>
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
}: {
  colors: CoreThemeColors;
  title: string;
  description?: string;
  backgroundUrl?: string;
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
        {/* Simulated header bar: 2.5 * 4 = 10 -> h-10 */}
        <div
          className="h-10 w-full relative"
          style={{ backgroundColor: hsl(tokens.card) }}
        />
        {/* Content preview area: p-1.5 * 4 = p-6, space-y-1 * 4 = space-y-4 */}
        <div className="p-6 space-y-4 relative">
          {/* Simulated text lines: h-1 * 4 = h-4 */}
          <div
            className="h-4 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }}
          />
          <div
            className="h-4 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }}
          />
          {/* Simulated button: h-2 * 4 = h-8, w-8 * 4 = w-32 */}
          <div className="pt-2">
            <div
              className="h-8 w-32 rounded"
              style={{ backgroundColor: hsl(tokens.primary) }}
            />
          </div>
        </div>
        {/* Simulated sidebar strip: w-4 * 4 = w-16 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-16"
          style={{ backgroundColor: hsl(tokens.secondary) }}
        />
      </div>

      {/* Title + description bar */}
      <div className="px-3 py-2.5" style={{ backgroundColor: hsl(tokens.card) }}>
        <span className="text-sm font-semibold block truncate" style={{ color: hsl(tokens.foreground) }}>
          {title}
        </span>
        {description && (
          <span className="text-xs block truncate mt-0.5" style={{ color: hsl(tokens.mutedForeground) }}>
            {description}
          </span>
        )}
      </div>
    </div>
  );
}
