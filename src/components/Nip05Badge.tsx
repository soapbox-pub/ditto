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
 * Only shows favicon if it loads successfully. Hides on any error.
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const [showFavicon, setShowFavicon] = useState(true);
  const [imageLoaded, setImageLoaded] = useState(false);
  const domain = getNip05Domain(nip05);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Check if the loaded image is tiny (likely a placeholder/default)
    // Real favicons are usually at least 16x16
    if (img.naturalWidth < 16 || img.naturalHeight < 16) {
      setShowFavicon(false);
      return;
    }
    setImageLoaded(true);
  };

  const handleError = () => {
    setShowFavicon(false);
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="truncate">@{nip05}</span>
      {domain && showFavicon && (
        <img
          src={`https://${domain}/favicon.ico`}
          alt=""
          className={cn(
            'shrink-0 rounded-sm bg-white/5',
            !imageLoaded && 'opacity-0'
          )}
          style={{ width: iconSize, height: iconSize }}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </span>
  );
}
