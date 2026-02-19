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
 * Tries common favicon paths directly from the domain.
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const [showFavicon, setShowFavicon] = useState(true);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const domain = getNip05Domain(nip05);

  // Try common favicon locations in order
  const getFaviconUrl = (domain: string) => {
    return `https://${domain}/favicon.svg`;
  };

  const handleError = () => {
    // If SVG fails, try ICO
    if (faviconUrl?.endsWith('.svg')) {
      setFaviconUrl(`https://${domain}/favicon.ico`);
    } else if (faviconUrl?.endsWith('.ico')) {
      // If ICO fails, try PNG
      setFaviconUrl(`https://${domain}/favicon.png`);
    } else {
      // All attempts failed, hide favicon
      setShowFavicon(false);
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="truncate">@{nip05}</span>
      {domain && showFavicon && (
        <img
          src={faviconUrl || getFaviconUrl(domain)}
          alt=""
          className="shrink-0"
          style={{ width: iconSize, height: iconSize }}
          loading="lazy"
          onError={handleError}
        />
      )}
    </span>
  );
}
