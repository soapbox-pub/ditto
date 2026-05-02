import { useQuery } from '@tanstack/react-query';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Resolve a reference recording from a Wikipedia article, for use on
 * species pages (bird species in particular, but the approach is
 * generic — any Wikipedia article with an embedded non-spoken audio
 * file will work).
 *
 * Adapted from Birdstar's `useBirdSound` / `useWikipediaSound` hooks
 * (see birdstar/src/hooks/useWikipediaSound.ts for the original).
 * Birdstar falls back to iNaturalist for obscure species whose enwiki
 * article lacks a recording; we deliberately skip that fallback per
 * the user's request — Ditto only uses Wikipedia/Commons.
 *
 * Why Wikipedia? Bird species articles on enwiki carry editorially
 * curated, mostly Xeno-Canto-sourced recordings: clean, labeled,
 * single-species. The REST `page/media-list/{title}` endpoint lists
 * every media file on the article tagged by type; we pick the first
 * non-"spoken" audio item (spoken = Wikipedia spoken-article
 * narrations of the prose, which we obviously don't want). Then the
 * action API `prop=videoinfo` returns the file's URL plus MediaWiki's
 * auto-generated MP3 transcode of OGG sources, which we prefer for
 * Safari/iOS `<audio>` compat. Attribution comes from `extmetadata`
 * (Artist, LicenseShortName).
 *
 * Returns `null` when the article has no usable audio — the UI should
 * hide the player entirely in that case rather than rendering a
 * broken `<audio>` element.
 */

export interface BirdSong {
  /** Direct URL to the audio file. Prefer MP3 transcodes when OGG
   *  originals have one, for Safari/iOS compatibility. Always HTTPS —
   *  passes through sanitizeUrl before landing here. */
  audioUrl: string;
  /** Permalink to the Wikimedia Commons file-description page so
   *  curious users can see the uploader, locality, and license, and
   *  so license-compliant attribution has a clickable verification
   *  target. */
  descriptionUrl: string;
  /** Human-readable attribution line, e.g. "© Jane Doe, CC BY-SA 3.0".
   *  Shown in the UI to credit the recordist. */
  attribution: string;
}

interface MediaListItem {
  title: string;
  type?: 'audio' | 'image' | 'video';
  /** "generic" for field recordings, "spoken" for spoken-article
   *  narrations. We only want "generic". */
  audio_type?: 'generic' | 'spoken';
}

interface MediaListResponse {
  items?: MediaListItem[];
}

interface VideoInfoDerivative {
  src: string;
  type: string;
  transcodekey?: string;
}

interface ExtMetadataField {
  value: string;
}

interface VideoInfo {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  derivatives?: VideoInfoDerivative[];
  extmetadata?: {
    Artist?: ExtMetadataField;
    LicenseShortName?: ExtMetadataField;
    Credit?: ExtMetadataField;
  };
}

interface VideoInfoResponse {
  query?: {
    pages?: Record<string, { videoinfo?: VideoInfo[] }>;
  };
}

/**
 * Find the first non-spoken `audio` item on the article. The media-
 * list endpoint redirects transparently for scientific-name lookups
 * so we don't need a separate title-resolution step.
 */
async function fetchFirstAudioFile(
  title: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(
    title.replace(/\s+/g, '_'),
  )}`;
  const res = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as MediaListResponse;
  for (const item of data.items ?? []) {
    if (item.type !== 'audio') continue;
    // Drop Wikipedia spoken-article recordings — these are
    // encyclopaedia narrations, not field recordings.
    if (item.audio_type === 'spoken') continue;
    return item.title;
  }
  return null;
}

/**
 * Look up `videoinfo` for a Commons file title. The endpoint name is
 * a legacy artifact; `videoinfo` is the unified property for any
 * transcodable media including audio.
 */
async function fetchFileSong(
  fileTitle: string,
  signal?: AbortSignal,
): Promise<BirdSong | null> {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'videoinfo');
  url.searchParams.set('viprop', 'url|mime|derivatives|extmetadata');
  url.searchParams.set('titles', fileTitle);
  // `origin=*` unlocks anonymous CORS for action API requests.
  url.searchParams.set('origin', '*');

  const res = await fetch(url.toString(), {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as VideoInfoResponse;
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const info = page?.videoinfo?.[0];
  if (!info) return null;

  // Prefer the MP3 transcode for Safari/iOS compat. Fall back to the
  // original URL when no derivative exists (already-MP3 or WAV
  // sources don't get transcoded).
  const mp3 = info.derivatives?.find((d) => d.type.startsWith('audio/mpeg'));
  const rawAudioUrl = mp3?.src ?? info.url;
  const audioUrl = sanitizeUrl(rawAudioUrl);
  if (!audioUrl) return null;

  const descriptionUrl =
    sanitizeUrl(info.descriptionurl) ??
    `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`;

  const artist = htmlToText(info.extmetadata?.Artist?.value);
  const license = htmlToText(info.extmetadata?.LicenseShortName?.value);
  const credit = htmlToText(info.extmetadata?.Credit?.value);
  const attribution = buildAttribution(artist, license, credit);

  return { audioUrl, descriptionUrl, attribution };
}

/**
 * Strip HTML tags from an extmetadata value. Wikipedia wraps these in
 * inline `<a>` links which render as literal markup if we don't.
 * DOMParser decodes HTML entities correctly on both browsers and
 * jsdom (used in tests).
 */
function htmlToText(html: string | undefined): string | null {
  if (!html) return null;
  if (typeof DOMParser === 'undefined') {
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    return stripped || null;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent ?? '').trim();
  return text || null;
}

/**
 * Compose an attribution string roughly matching how the UI in
 * Birdstar formats it: "© {artist}, {license}" when possible,
 * degrading gracefully as fields go missing. Falls back to a
 * generic "Wikimedia Commons" so the link target still has a label.
 */
function buildAttribution(
  artist: string | null,
  license: string | null,
  credit: string | null,
): string {
  if (artist && license) return `© ${artist}, ${license}`;
  if (artist) return `© ${artist}`;
  if (license) return license;
  if (credit) return credit;
  return 'Wikimedia Commons';
}

async function fetchBirdSong(
  title: string,
  signal?: AbortSignal,
): Promise<BirdSong | null> {
  const file = await fetchFirstAudioFile(title, signal);
  if (!file) return null;
  return fetchFileSong(file, signal);
}

/**
 * Resolve a reference recording (song, call) from a Wikipedia article
 * title. Returns `null` when the article has no usable audio so the
 * UI can hide the player rather than rendering a broken element.
 *
 * Recordings don't change often, so results cache for 24h in the
 * TanStack query layer — repeat visits to the same species page are
 * instant.
 */
export function useBirdSong(title: string | null) {
  return useQuery<BirdSong | null>({
    queryKey: ['bird-song', title],
    enabled: Boolean(title),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    queryFn: ({ signal }) => fetchBirdSong(title!, signal),
  });
}
