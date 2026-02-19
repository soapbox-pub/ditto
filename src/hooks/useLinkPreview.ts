import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

/** Parse OG meta tags from raw HTML. */
function parseOpenGraph(html: string, pageUrl: string): LinkPreviewData {
  const data: LinkPreviewData = { url: pageUrl };

  // Parse og:title
  const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*?)["'][^>]*\/?>/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:title["'][^>]*\/?>/i);
  if (titleMatch) {
    data.title = decodeHtmlEntities(titleMatch[1]);
  }

  // Fallback to <title> tag
  if (!data.title) {
    const fallbackTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (fallbackTitle) {
      data.title = decodeHtmlEntities(fallbackTitle[1].trim());
    }
  }

  // Parse og:description
  const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*?)["'][^>]*\/?>/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:description["'][^>]*\/?>/i);
  if (descMatch) {
    data.description = decodeHtmlEntities(descMatch[1]);
  }

  // Fallback to meta description
  if (!data.description) {
    const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["'][^>]*\/?>/i)
      ?? html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["'][^>]*\/?>/i);
    if (metaDesc) {
      data.description = decodeHtmlEntities(metaDesc[1]);
    }
  }

  // Parse og:image
  const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*?)["'][^>]*\/?>/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:image["'][^>]*\/?>/i);
  if (imageMatch) {
    let imageUrl = decodeHtmlEntities(imageMatch[1]);
    // Resolve relative URLs
    if (imageUrl.startsWith('/')) {
      try {
        const base = new URL(pageUrl);
        imageUrl = `${base.origin}${imageUrl}`;
      } catch {
        // leave as-is
      }
    }
    data.image = imageUrl;
  }

  // Parse og:site_name
  const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*?)["'][^>]*\/?>/i)
    ?? html.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*property=["']og:site_name["'][^>]*\/?>/i);
  if (siteNameMatch) {
    data.siteName = decodeHtmlEntities(siteNameMatch[1]);
  }

  // Parse favicon
  const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*?)["'][^>]*\/?>/i)
    ?? html.match(/<link[^>]*href=["']([^"']*?)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*\/?>/i);
  if (faviconMatch) {
    let faviconUrl = decodeHtmlEntities(faviconMatch[1]);
    if (faviconUrl.startsWith('/')) {
      try {
        const base = new URL(pageUrl);
        faviconUrl = `${base.origin}${faviconUrl}`;
      } catch {
        // leave as-is
      }
    }
    data.favicon = faviconUrl;
  } else {
    // Default favicon path
    try {
      const base = new URL(pageUrl);
      data.favicon = `${base.origin}/favicon.ico`;
    } catch {
      // ignore
    }
  }

  return data;
}

/** Decode common HTML entities. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/** Fetch and parse Open Graph data for a URL. */
async function fetchLinkPreview(url: string, corsProxy: string, signal?: AbortSignal): Promise<LinkPreviewData | null> {
  try {
    const proxiedUrl = corsProxy.replace('{href}', encodeURIComponent(url));
    const response = await fetch(proxiedUrl, {
      signal,
      headers: {
        // Identify as a bot/crawler so dynamic sites (SPAs, Twitter, etc.)
        // return server-rendered HTML with OG meta tags instead of a JS shell.
        'User-Agent': 'Mew/1.0 (Link Preview Bot; +https://shakespeare.diy)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;

    const html = await response.text();
    const data = parseOpenGraph(html, url);

    // Only return if we got at least a title
    if (!data.title) return null;

    return data;
  } catch {
    return null;
  }
}

/** Hook to fetch link preview data for a URL. */
export function useLinkPreview(url: string | null) {
  const { config } = useAppContext();
  return useQuery({
    queryKey: ['link-preview', url, config.corsProxy],
    queryFn: ({ signal }) => fetchLinkPreview(url!, config.corsProxy, signal),
    enabled: !!url,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
  });
}
