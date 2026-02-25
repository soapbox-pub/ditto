import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Copy } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { genUserName } from '@/lib/genUserName';
import { parseYourspaceEvent } from '@/lib/yourspaceTheme';
import { timeAgo } from '@/lib/timeAgo';
import { EmojifiedText } from '@/components/CustomEmoji';

interface ThemeUpdateCardProps {
  event: NostrEvent;
}

/**
 * Renders a kind 30203 (Profile Theme) event as a visually appealing
 * card in feeds, showing the user's theme colors as a swatch strip.
 */
export function ThemeUpdateCard({ event }: ThemeUpdateCardProps) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const authorEvent = author.data?.event;
  const displayName = metadata?.name ?? genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const themeContent = useMemo(() => parseYourspaceEvent(event), [event]);

  if (!themeContent) return null;

  const colors = [
    { label: 'Background', color: themeContent.backgroundColor },
    { label: 'Text', color: themeContent.textColor },
    { label: 'Primary', color: themeContent.primaryColor },
    { label: 'Accent', color: themeContent.accentColor },
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
            <span className="text-muted-foreground text-sm">updated their theme</span>
          </div>
          <span className="text-xs text-muted-foreground">{relativeTime}</span>
        </div>
        <Palette className="size-4 text-primary shrink-0" />
      </div>

      {/* Theme swatch card */}
      <div
        className="rounded-xl overflow-hidden border border-border"
        style={{
          background: `linear-gradient(135deg, ${themeContent.backgroundColor}ee, ${themeContent.primaryColor}15)`,
        }}
      >
        {/* Color swatch strip */}
        <div className="flex h-16">
          {colors.map(({ label, color }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <div
                  className="flex-1 transition-all hover:flex-[1.3] cursor-default"
                  style={{ backgroundColor: color }}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{label}</p>
                <p className="font-mono text-muted-foreground">{color}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Preview bar */}
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ backgroundColor: themeContent.backgroundColor }}>
          <div className="flex items-center gap-2">
            <div
              className="size-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: themeContent.primaryColor, color: themeContent.backgroundColor }}
            >
              {displayName[0]?.toUpperCase()}
            </div>
            <span className="text-xs font-medium" style={{ color: themeContent.textColor }}>
              {themeContent.preset === 'custom' ? 'Custom Theme' : themeContent.preset ?? 'Custom Theme'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono" style={{ color: `${themeContent.textColor}99` }}>
              {themeContent.primaryColor}
            </span>
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
        <Link to={`/settings/theme?import=${event.pubkey}`}>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary">
            <Copy className="size-3.5 mr-1" />
            Copy Theme
          </Button>
        </Link>
      </div>
    </div>
  );
}
