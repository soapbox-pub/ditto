import type { NostrEvent } from '@nostrify/nostrify';

import { extractBlossomUris, resolveBlossomUri, resolveBlossomUrl } from '@/lib/blossomUri';
import { type FileEncryption } from '@/lib/encryptedFile';
import { parseImetaEntries } from '@/lib/imeta';
import { getContentWarning } from '@/lib/contentWarning';
import { mimeFromExt } from '@/lib/mediaUrls';

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
  if (/\.(mp3|mpga|ogg|flac|wav|aac|opus)(\?.*)?$/i.test(url)) return 'audio';
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
  /** Present when `url` serves ciphertext that must be decrypted before display. */
  encryption?: FileEncryption;
  allUrls: string[];
  allTypes: MediaType[];
  allDims: (string | undefined)[];
  /** Per-URL encryption, aligned with `allUrls`. */
  allEncryption: (FileEncryption | undefined)[];
  event: NostrEvent;
  hasMultiple: boolean;
  /** NIP-36 content warning reason, or empty string if flagged with no reason, or undefined if clean. */
  contentWarning?: string;
}

function extractMediaUrls(content: string): string[] {
  return content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|qt|mp3|mpga|ogg|flac|wav|aac|opus)(\?[^\s]*)?/gi) ?? [];
}

/** Event kinds that are inherently image content (NIP-68 picture posts). */
const IMAGE_KINDS = new Set([20]);

/**
 * Returns true if the event carries renderable media (image, video, or audio):
 * an `imeta` tag, an inline media URL, a BUD-10 `blossom:` media URI, or an
 * inherently-media event kind. Detection only — no Blossom resolution — so it's
 * cheap enough to call per feed card. Used to decide whether to gate a post
 * behind the "hide media from strangers" overlay.
 */
export function eventHasMedia(event: NostrEvent): boolean {
  // Any imeta tag declares an attached media file.
  if (event.tags.some((tag) => tag[0] === 'imeta')) return true;
  // Inherently media kinds (photos, video, audio) even without an imeta tag.
  if (
    IMAGE_KINDS.has(event.kind) ||
    VIDEO_KINDS.has(event.kind) ||
    AUDIO_KINDS.has(event.kind)
  ) {
    return true;
  }
  // Inline media URLs in text content.
  if (extractMediaUrls(event.content).length > 0) return true;
  // BUD-10 `blossom:` media URIs in text content.
  for (const { uri } of extractBlossomUris(event.content)) {
    if (/^(image|video|audio)\//.test(mimeFromExt(uri.ext))) return true;
  }
  return false;
}

/**
 * Extract BUD-10 `blossom:` media URIs from content and resolve them to
 * fetchable HTTPS blob URLs. Non-media extensions (pdf, bin, ...) are skipped.
 */
function extractBlossomMediaUrls(content: string, blossomServers: string[]): string[] {
  const urls: string[] = [];
  for (const { uri } of extractBlossomUris(content)) {
    const mime = mimeFromExt(uri.ext);
    if (!/^(image|video|audio)\//.test(mime)) continue;
    const [url] = resolveBlossomUri(uri, blossomServers);
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Convert an event into a {@link MediaItem} for gallery display.
 *
 * @param blossomServers - The viewer's effective Blossom servers, used to
 * resolve BUD-10 `blossom:` URIs (in imeta tags or kind-1 content) into
 * fetchable HTTPS URLs when the URI carries no usable `xs` server hint.
 */
export function eventToMediaItem(event: NostrEvent, blossomServers: string[] = []): MediaItem | null {
  const imeta = parseImetaEntries(event.tags).flatMap((entry) => {
    const url = resolveBlossomUrl(entry.url, blossomServers);
    return url ? [{ ...entry, url }] : [];
  });
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
      encryption: first.encryption,
      allUrls: imeta.map((e) => e.url),
      allTypes: imeta.map((e) => detectType(e.url, e.mime, event.kind)),
      allDims: imeta.map((e) => e.dim),
      allEncryption: imeta.map((e) => e.encryption),
      event,
      hasMultiple: imeta.length > 1,
      contentWarning: cw,
    };
  }
  if (event.kind === 1) {
    const urls = [
      ...extractMediaUrls(event.content),
      ...extractBlossomMediaUrls(event.content, blossomServers),
    ];
    if (urls.length > 0) {
      const types = urls.map((u) => detectType(u));
      return {
        url: urls[0],
        type: types[0],
        allUrls: urls,
        allTypes: types,
        allDims: urls.map(() => undefined),
        allEncryption: urls.map(() => undefined),
        event,
        hasMultiple: urls.length > 1,
        contentWarning: cw,
      };
    }
  }
  return null;
}
