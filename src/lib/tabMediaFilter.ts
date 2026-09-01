/**
 * Content-type (media) filtering for custom profile tabs.
 *
 * Profile tabs query through `useTabFeed`, which forwards `filter.search`
 * verbatim to the relay. Ditto's relay understands the NIP-50 `media:` /
 * `video:` search extensions (the same ones the Search page and the profile
 * Media tab use), so a media filter is expressed purely as extra search terms
 * appended to the tab's `search` string.
 *
 * Unlike the Search page's single-select media filter, a profile tab lets the
 * user combine Images and Videos (an inclusive OR): selecting both means "any
 * media" (`media:true`) — i.e. show only media, of any kind. The relay ANDs
 * multiple search extensions together, so this is the one media combination
 * that's expressible server-side. "No media" is the logical opposite of having
 * media, so it stays mutually exclusive with Images/Videos.
 *
 * `vines` is intentionally omitted from this enum: on the Search page it maps
 * to dedicated kinds (22 / 34236), which a profile tab already handles through
 * its explicit "Content Kinds" picker.
 */
import { Image, Type, Video } from 'lucide-react';
import type { ComponentType } from 'react';

/** Selectable media categories. Images/Videos combine; `none` is exclusive. */
export const TAB_MEDIA_CATEGORIES = ['images', 'videos', 'none'] as const;
export type TabMediaCategory = typeof TAB_MEDIA_CATEGORIES[number];

/** Human-readable labels for the media-category toggles. */
export const TAB_MEDIA_LABELS: Record<TabMediaCategory, string> = {
  images: 'Images',
  videos: 'Videos',
  none: 'No media',
};

/** Icons for the media-category toggles, echoing the app's content vocabulary. */
export const TAB_MEDIA_ICONS: Record<TabMediaCategory, ComponentType<{ className?: string }>> = {
  images: Image,
  videos: Video,
  none: Type,
};

/** Matches a single NIP-50 media/video extension term. */
const MEDIA_TERM_RE = /\b(?:media|video):(?:true|false)\b/gi;

/**
 * NIP-50 search terms for a set of media categories. Empty when nothing (or
 * everything) is selected — both mean "no media constraint".
 *
 * The relay ANDs search extensions, so only these combinations are
 * expressible; the UI enforces that `none` never co-occurs with Images/Videos,
 * but this function stays total and falls back to "no constraint" for any
 * combination that can't be expressed server-side.
 */
export function mediaCategoriesToSearchTerms(categories: Set<TabMediaCategory>): string[] {
  const images = categories.has('images');
  const videos = categories.has('videos');
  const none = categories.has('none');

  // "No media" is exclusive; if it slips in alongside media, media wins only
  // when it can be expressed, otherwise fall through to no constraint.
  if (none && !images && !videos) return ['media:false'];

  if (images && videos) return ['media:true']; // any media — "show only media"
  if (images && !videos) return ['media:true', 'video:false']; // images, no video
  if (videos && !images) return ['video:true'];

  return []; // nothing selected, or an inexpressible mix → show everything
}

/**
 * Split a tab's `search` string into its selected media categories and the
 * remaining free-text query. The inverse of appending
 * `mediaCategoriesToSearchTerms`.
 */
export function parseMediaSearch(search: string): { categories: Set<TabMediaCategory>; query: string } {
  const terms = new Set<string>();
  const query = search
    .replace(MEDIA_TERM_RE, (m) => {
      terms.add(m.toLowerCase());
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const categories = new Set<TabMediaCategory>();
  if (terms.has('media:false')) {
    categories.add('none');
  } else if (terms.has('media:true')) {
    // `media:true video:false` = images only; `media:true` alone = any media.
    categories.add('images');
    if (!terms.has('video:false')) categories.add('videos');
  } else if (terms.has('video:true')) {
    categories.add('videos');
  }

  return { categories, query };
}

/**
 * Build a tab `search` string from a free-text query plus a set of media
 * categories. Returns `undefined` when neither contributes any terms, so
 * callers can omit the `search` field entirely.
 */
export function buildTabSearch(query: string, categories: Set<TabMediaCategory>): string | undefined {
  const parts: string[] = [];
  const trimmed = query.trim();
  if (trimmed) parts.push(trimmed);
  parts.push(...mediaCategoriesToSearchTerms(categories));
  return parts.length > 0 ? parts.join(' ') : undefined;
}
