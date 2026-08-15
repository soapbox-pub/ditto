import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Server } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/hooks/useAppContext';
import { templateUrl } from '@/lib/faviconUrl';
import type { RelayListEntry } from '@/lib/relayList';
import { renderRelayUrl } from '@/lib/relayList';
import { cn } from '@/lib/utils';

type AvatarSize = 'sm' | 'md';

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'size-6',
  md: 'size-7',
};

const overlapClasses: Record<AvatarSize, string> = {
  sm: '-space-x-1.5',
  md: '-space-x-2',
};

const iconClasses: Record<AvatarSize, string> = {
  sm: 'size-3',
  md: 'size-3.5',
};

interface RelayAvatarStackProps {
  /** Relays to render, in display order. Only the first `maxVisible` are rendered. */
  relays: RelayListEntry[];
  /** How many icons to show before collapsing into "+N more". Default 5. */
  maxVisible?: number;
  /** Icon size preset. Default 'md'. */
  size?: AvatarSize;
  className?: string;
}

/**
 * Horizontal stack of overlapping relay icons with a "+N more" suffix — the
 * relay-list counterpart to `PeopleAvatarStack`.
 *
 * Icons come from the configured favicon service (`config.faviconUrl`), not
 * from each relay's NIP-11 document. That matters: the favicon service is a
 * single proxy the app already talks to, so a stack renders without revealing
 * the reader's IP to the (author-chosen) relay hosts. See
 * `RelayListRow.fetchInfo` for the same tradeoff stated from the other side.
 */
export function RelayAvatarStack({
  relays,
  maxVisible = 5,
  size = 'md',
  className,
}: RelayAvatarStackProps) {
  const { config } = useAppContext();

  const preview = useMemo(() => relays.slice(0, maxVisible), [relays, maxVisible]);

  const icons = useMemo(
    () =>
      preview.map((entry) => {
        let iconUrl: string | undefined;
        try {
          // Relay URLs are `ws:`/`wss:`; the favicon service keys off hostname.
          iconUrl = templateUrl({ template: config.faviconUrl, url: entry.url });
        } catch {
          iconUrl = undefined;
        }
        return { entry, label: renderRelayUrl(entry.url), iconUrl };
      }),
    [preview, config.faviconUrl],
  );

  if (relays.length === 0) return null;

  const overflow = relays.length - preview.length;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex', overlapClasses[size])}>
        {icons.map(({ entry, label, iconUrl }) => (
          <Tooltip key={entry.url}>
            <TooltipTrigger asChild>
              <Link
                to={`/r/${encodeURIComponent(entry.url)}`}
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'relative rounded-full transition-transform duration-150 ease-out',
                  'hover:z-10 motion-safe:hover:scale-110 focus-visible:z-10 motion-safe:focus-visible:scale-110',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                )}
              >
                <Avatar className={cn(sizeClasses[size], 'ring-2 ring-background')}>
                  <AvatarImage src={iconUrl} alt="" className="object-contain p-0.5" />
                  <AvatarFallback className="bg-primary/10">
                    <Server className={cn('text-primary', iconClasses[size])} />
                  </AvatarFallback>
                </Avatar>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">
          +{overflow} more
        </span>
      )}
    </div>
  );
}
