import { useState } from 'react';
import { getNip05Domain, getDomainFavicon } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Nip05BadgeProps {
  nip05: string;
  className?: string;
  /** Size of the favicon in pixels (default: 16) */
  iconSize?: number;
}

/**
 * Displays a NIP-05 identifier with its domain favicon.
 * Handles missing favicons gracefully and adds a subtle background for transparency.
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const [faviconError, setFaviconError] = useState(false);
  const domain = getNip05Domain(nip05);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="truncate">@{nip05}</span>
      {domain && !faviconError && (
        <img
          src={getDomainFavicon(domain)}
          alt=""
          className="shrink-0 rounded-sm bg-muted/50"
          style={{ width: iconSize, height: iconSize }}
          loading="lazy"
          onError={() => setFaviconError(true)}
        />
      )}
    </span>
  );
}
