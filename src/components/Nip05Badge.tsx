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
 * Uses Google's favicon service but validates the image to avoid showing default placeholders.
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const [showFavicon, setShowFavicon] = useState(true);
  const domain = getNip05Domain(nip05);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    
    // Google returns a 16x16 default globe for missing favicons
    // Check if it's exactly 16x16 and likely the default
    if (img.naturalWidth === 16 && img.naturalHeight === 16) {
      // It might be the default globe - hide it to be safe
      // Real favicons from Google's service are often larger or have different dimensions
      setShowFavicon(false);
      return;
    }
  };

  const handleError = () => {
    setShowFavicon(false);
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="truncate">@{nip05}</span>
      {domain && showFavicon && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          alt=""
          className="shrink-0 rounded-sm bg-white/5"
          style={{ width: iconSize, height: iconSize }}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </span>
  );
}
