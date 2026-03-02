import { ExternalPostCard, ExternalPostCardSkeleton } from '@/components/ExternalPostCard';
import { useMastodonPost } from '@/hooks/useMastodonPost';

interface MastodonEmbedProps {
  /** Full URL of the Mastodon post. */
  url: string;
  className?: string;
}

/** Mastodon logo as an inline SVG. */
function MastodonLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 216.4 232"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Mastodon"
    >
      <path d="M211.8 139.1c-3.2 16.4-28.6 34.3-57.8 37.8-15.2 1.8-30.2 3.5-46.1 2.8-26.1-1.2-46.7-6.2-46.7-6.2 0 2.5.2 4.9.5 7.2 3.8 28.6 28.4 30.3 51.7 31.1 23.5.7 44.5-5.8 44.5-5.8l1 21.7s-16.5 8.8-45.8 10.5c-16.2.9-36.3-.4-59.7-6.7C7.5 213.8 1.2 165.4.2 116.3c-.3-14.6-.1-28.3-.1-39.8 0-50.2 32.9-64.9 32.9-64.9C49.6 3.5 78.1.2 107.8 0h.7c29.7.2 58.2 3.5 74.9 11.6 0 0 32.9 14.7 32.9 64.9 0 0 .4 37.1-4.5 62.6" />
      <path d="M177.5 80.5v60.3h-23.9v-58.5c0-12.3-5.2-18.6-15.5-18.6-11.4 0-17.2 7.4-17.2 22.1v32h-23.8V85.8c0-14.7-5.7-22.1-17.2-22.1-10.3 0-15.5 6.3-15.5 18.6v58.5H40.5V80.5c0-12.3 3.1-22.1 9.4-29.4 6.5-7.3 15-11 25.5-11 12.2 0 21.4 4.7 27.4 14.1l5.9 9.9 5.9-9.9c6-9.4 15.2-14.1 27.4-14.1 10.5 0 19 3.7 25.5 11 6.3 7.3 9.4 17.1 9.4 29.4" fill="var(--background, #fff)" />
    </svg>
  );
}

/**
 * Renders a Mastodon post as a native quote-post card, fetching data from
 * the instance's public API.
 */
export function MastodonEmbed({ url, className }: MastodonEmbedProps) {
  const { data: post, isLoading, isError } = useMastodonPost(url);

  if (isLoading) {
    return <ExternalPostCardSkeleton className={className} />;
  }

  if (isError || !post) {
    return null;
  }

  return (
    <ExternalPostCard
      post={{ ...post, brandIcon: <MastodonLogo className="size-3.5" /> }}
      className={className}
    />
  );
}
