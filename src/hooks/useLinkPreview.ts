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

    const parsed = OEmbedSchema.safeParse(await response.json());

    if (!parsed.success) return null;

    // Must have at least a title to be useful
    if (!parsed.data.title) return null;

    return parsed.data;
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
