/* eslint-disable react-refresh/only-export-components */
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
import { MASTODON_SERVERS } from '@/lib/mastodonServers';
import { cn } from '@/lib/utils';

interface LinkEmbedProps {
  url: string;
  className?: string;
  /** Show a "Discuss" link to the /i/:uri page. Defaults to true. */
  showDiscuss?: boolean;
}

// ---------------------------------------------------------------------------
// URL detection helpers
// ---------------------------------------------------------------------------

/** Extract a YouTube video ID from a URL, or null if not a YouTube link. */
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') && u.pathname === '/watch') {
      return u.searchParams.get('v');
    }
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/embed/')) {
      return u.pathname.split('/')[2] || null;
    }
    if ((u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') && u.pathname.startsWith('/shorts/')) {
      return u.pathname.split('/')[2] || null;
    }
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/** Extract a tweet/post ID from a Twitter or X URL, or null if not a tweet link. */
export function extractTweetId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^mobile\./, '');
    if (host !== 'twitter.com' && host !== 'x.com') return null;
    const match = u.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Bluesky post info extracted from a bsky.app URL. */
export interface BlueskyPostInfo {
  /** Handle or DID of the author. */
  author: string;
  /** Record key of the post. */
  rkey: string;
}

/** Extract Bluesky post info from a bsky.app URL, or null if not a Bluesky post link. */
export function extractBlueskyPost(url: string): BlueskyPostInfo | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'bsky.app') return null;
    // Match /profile/{handle-or-did}/post/{rkey}
    const match = u.pathname.match(/^\/profile\/([^/]+)\/post\/([a-z0-9]+)$/i);
    return match ? { author: match[1], rkey: match[2] } : null;
  } catch {
    return null;
  }
}

/** Extract a Mastodon post URL if the domain is a known Mastodon instance. */
export function extractMastodonPost(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (!MASTODON_SERVERS.has(host)) return null;
    // Match /@{user}/{id} or /@{user}@{domain}/{id} (remote posts)
    if (/^\/@[^/]+\/\d+$/.test(u.pathname)) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

/** Spotify embed info extracted from an open.spotify.com URL. */
export interface SpotifyEmbedInfo {
  /** Content type: track, album, playlist, episode, show. */
  type: string;
  /** Spotify content ID. */
  id: string;
}

/** Extract Spotify embed info from an open.spotify.com URL. */
export function extractSpotifyEmbed(url: string): SpotifyEmbedInfo | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'open.spotify.com') return null;
    // Match /{type}/{id} where type is track, album, playlist, episode, or show
    const match = u.pathname.match(/^\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/);
    return match ? { type: match[1], id: match[2] } : null;
  } catch {
    return null;
  }
}

/** Extract a Reddit post URL, or null if not a Reddit post link. */
export function extractRedditPost(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^old\./, '').replace(/^new\./, '');
    if (host !== 'reddit.com') return null;
    // Match /r/{subreddit}/comments/{id}/... 
    if (/^\/r\/[^/]+\/comments\/[a-z0-9]+/i.test(u.pathname)) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns true if the URL should be rendered as a rich embed rather than a plain link. */
export function isEmbeddableUrl(url: string): boolean {
  return !!extractYouTubeId(url) || !!extractTweetId(url) || !!extractBlueskyPost(url)
    || !!extractMastodonPost(url) || !!extractSpotifyEmbed(url) || !!extractRedditPost(url);
}

/** Get a short label for the embed type. */
export function embedLabel(url: string): string | null {
  if (extractYouTubeId(url)) return 'YouTube';
  if (extractTweetId(url)) return 'Twitter';
  if (extractBlueskyPost(url)) return 'Bluesky';
  if (extractMastodonPost(url)) return 'Mastodon';
  if (extractSpotifyEmbed(url)) return 'Spotify';
  if (extractRedditPost(url)) return 'Reddit';
  return null;
}

// ---------------------------------------------------------------------------
// Unified embed component
// ---------------------------------------------------------------------------

/**
 * Unified link embed component. Given a URL, renders the appropriate embed:
 * - YouTube URLs → `YouTubeEmbed` (click-to-play facade)
 * - Twitter/X tweet URLs → `TweetEmbed` (iframe embed)
 * - Bluesky post URLs → `BlueskyEmbed` (iframe embed)
 * - Mastodon post URLs → `MastodonEmbed` (iframe embed)
 * - Everything else → `LinkPreview` (OEmbed link preview card)
 */
export function LinkEmbed({ url, className, showDiscuss = true }: LinkEmbedProps) {
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
    embed = <BlueskyEmbed author={blueskyPost.author} rkey={blueskyPost.rkey} />;
  } else if (mastodonUrl) {
    embed = <MastodonEmbed url={mastodonUrl} />;
  } else if (spotifyEmbed) {
    embed = <SpotifyEmbed type={spotifyEmbed.type} id={spotifyEmbed.id} />;
  } else if (redditUrl) {
    embed = <RedditEmbed url={redditUrl} />;
  } else {
    // LinkPreview has its own built-in Discuss button
    return <LinkPreview url={url} className={className} />;
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
