import { MASTODON_SERVERS } from '@/lib/mastodonServers';

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
