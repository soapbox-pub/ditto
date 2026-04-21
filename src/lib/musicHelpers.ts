import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import type { AudioTrack } from '@/contexts/audioPlayerContextDef';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse imeta fields relevant to music tracks. */
function parseImeta(tags: string[][]): { url?: string; thumbnail?: string; duration?: string; blurhash?: string; format?: string } {
  for (const tag of tags) {
    if (tag[0] !== 'imeta') continue;
    const parts: Record<string, string> = {};
    for (let i = 1; i < tag.length; i++) {
      const p = tag[i];
      const sp = p.indexOf(' ');
      if (sp !== -1) parts[p.slice(0, sp)] = p.slice(sp + 1);
    }
    if (parts.url) {
      return {
        url: parts.url,
        thumbnail: parts.image ?? parts.thumb,
        duration: parts.duration,
        blurhash: parts.blurhash,
        format: parts.m,
      };
    }
  }
  return {};
}

export interface ParsedMusicTrack {
  title: string;
  artist: string;
  url: string;
  artwork?: string;
  album?: string;
  duration?: number;
  videoUrl?: string;
  format?: string;
}

/** Parse a kind 36787 music track event into structured data. */
export function parseMusicTrack(event: NostrEvent): ParsedMusicTrack | null {
  const title = getTag(event.tags, 'title') ?? getTag(event.tags, 'subject') ?? (event.content.slice(0, 80) || 'Untitled');
  const artist = getTag(event.tags, 'artist') ?? getTag(event.tags, 'creator') ?? '';
  const album = getTag(event.tags, 'album');
  const imeta = parseImeta(event.tags);

  // Audio URL: try imeta first, then standalone url tag, then content if it looks like a URL
  const url = sanitizeUrl(imeta.url) ?? sanitizeUrl(getTag(event.tags, 'url')) ?? sanitizeUrl(getTag(event.tags, 'media'));
  if (!url) return null;

  const durationStr = imeta.duration ?? getTag(event.tags, 'duration');
  const duration = durationStr ? parseFloat(durationStr) : undefined;

  return {
    title,
    artist,
    url,
    artwork: sanitizeUrl(imeta.thumbnail) ?? sanitizeUrl(getTag(event.tags, 'image')) ?? sanitizeUrl(getTag(event.tags, 'thumb')),
    album,
    duration: duration && isFinite(duration) ? duration : undefined,
    videoUrl: sanitizeUrl(getTag(event.tags, 'video')),
    format: imeta.format ?? getTag(event.tags, 'm'),
  };
}

export interface ParsedMusicPlaylist {
  title: string;
  description: string;
  artwork?: string;
  trackRefs: string[];
  /** Whether this playlist is tagged as an album (`t` tag with value `album`). */
  isAlbum: boolean;
  /** ISO 8601 release date (albums). */
  released?: string;
  /** Record label name (albums). */
  label?: string;
}

/** Parse a kind 34139 music playlist event into structured data. */
export function parseMusicPlaylist(event: NostrEvent): ParsedMusicPlaylist | null {
  const title = getTag(event.tags, 'title') ?? getTag(event.tags, 'd') ?? 'Untitled Playlist';
  const description = event.content || '';
  const artwork = sanitizeUrl(getTag(event.tags, 'image')) ?? sanitizeUrl(getTag(event.tags, 'thumb'));

  // Track references are stored as 'a' or 'e' tags
  const trackRefs = event.tags
    .filter(([n]) => n === 'a' || n === 'e')
    .map(([, v]) => v);

  // Album detection: look for a 't' tag with value 'album'
  const tTags = event.tags.filter(([n]) => n === 't').map(([, v]) => v?.toLowerCase());
  const isAlbum = tTags.includes('album');

  const released = getTag(event.tags, 'released');
  const label = getTag(event.tags, 'label');

  return { title, description, artwork, trackRefs, isAlbum, released, label };
}

/** Compute the naddr path for an addressable event. */
function eventPath(event: NostrEvent): string {
  const d = getTag(event.tags, 'd') ?? '';
  return '/' + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
}

/** Convert a parsed music track + event into an AudioTrack for the player. */
export function toAudioTrack(event: NostrEvent, parsed: ParsedMusicTrack): AudioTrack {
  return {
    id: event.id,
    title: parsed.title,
    artist: parsed.artist,
    url: parsed.url,
    artwork: parsed.artwork,
    duration: parsed.duration,
    path: eventPath(event),
  };
}
