import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DomainFaviconProps {
  /** Full URL or just domain name */
  domain: string;
  /** Size in pixels (default: 16) */
  size?: number;
  className?: string;
}

/**
 * Displays a favicon for a domain or URL.
 * Tries common favicon formats (.svg, .ico, .png) and hides if none are found.
 */
export function DomainFavicon({ domain, size = 16, className }: DomainFaviconProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Generate favicon URLs to try
  const faviconUrls = useMemo(() => {
    try {
      // If it's a full URL, extract the origin
      if (domain.startsWith('http://') || domain.startsWith('https://')) {
        const origin = new URL(domain).origin;
        return [
          `${origin}/favicon.svg`,
          `${origin}/favicon.ico`,
          `${origin}/favicon.png`,
        ];
      }
      // Otherwise treat it as a domain
      return [
        `https://${domain}/favicon.svg`,
        `https://${domain}/favicon.ico`,
        `https://${domain}/favicon.png`,
      ];
    } catch {
      return [];
    }
  }, [domain]);

  const handleError = () => {
    if (currentIndex < faviconUrls.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setFailed(true);
    }
  };

  if (faviconUrls.length === 0 || failed) {
    return null;
  }

  return (
    <img
      src={faviconUrls[currentIndex]}
      alt=""
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={handleError}
    />
  );
}
