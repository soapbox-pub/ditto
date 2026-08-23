/**
 * Content-type (media) filtering for custom profile tabs.
 *
 * Profile tabs query through `useTabFeed`, which forwards `filter.search`
 * verbatim to the relay. Ditto's relay understands the NIP-50 `media:` /
 * `video:` search extensions (the same ones the Search page and the profile
 * Media tab use), so a media filter is expressed purely as extra search terms
 * appended to the tab's `search` string.
 *
 * `vines` is intentionally omitted from this enum: on the Search page it maps
 * to dedicated kinds (22 / 34236), which a profile tab already handles through
 * its explicit "Content Kinds" picker.
 */
import { Image, Type, Video } from 'lucide-react';
import type { ComponentType } from 'react';

export const TAB_MEDIA_TYPES = ['all', 'images', 'videos', 'none'] as const;
export type TabMediaType = typeof TAB_MEDIA_TYPES[number];

/** Human-readable labels for the media-type select. */
export const TAB_MEDIA_LABELS: Record<TabMediaType, string> = {
  all: 'All',
  images: 'Images',
  videos: 'Videos',
  none: 'No media',
};

/**
 * Icons for the media-type select, echoing the app's content-type vocabulary.
 * `all` is intentionally iconless — it's the neutral "no filter" default.
 */
export const TAB_MEDIA_ICONS: Partial<Record<TabMediaType, ComponentType<{ className?: string }>>> = {
  images: Image,
  videos: Video,
  none: Type,
};

/** Matches a single NIP-50 media/video extension term. */
const MEDIA_TERM_RE = /\b(?:media|video):(?:true|false)\b/gi;

/**
 * NIP-50 search terms for a given media type. Empty for `all`.
 * Mirrors the terms in `useStreamPosts` so the two stay consistent.
 */
export function mediaTypeToSearchTerms(mediaType: TabMediaType): string[] {
  switch (mediaType) {
    case 'images':
      return ['media:true', 'video:false'];
    case 'videos':
      return ['video:true'];
    case 'none':
      return ['media:false'];
    case 'all':
      return [];
  }
}

/**
 * Split a tab's `search` string into its media-type filter and the remaining
 * free-text query. The inverse of appending `mediaTypeToSearchTerms`.
 */
export function parseMediaSearch(search: string): { mediaType: TabMediaType; query: string } {
  const terms = new Set<string>();
  const query = search
    .replace(MEDIA_TERM_RE, (m) => {
      terms.add(m.toLowerCase());
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();

  let mediaType: TabMediaType = 'all';
  if (terms.has('video:true')) mediaType = 'videos';
  else if (terms.has('media:false')) mediaType = 'none';
  else if (terms.has('media:true')) mediaType = 'images';

  return { mediaType, query };
}

/**
 * Build a tab `search` string from a free-text query plus a media type.
 * Returns `undefined` when neither contributes any terms, so callers can omit
 * the `search` field entirely.
 */
export function buildTabSearch(query: string, mediaType: TabMediaType): string | undefined {
  const parts: string[] = [];
  const trimmed = query.trim();
  if (trimmed) parts.push(trimmed);
  parts.push(...mediaTypeToSearchTerms(mediaType));
  return parts.length > 0 ? parts.join(' ') : undefined;
}
