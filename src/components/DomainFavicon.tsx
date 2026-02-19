import { useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';

interface DomainFaviconProps {
  /** Full URL or just domain name */
  domain: string;
  /** Size in pixels (default: 16) */
  size?: number;
  className?: string;
}

/**
 * Fetches the HTML of a domain via CORS proxy and parses for favicon link tags.
 * Returns the discovered favicon URL or null if not found.
 */
async function discoverFavicon(origin: string, corsProxy: string): Promise<string | null> {
  try {
    // Use CORS proxy to fetch the HTML
    const proxyUrl = corsProxy.replace('{href}', encodeURIComponent(origin));
    const response = await fetch(proxyUrl, { 
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
 * Strategy: Scrape HTML for favicon → try common paths → fallback to favicon provider → hide if all fail
 */
export function DomainFavicon({ domain, size = 16, className }: DomainFaviconProps) {
  const { config } = useAppContext();
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [triedProvider, setTriedProvider] = useState(false);
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

  // Direct favicon URLs to try (svg, ico, png)
  const directUrls = useMemo(() => {
    if (!origin) return [];
    return [
      `${origin}/favicon.svg`,
      `${origin}/favicon.ico`,
      `${origin}/favicon.png`,
    ];
  }, [origin]);

  // Favicon provider fallback URL (configurable template)
  const providerUrl = useMemo(() => {
    if (!origin) return null;
    return config.faviconProvider.replace('{href}', encodeURIComponent(origin));
  }, [origin, config.faviconProvider]);

  // Discover favicon from HTML on mount
  useEffect(() => {
    if (!origin) {
      setFailed(true);
      return;
    }

    let mounted = true;

    // Try to discover favicon from HTML
    discoverFavicon(origin, config.corsProxy).then((url) => {
      if (mounted) {
        if (url) {
          // Found favicon in HTML, use it
          setFaviconUrl(url);
        } else {
          // No favicon in HTML, start with first direct URL
          setFaviconUrl(directUrls[0] || null);
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, [origin, directUrls]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    
    // If this is a favicon provider service, check if it returned the default placeholder
    if (faviconUrl === providerUrl) {
      // Google's default placeholder is exactly 16x16 gray globe
      // Real favicons from Google are usually larger or have different aspect ratios
      if (img.naturalWidth === 16 && img.naturalHeight === 16) {
        // This is likely the default globe - reject it
        setFailed(true);
        return;
      }
    }
  };

  const handleError = () => {
    // If we haven't tried all direct URLs yet
    if (fallbackIndex < directUrls.length - 1) {
      setFallbackIndex(fallbackIndex + 1);
      setFaviconUrl(directUrls[fallbackIndex + 1]);
    } else if (!triedProvider && providerUrl) {
      // All direct URLs failed, try favicon provider
      setTriedProvider(true);
      setFaviconUrl(providerUrl);
    } else {
      // Even Google failed, hide the favicon
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
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
