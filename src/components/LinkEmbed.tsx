import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, MessageSquare } from 'lucide-react';

import { ArchiveOrgEmbed } from '@/components/ArchiveOrgEmbed';
import { BlueskyEmbed } from '@/components/BlueskyEmbed';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { LinkPreview } from '@/components/LinkPreview';
import { MastodonEmbed } from '@/components/MastodonEmbed';
import { RedditEmbed } from '@/components/RedditEmbed';
import { SpotifyEmbed } from '@/components/SpotifyEmbed';
import { TweetEmbed } from '@/components/TweetEmbed';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import {
  extractYouTubeId,
  extractTweetId,
  extractBlueskyPost,
  extractMastodonPost,
  extractSpotifyEmbed,
  extractRedditPost,
  extractArchiveOrgId,
} from '@/lib/linkEmbed';
import { cn } from '@/lib/utils';

interface LinkEmbedProps {
  url: string;
  className?: string;
  /** When true, clicking the link preview navigates to /i/ instead of opening externally. */
  navigateToComments?: boolean;
  /** When true, shows an action button (Discuss or Open). Defaults to true. */
  showActions?: boolean;
  /** When true, hides the thumbnail image in generic link preview cards. */
  hideImage?: boolean;
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
export function LinkEmbed({ url, className, navigateToComments, showActions = true, hideImage }: LinkEmbedProps) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const tweetId = useMemo(() => extractTweetId(url), [url]);
  const blueskyPost = useMemo(() => extractBlueskyPost(url), [url]);
  const mastodonUrl = useMemo(() => extractMastodonPost(url), [url]);
  const spotifyEmbed = useMemo(() => extractSpotifyEmbed(url), [url]);
  const redditUrl = useMemo(() => extractRedditPost(url), [url]);
  const archiveOrgId = useMemo(() => extractArchiveOrgId(url), [url]);

  let embed: React.ReactNode;

  if (youtubeId) {
    embed = <YouTubeEmbed videoId={youtubeId} />;
  } else if (tweetId) {
    embed = <TweetEmbed tweetId={tweetId} />;
  } else if (blueskyPost) {
    // BlueskyEmbed has built-in /i/ navigation, no DiscussBar needed
    return <BlueskyEmbed author={blueskyPost.author} rkey={blueskyPost.rkey} hideImage={hideImage} className={className} />;
  } else if (mastodonUrl) {
    // MastodonEmbed has built-in /i/ navigation, no DiscussBar needed
    return <MastodonEmbed url={mastodonUrl} className={className} />;
  } else if (spotifyEmbed) {
    embed = <SpotifyEmbed type={spotifyEmbed.type} id={spotifyEmbed.id} />;
  } else if (redditUrl) {
    embed = <RedditEmbed url={redditUrl} />;
  } else if (archiveOrgId) {
    embed = <ArchiveOrgEmbed identifier={archiveOrgId} />;
  } else {
    return <LinkPreview url={url} className={className} hideImage={hideImage} navigateToComments={navigateToComments} showActions={showActions} />;
  }

  return (
    <div className={cn('space-y-0', className)}>
      {embed}
      <DiscussBar url={url} showActions={showActions} />
    </div>
  );
}

/** Info bar below an embed with title, domain, external link, and "Discuss" button. */
function DiscussBar({ url, showActions = true }: { url: string; showActions?: boolean }) {
  const navigate = useNavigate();
  const { data: linkPreview } = useLinkPreview(url);

  const domain = useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }, [url]);

  const providerName = linkPreview?.provider_name || domain;

  return (
    <div className="px-3.5 py-2.5 space-y-0.5">
      {/* Domain + favicon + actions */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalFavicon url={url} size={14} className="shrink-0" />
        <span className="truncate">{providerName}</span>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full',
            'text-xs text-muted-foreground',
            'hover:bg-primary/10 hover:text-primary transition-colors',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3" />
          <span>Open</span>
        </a>

        {showActions && (
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full',
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
        )}
      </div>

      {/* Title */}
      {linkPreview?.title && (
        <p className="text-sm font-semibold leading-snug line-clamp-2">
          {linkPreview.title}
        </p>
      )}

      {/* Author */}
      {linkPreview?.author_name && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {linkPreview.author_name}
        </p>
      )}
    </div>
  );
}
