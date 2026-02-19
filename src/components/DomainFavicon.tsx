import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DomainFaviconProps {
  /** Full URL or just domain name */
  domain: string;
  /** Size in pixels (default: 16) */
  size?: number;
  className?: string;
}

/**
 * Fetches the HTML of a domain and parses for favicon link tags.
 * Returns the discovered favicon URL or null if not found.
 */
async function discoverFavicon(origin: string): Promise<string | null> {
  try {
    const response = await fetch(origin, { 
      method: 'GET',
      headers: { 'Accept': 'text/html' }
    });
    if (!response.ok) return null;

    const html = await response.text();
    
    // Parse favicon from <link> tags
    // Look for rel="icon", rel="shortcut icon", or rel="apple-touch-icon"
    const iconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/gi;
    const appleIconRegex = /<link[^>]*rel=["']apple-touch-icon["'][^>]*>/gi;
    
    const matches = [...html.matchAll(iconRegex), ...html.matchAll(appleIconRegex)];
    
    for (const match of matches) {
      const linkTag = match[0];
      const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        let href = hrefMatch[1];
        // Make absolute URL if relative
        if (href.startsWith('/')) {
          href = `${origin}${href}`;
        } else if (!href.startsWith('http')) {
          href = `${origin}/${href}`;
        }
        return href;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Displays a favicon for a domain or URL.
 * Intelligently discovers favicons by parsing HTML link tags, then falls back to common paths.
 */
export function DomainFavicon({ domain, size = 16, className }: DomainFaviconProps) {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Get origin from domain
  const origin = useMemo(() => {
    try {
      if (domain.startsWith('http://') || domain.startsWith('https://')) {
        return new URL(domain).origin;
      }
      return `https://${domain}`;
    } catch {
      return null;
    }
  }, [domain]);

  // Fallback URLs to try if discovery fails
  const fallbackUrls = useMemo(() => {
    if (!origin) return [];
    return [
      `${origin}/favicon.svg`,
      `${origin}/favicon.ico`,
      `${origin}/favicon.png`,
    ];
  }, [origin]);

  // Discover favicon from HTML on mount
  useEffect(() => {
    if (!origin) {
      setFailed(true);
      return;
    }

    let mounted = true;

    discoverFavicon(origin).then((url) => {
      if (mounted) {
        if (url) {
          setFaviconUrl(url);
        } else {
          // No favicon discovered, try fallbacks
          setFaviconUrl(fallbackUrls[0] || null);
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, [origin, fallbackUrls]);

  const handleError = () => {
    // If current URL failed, try next fallback
    if (fallbackIndex < fallbackUrls.length - 1) {
      setFallbackIndex(fallbackIndex + 1);
      setFaviconUrl(fallbackUrls[fallbackIndex + 1]);
    } else {
      setFailed(true);
    }
  };

  if (!faviconUrl || failed) {
    return null;
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
      loading="lazy"
      onError={handleError}
    />
  );
}
