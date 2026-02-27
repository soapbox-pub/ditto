import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Pencil } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getDisplayName } from '@/lib/getDisplayName';
import { parseThemeDefinition, parseActiveProfileTheme, THEME_DEFINITION_KIND, ACTIVE_THEME_KIND } from '@/lib/themeEvent';
import { hslStringToHex } from '@/lib/colorUtils';

interface ThemeContentProps {
  event: NostrEvent;
}

/** Safely convert HSL string to hex, with fallback. */
function safeHex(hsl: string): string {
  try {
    return hslStringToHex(hsl);
  } catch {
    return '#888888';
  }
}

/**
 * Renders the inline theme preview content for kind 36767 (Theme Definition)
 * and kind 16767 (Active Profile Theme) events within NoteCard.
 * Shows color swatches, title/description, and copy/edit actions.
 */
export function ThemeContent({ event }: ThemeContentProps) {
  const { user } = useCurrentUser();
  const isOwn = user?.pubkey === event.pubkey;
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);

  const parsed = useMemo(() => {
    if (event.kind === THEME_DEFINITION_KIND) {
      return parseThemeDefinition(event);
    }
    if (event.kind === ACTIVE_THEME_KIND) {
      const active = parseActiveProfileTheme(event);
      if (!active) return null;
      // Normalize to a common shape
      const title = event.tags.find(([n]) => n === 'title')?.[1];
      return {
        colors: active.colors,
        title: title ?? 'Active Theme',
        description: undefined as string | undefined,
        identifier: undefined as string | undefined,
        sourceRef: active.sourceRef,
      };
    }
    return null;
  }, [event]);

  if (!parsed) return null;

  const { colors, title, description } = parsed;

  // Convert core colors to hex for inline styles
  const hexColors = {
    background: safeHex(colors.background),
    foreground: safeHex(colors.text),
    primary: safeHex(colors.primary),
  };

  const swatchColors = [
    { label: 'Primary', hex: hexColors.primary },
    { label: 'Text', hex: hexColors.foreground },
    { label: 'Background', hex: hexColors.background },
  ];

  // Determine action links
  const isDefinition = event.kind === THEME_DEFINITION_KIND;
  const identifier = isDefinition ? (parsed as { identifier?: string }).identifier : undefined;

  return (
    <div className="mt-2 space-y-2">
      {/* Theme swatch card */}
      <div
        className="rounded-xl overflow-hidden border border-border"
        style={{
          background: `linear-gradient(135deg, ${hexColors.background}ee, ${hexColors.primary}15)`,
        }}
      >
        {/* Color swatch strip */}
        <div className="flex h-16">
          {swatchColors.map(({ label, hex }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <div
                  className="flex-1 transition-all hover:flex-[1.3] cursor-default"
                  style={{ backgroundColor: hex }}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{label}</p>
                <p className="font-mono text-muted-foreground">{hex}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Preview bar with title */}
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ backgroundColor: hexColors.background }}>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ backgroundColor: hexColors.primary, color: hexColors.background }}
            >
              {displayName[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold block truncate" style={{ color: hexColors.foreground }}>
                {title}
              </span>
              {description && (
                <span className="text-[10px] block truncate" style={{ color: `${hexColors.foreground}99` }}>
                  {description}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {isDefinition && identifier && isOwn && (
          <Link to={`/settings/theme/edit?edit=${identifier}`}>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-accent">
              <Pencil className="size-3.5 mr-1" />
              Edit Theme
            </Button>
          </Link>
        )}
        {isDefinition && identifier && !isOwn && (
          <Link to={`/settings/theme/edit?import=${event.pubkey}&theme=${identifier}`}>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary">
              <Copy className="size-3.5 mr-1" />
              Copy Theme
            </Button>
          </Link>
        )}
        {!isDefinition && !isOwn && (
          <Link to={`/settings/theme/edit?import=${event.pubkey}`}>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary">
              <Copy className="size-3.5 mr-1" />
              Copy Theme
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
