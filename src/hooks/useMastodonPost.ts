import { useQuery } from '@tanstack/react-query';

import type { ExternalImage, ExternalExternal, ExternalPostData } from '@/components/ExternalPostCard';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Raw Mastodon API status shape (subset of fields we use). */
interface RawMastodonStatus {
  id: string;
  created_at: string;
  content: string;
  url: string | null;
  account: {
    display_name: string;
    username: string;
    acct: string;
    avatar: string;
    url: string;
  };
  media_attachments: {
    type: string;
    url: string;
    preview_url: string | null;
    description: string | null;
  }[];
  card?: {
    title: string;
    image: string | null;
  } | null;
  favourites_count: number;
  reblogs_count: number;
  replies_count: number;
}

/** Strip HTML tags and decode common HTML entities to get plaintext. */
function htmlToPlaintext(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * Fetches a Mastodon post via the instance's public API and returns it as
 * an `ExternalPostData` object for rendering in `ExternalPostCard`.
 *
 * @param url - Full Mastodon post URL, e.g. `https://mastodon.social/@Gargron/123456`
 */
export function useMastodonPost(url: string) {
  return useQuery({
    queryKey: ['mastodon-post', url],
    queryFn: async ({ signal }): Promise<ExternalPostData | null> => {
      let parsed: URL;
      try { parsed = new URL(url); } catch { return null; }
      const origin = parsed.origin;

      // Extract status ID from the last path segment: /@user/123456
      const segments = parsed.pathname.split('/');
      const statusId = segments[segments.length - 1];
      if (!statusId || !/^\d+$/.test(statusId)) return null;

      const res = await fetch(
        `${origin}/api/v1/statuses/${statusId}`,
        { signal },
      );
      if (!res.ok) return null;

      const status = await res.json() as RawMastodonStatus;

      // The instance's response is as untrusted as event data: every URL in
      // it lands in an href or src, so keep only https ones.
      const imageList: ExternalImage[] = status.media_attachments
        .filter((a) => a.type === 'image')
        .flatMap((a) => {
          const thumb = sanitizeUrl(a.preview_url) ?? sanitizeUrl(a.url);
          return thumb ? [{ thumb, alt: a.description || '' }] : [];
        });
      const images = imageList.length > 0 ? imageList : undefined;

      const external: ExternalExternal | undefined =
        !images && status.card?.title
          ? { title: status.card.title, thumb: sanitizeUrl(status.card.image) }
          : undefined;

      // For remote users, acct includes @domain; for local users it's just the username
      const handle = status.account.acct.includes('@')
        ? status.account.acct
        : `${status.account.acct}@${parsed.hostname}`;

      return {
        displayName: status.account.display_name || status.account.username,
        handle,
        avatar: sanitizeUrl(status.account.avatar),
        text: htmlToPlaintext(status.content),
        createdAt: status.created_at,
        postUrl: sanitizeUrl(status.url) ?? url,
        profileUrl: sanitizeUrl(status.account.url) ?? `${origin}/@${encodeURIComponent(status.account.username)}`,
        replyCount: status.replies_count,
        repostCount: status.reblogs_count,
        likeCount: status.favourites_count,
        images,
        external,
      };
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    retry: false,
  });
}
