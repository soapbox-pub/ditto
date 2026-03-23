import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useAppContext } from '@/hooks/useAppContext';
import { templateUrl } from '@/lib/faviconUrl';

/** Zod schema for OEmbed responses from the link preview endpoint. */
const OEmbedSchema = z.object({
  type: z.enum(['link', 'photo', 'video', 'rich']),
  version: z.string().optional(),
  title: z.string().optional(),
  author_name: z.string().optional(),
  author_url: z.url().optional(),
  provider_name: z.string().optional(),
  provider_url: z.url().optional(),
  thumbnail_url: z.url().optional(),
  thumbnail_width: z.number().optional(),
  thumbnail_height: z.number().optional(),
  url: z.url().optional(),
  html: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** OEmbed response from the link preview endpoint. */
export type OEmbedData = z.infer<typeof OEmbedSchema>;

/**
 * Try to fetch OEmbed data directly from a known provider's native endpoint.
 * Returns null if the URL doesn't match a known provider or the fetch fails.
 *
 * Known providers:
 * - YouTube (youtube.com, youtu.be)
 * - Spotify (open.spotify.com)
 * - Reddit (reddit.com)
 * - Archive.org (archive.org) — uses the metadata API, transformed to OEmbed shape
 */
async function tryNativeOEmbed(url: string, signal?: AbortSignal): Promise<OEmbedData | null> {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');

    // YouTube
    if (host === 'youtube.com' || host === 'youtu.be') {
      return await tryFetchOEmbed(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        signal,
      );
    }

    // Spotify
    if (host === 'open.spotify.com') {
      return await tryFetchOEmbed(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
        signal,
      );
    }

    // Reddit
    if (host === 'reddit.com' || host === 'old.reddit.com' || host === 'new.reddit.com') {
      return await tryFetchOEmbed(
        `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`,
        signal,
      );
    }

    // Archive.org — no OEmbed, but the metadata API has title/creator.
    if (host === 'archive.org') {
      const match = u.pathname.match(/^\/(details|embed)\/([^/?#]+)/);
      if (match) {
        return await fetchArchiveOrgPreview(match[2], signal);
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Fetch archive.org metadata and transform it into OEmbed-compatible shape. */
async function fetchArchiveOrgPreview(identifier: string, signal?: AbortSignal): Promise<OEmbedData | null> {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`, { signal });
    if (!res.ok) return null;

    const json: {
      metadata?: { title?: string; creator?: string; description?: string; mediatype?: string };
    } = await res.json();

    const meta = json.metadata;
    if (!meta) return null;

    return {
      type: 'link',
      title: meta.title || undefined,
      author_name: meta.creator || undefined,
      provider_name: 'Internet Archive',
      thumbnail_url: `https://archive.org/services/img/${identifier}`,
    };
  } catch {
    return null;
  }
}

/** Try to parse an OEmbed response from a standard endpoint, returning null on failure. */
async function tryFetchOEmbed(endpoint: string, signal?: AbortSignal): Promise<OEmbedData | null> {
  try {
    const response = await fetch(endpoint, {
      signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const parsed = OEmbedSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch OEmbed data for a URL.
 * For known providers (YouTube, Spotify, Reddit, Archive.org), queries their
 * native endpoints directly. For all other URLs, uses the configured link preview proxy.
 */
async function fetchLinkPreview(
  url: string,
  linkPreviewTemplate: string,
  signal?: AbortSignal,
): Promise<OEmbedData | null> {
  // Try native OEmbed endpoint first for known providers.
  const native = await tryNativeOEmbed(url, signal);
  if (native) return native;

  // Fall back to the generic link preview proxy.
  const endpoint = templateUrl({ template: linkPreviewTemplate, url });
  return tryFetchOEmbed(endpoint, signal);
}

/** Hook to fetch OEmbed link preview data for a URL. */
export function useLinkPreview(url: string | null) {
  const { config } = useAppContext();
  return useQuery({
    queryKey: ['link-preview', url, config.linkPreviewUrl],
    queryFn: ({ signal }) => fetchLinkPreview(url!, config.linkPreviewUrl, signal),
    enabled: !!url,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: false,
  });
}
