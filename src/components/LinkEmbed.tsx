import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';

import { BlueskyEmbed } from '@/components/BlueskyEmbed';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { LinkPreview } from '@/components/LinkPreview';
import { MastodonEmbed } from '@/components/MastodonEmbed';
import { RedditEmbed } from '@/components/RedditEmbed';
import { SpotifyEmbed } from '@/components/SpotifyEmbed';
import { TweetEmbed } from '@/components/TweetEmbed';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import {
  extractYouTubeId,
  extractTweetId,
  extractBlueskyPost,
  extractMastodonPost,
  extractSpotifyEmbed,
  extractRedditPost,
} from '@/lib/linkEmbed';
import { cn } from '@/lib/utils';

interface LinkEmbedProps {
  url: string;
  className?: string;
  /** Show a "Discuss" link to the /i/:uri page. Defaults to true. */
  showDiscuss?: boolean;
  /** When true, hides the thumbnail image in generic link preview cards. */
  hideImage?: boolean;
  /** When true, clicking the link preview opens the URL externally instead of navigating to /i/. */
  externalLink?: boolean;
  /** When true, hides the Discuss/Open action button on generic link previews. */
  hideActions?: boolean;
}

// ---------------------------------------------------------------------------
// Unified embed component
// ---------------------------------------------------------------------------

/**
 * Unified link embed component. Given a URL, renders the appropriate embed:
 * - YouTube URLs → `YouTubeEmbed` (click-to-play facade)
 * - Twitter/X tweet URLs → `TweetEmbed` (iframe embed)
 * - Bluesky post URLs → `BlueskyEmbed` (native card via Bluesky API)
 * - Mastodon post URLs → `MastodonEmbed` (native card via Mastodon API)
 * - Everything else → `LinkPreview` (OEmbed link preview card)
 */
export function LinkEmbed({ url, className, showDiscuss = true, hideImage, externalLink = true, hideActions }: LinkEmbedProps) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const tweetId = useMemo(() => extractTweetId(url), [url]);
  const blueskyPost = useMemo(() => extractBlueskyPost(url), [url]);
  const mastodonUrl = useMemo(() => extractMastodonPost(url), [url]);
  const spotifyEmbed = useMemo(() => extractSpotifyEmbed(url), [url]);
  const redditUrl = useMemo(() => extractRedditPost(url), [url]);

  let embed: React.ReactNode;

  if (youtubeId) {
    embed = <YouTubeEmbed videoId={youtubeId} />;
  } else if (tweetId) {
    embed = <TweetEmbed tweetId={tweetId} />;
  } else if (blueskyPost) {
    // BlueskyEmbed has built-in /i/ navigation, no DiscussBar needed
    return <BlueskyEmbed author={blueskyPost.author} rkey={blueskyPost.rkey} className={className} />;
  } else if (mastodonUrl) {
    // MastodonEmbed has built-in /i/ navigation, no DiscussBar needed
    return <MastodonEmbed url={mastodonUrl} className={className} />;
  } else if (spotifyEmbed) {
    embed = <SpotifyEmbed type={spotifyEmbed.type} id={spotifyEmbed.id} />;
  } else if (redditUrl) {
    embed = <RedditEmbed url={redditUrl} />;
  } else {
    return <LinkPreview url={url} className={className} hideImage={hideImage} externalLink={externalLink} hideActions={hideActions} />;
  }

  return (
    <div className={cn('space-y-0', className)}>
      {embed}
      {showDiscuss && <DiscussBar url={url} />}
    </div>
  );
}

/** Small bar below an embed with favicon, domain, and a "Discuss" link. */
function DiscussBar({ url }: { url: string }) {
  const navigate = useNavigate();

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
      <ExternalFavicon url={url} size={14} className="shrink-0" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {domain}
      </a>

      <button
        type="button"
        className={cn(
          'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full',
          'text-xs text-muted-foreground',
          'hover:bg-primary/10 hover:text-primary transition-colors',
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/i/${encodeURIComponent(url)}`);
        }}
      >
        <MessageSquare className="size-3" />
        <span>Discuss</span>
      </button>
    </div>
  );
}
