import type { NostrEvent } from '@nostrify/nostrify';

import { getContentWarning } from '@/lib/contentWarning';

export type MediaType = 'image' | 'video' | 'audio';

/** Event kinds that are inherently video content (vines, horizontal video, vertical video). */
const VIDEO_KINDS = new Set([34236, 21, 22]);
/** Event kinds that are inherently audio content (music tracks, podcast episodes/trailers). */
const AUDIO_KINDS = new Set([36787, 34139, 30054, 30055, 1222]);

function detectType(url: string, mime?: string, eventKind?: number): MediaType {
  if (mime) {
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('image/')) return 'image';
  }
  if (/\.(mp4|webm|mov|qt|m3u8)(\?.*)?$/i.test(url)) return 'video';
  if (/\.(mp3|ogg|flac|wav|aac|opus)(\?.*)?$/i.test(url)) return 'audio';
  // Fall back to event kind for extensionless URLs (e.g. Blossom content-addressed URLs)
  if (eventKind !== undefined) {
    if (VIDEO_KINDS.has(eventKind)) return 'video';
    if (AUDIO_KINDS.has(eventKind)) return 'audio';
  }
  return 'image';
}

/** Default aspect ratio when dim tag is missing or unparseable. */
const DEFAULT_ASPECT_RATIO = 1;

/** Parse a dim string like "1280x720" into a width/height aspect ratio number. */
export function parseDimToAspectRatio(dim?: string): number {
  if (!dim) return DEFAULT_ASPECT_RATIO;
  const match = dim.match(/^(\d+)x(\d+)$/);
  if (!match) return DEFAULT_ASPECT_RATIO;
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  if (!w || !h) return DEFAULT_ASPECT_RATIO;
  return w / h;
}

export interface MediaItem {
  url: string;
  type: MediaType;
  blurhash?: string;
  dim?: string;
  alt?: string;
  mime?: string;
  allUrls: string[];
  allTypes: MediaType[];
  allDims: (string | undefined)[];
  event: NostrEvent;
  hasMultiple: boolean;
  /** NIP-36 content warning reason, or empty string if flagged with no reason, or undefined if clean. */
  contentWarning?: string;
}

function parseImeta(tags: string[][]): { url: string; blurhash?: string; dim?: string; alt?: string; mime?: string }[] {
  const results: { url: string; blurhash?: string; dim?: string; alt?: string; mime?: string }[] = [];
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const sp = tag[i].indexOf(' ');
      if (sp !== -1) parts[tag[i].slice(0, sp)] = tag[i].slice(sp + 1);
    }
    if (parts.url) results.push({ url: parts.url, blurhash: parts.blurhash, dim: parts.dim, alt: parts.alt, mime: parts.m });
  }
  return results;
}

function extractMediaUrls(content: string): string[] {
  return content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|qt|mp3|ogg|flac|wav|aac|opus)(\?[^\s]*)?/gi) ?? [];
}

export function eventToMediaItem(event: NostrEvent): MediaItem | null {
  const imeta = parseImeta(event.tags);
  const cw = getContentWarning(event);
  if (imeta.length > 0) {
    const first = imeta[0];
    const firstType = detectType(first.url, first.mime, event.kind);
    return {
      url: first.url,
      type: firstType,
      blurhash: first.blurhash,
      dim: first.dim,
      alt: first.alt,
      mime: first.mime,
      allUrls: imeta.map((e) => e.url),
      allTypes: imeta.map((e) => detectType(e.url, e.mime, event.kind)),
      allDims: imeta.map((e) => e.dim),
      event,
      hasMultiple: imeta.length > 1,
      contentWarning: cw,
    };
  }
  if (event.kind === 1) {
    const urls = extractMediaUrls(event.content);
    if (urls.length > 0) {
      const types = urls.map((u) => detectType(u));
      return {
        url: urls[0],
        type: types[0],
        allUrls: urls,
        allTypes: types,
        allDims: urls.map(() => undefined),
        event,
        hasMultiple: urls.length > 1,
        contentWarning: cw,
      };
    }
  }
  return null;
}
