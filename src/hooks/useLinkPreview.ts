import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { templateUrl } from '@/lib/faviconUrl';

/** OEmbed response from the link preview endpoint. */
export interface OEmbedData {
  type: 'link' | 'photo' | 'video' | 'rich';
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  url?: string;
  html?: string;
  width?: number;
  height?: number;
}

/** Fetch OEmbed data for a URL from the configured link preview endpoint. */
async function fetchLinkPreview(
  url: string,
  linkPreviewTemplate: string,
  signal?: AbortSignal,
): Promise<OEmbedData | null> {
  try {
    const endpoint = templateUrl({ template: linkPreviewTemplate, url });
    const response = await fetch(endpoint, {
      signal,
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data: OEmbedData = await response.json();

    // Must have at least a title to be useful
    if (!data.title) return null;

    return data;
  } catch {
    return null;
  }
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
