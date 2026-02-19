import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Nip05BadgeProps {
  nip05: string;
  className?: string;
  /** Size of the favicon in pixels (default: 16) */
  iconSize?: number;
}

/**
 * Extracts the domain from a NIP-05 identifier.
 */
function getNip05Domain(nip05: string | undefined): string | undefined {
  if (!nip05) return undefined;
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return undefined;
  return nip05.slice(atIndex + 1);
}

/**
 * Displays a NIP-05 identifier with its domain favicon.
 * Uses DuckDuckGo's favicon service which returns 404 for missing favicons.
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const [showFavicon, setShowFavicon] = useState(true);
  const domain = getNip05Domain(nip05);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="truncate">@{nip05}</span>
      {domain && showFavicon && (
        <img
          src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
          alt=""
          className="shrink-0 rounded-sm bg-white/5"
          style={{ width: iconSize, height: iconSize }}
          loading="lazy"
          onError={() => setShowFavicon(false)}
        />
      )}
    </span>
  );
}
