import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import type { AudioTrack } from '@/contexts/audioPlayerContextDef';
import { parseFirstImeta } from '@/lib/imeta';
import { type FileEncryption } from '@/lib/encryptedFile';

/** Gets a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse imeta fields. */
function parseImeta(tags: string[][]): { url?: string; thumbnail?: string; duration?: string; mime?: string; encryption?: FileEncryption } {
  const entry = parseFirstImeta(tags);
  if (!entry) return {};
  return {
    url: entry.url,
    thumbnail: entry.thumbnail,
    duration: entry.duration,
    mime: entry.mime,
    encryption: entry.encryption,
  };
}

export interface ParsedPodcastEpisode {
  title: string;
  audioUrl: string;
  audioMime?: string;
  pubdate?: number;
  description: string;
  artwork?: string;
  duration?: number;
}

/** Parse a kind 30054 podcast episode event. */
export function parsePodcastEpisode(event: NostrEvent): ParsedPodcastEpisode | null {
  const title = getTag(event.tags, 'title') ?? getTag(event.tags, 'subject') ?? 'Untitled Episode';
  const imeta = parseImeta(event.tags);

  // The spec uses ["audio", "url", "mime"] tag
  const audioTag = event.tags.find(([n]) => n === 'audio');
  const audioUrl = audioTag?.[1] ?? imeta.url ?? getTag(event.tags, 'url') ?? getTag(event.tags, 'media');
  if (!audioUrl) return null;

  const audioMimeFromTag = audioTag?.[2];

  const durationStr = imeta.duration ?? getTag(event.tags, 'duration');
  const duration = durationStr ? parseFloat(durationStr) : undefined;

  // pubdate can be RFC2822 string or unix timestamp
  const pubdateStr = getTag(event.tags, 'pubdate') ?? getTag(event.tags, 'published_at');
  let pubdate: number | undefined;
  if (pubdateStr) {
    const parsed = parseInt(pubdateStr, 10);
    if (isFinite(parsed) && String(parsed) === pubdateStr) {
      pubdate = parsed;
    } else {
      const d = new Date(pubdateStr);
      pubdate = isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : event.created_at;
    }
  } else {
    pubdate = event.created_at;
  }

  return {
    title,
    audioUrl,
    audioMime: audioMimeFromTag ?? imeta.mime ?? getTag(event.tags, 'm'),
    pubdate: pubdate && isFinite(pubdate) ? pubdate : undefined,
    description: getTag(event.tags, 'description') || event.content || '',
    artwork: getTag(event.tags, 'image') ?? imeta.thumbnail ?? getTag(event.tags, 'thumb'),
    duration: duration && isFinite(duration) ? duration : undefined,
  };
}

export interface ParsedPodcastTrailer {
  title: string;
  url: string;
  pubdate?: number;
  type?: string;
  season?: string;
}

/** Parse a kind 30055 podcast trailer event. */
export function parsePodcastTrailer(event: NostrEvent): ParsedPodcastTrailer | null {
  const title = getTag(event.tags, 'title') ?? getTag(event.tags, 'subject') ?? 'Trailer';
  const imeta = parseImeta(event.tags);
  const url = imeta.url ?? getTag(event.tags, 'url') ?? getTag(event.tags, 'media');
  if (!url) return null;

  return {
    title,
    url,
    pubdate: event.created_at,
    type: getTag(event.tags, 'type'),
    season: getTag(event.tags, 'season'),
  };
}

/** Gets a tag value by name. */
function getTagValue(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Compute the naddr path for an addressable event. */
function eventPath(event: NostrEvent): string {
  const d = getTagValue(event.tags, 'd') ?? '';
  return '/' + nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: d });
}

/** Convert a parsed podcast episode + event into an AudioTrack for the player. */
export function episodeToAudioTrack(event: NostrEvent, parsed: ParsedPodcastEpisode): AudioTrack {
  return {
    id: event.id,
    title: parsed.title,
    artist: '',
    url: parsed.audioUrl,
    artwork: parsed.artwork,
    duration: parsed.duration,
    path: eventPath(event),
  };
}

/** Convert a parsed podcast trailer + event into an AudioTrack for the player. */
export function trailerToAudioTrack(event: NostrEvent, parsed: ParsedPodcastTrailer): AudioTrack {
  return {
    id: event.id,
    title: parsed.title,
    artist: '',
    url: parsed.url,
    path: eventPath(event),
  };
}
