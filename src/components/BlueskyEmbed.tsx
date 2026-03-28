import { ExternalPostCard, ExternalPostCardSkeleton } from '@/components/ExternalPostCard';
import { useBlueskyPost } from '@/hooks/useBlueskyPost';

interface BlueskyEmbedProps {
  /** Handle or DID of the post author. */
  author: string;
  /** Record key (rkey) of the post. */
  rkey: string;
  /** When true, hides image and external link thumbnails. */
  hideImage?: boolean;
  className?: string;
}

/** Bluesky butterfly logo as an inline SVG. */
function BlueskyLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 530"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Bluesky"
    >
      <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
  );
}

/**
 * Renders a Bluesky post as a native quote-post card, fetching data from
 * the public Bluesky API.
 */
export function BlueskyEmbed({ author, rkey, hideImage, className }: BlueskyEmbedProps) {
  const { data: post, isLoading, isError } = useBlueskyPost(author, rkey);

  if (isLoading) {
    return <ExternalPostCardSkeleton className={className} />;
  }

  if (isError || !post) {
    return null;
  }

  return (
    <ExternalPostCard
      post={{ ...post, brandIcon: <BlueskyLogo className="size-3.5" /> }}
      hideImage={hideImage}
      className={className}
    />
  );
}
