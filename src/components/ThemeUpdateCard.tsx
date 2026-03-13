import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Copy, Pencil } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { genUserName } from '@/lib/genUserName';
import { parseThemeDefinition } from '@/lib/themeEvent';
import { hslStringToHex } from '@/lib/colorUtils';
import { timeAgo } from '@/lib/timeAgo';
import { EmojifiedText } from '@/components/CustomEmoji';

interface ThemeUpdateCardProps {
  event: NostrEvent;
}

/**
 * Renders a kind 36767 (Theme Definition) event as a visually appealing
 * card in feeds, showing the theme's colors, title, and description.
 */
export function ThemeUpdateCard({ event }: ThemeUpdateCardProps) {
  const { user } = useCurrentUser();
  const isOwn = user?.pubkey === event.pubkey;
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const authorEvent = author.data?.event;
  const displayName = metadata?.name ?? genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const theme = useMemo(() => parseThemeDefinition(event), [event]);

  if (!theme) return null;

  const { colors, title, description } = theme;

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

  const relativeTime = timeAgo(event.created_at);

  return (
    <div className="px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Link to={profileUrl}>
          <Avatar className="size-10">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={profileUrl} className="font-semibold text-sm hover:underline truncate">
              {authorEvent ? (
                <EmojifiedText tags={authorEvent.tags}>{displayName}</EmojifiedText>
              ) : displayName}
            </Link>
            <span className="text-muted-foreground text-sm">shared a theme</span>
          </div>
          <span className="text-xs text-muted-foreground">{relativeTime}</span>
        </div>
        <Palette className="size-4 text-accent shrink-0" />
      </div>

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
      <div className="flex items-center gap-2 mt-2.5">
        <Link to={profileUrl}>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
            View Profile
          </Button>
        </Link>
        {isOwn ? (
          <Link to="/themes">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-accent">
              <Pencil className="size-3.5 mr-1" />
              Edit Theme
            </Button>
          </Link>
        ) : (
          <Link to="/themes">
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

/** Safely convert HSL string to hex, with fallback. */
function safeHex(hsl: string): string {
  try {
    return hslStringToHex(hsl);
  } catch {
    return '#888888';
  }
}
