import { useMemo } from 'react';

import { LinkPreview } from '@/components/LinkPreview';
import { TweetEmbed } from '@/components/TweetEmbed';
import { YouTubeEmbed } from '@/components/YouTubeEmbed';

interface LinkEmbedProps {
  url: string;
  className?: string;
}

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
    // Match /<user>/status/<id> paths
    const match = u.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Returns true if the URL should be rendered as a rich embed rather than a plain link. */
export function isEmbeddableUrl(url: string): boolean {
  return !!extractYouTubeId(url) || !!extractTweetId(url);
}

/**
 * Unified link embed component. Given a URL, renders the appropriate embed:
 * - YouTube URLs → `YouTubeEmbed` (click-to-play facade)
 * - Twitter/X tweet URLs → `TweetEmbed` (iframe embed)
 * - Everything else → `LinkPreview` (OEmbed link preview card)
 */
export function LinkEmbed({ url, className }: LinkEmbedProps) {
  const youtubeId = useMemo(() => extractYouTubeId(url), [url]);
  const tweetId = useMemo(() => extractTweetId(url), [url]);

  if (youtubeId) {
    return <YouTubeEmbed videoId={youtubeId} className={className} />;
  }

  if (tweetId) {
    return <TweetEmbed tweetId={tweetId} className={className} />;
  }

  return <LinkPreview url={url} className={className} />;
}
