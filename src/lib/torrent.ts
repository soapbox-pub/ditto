import type { NostrEvent } from '@nostrify/nostrify';

import { isLocalNetworkUrl } from '@/lib/sanitizeUrl';

/**
 * NIP-35 torrent (kind 2003).
 *
 * A torrent index entry: enough metadata to search for content and build a
 * magnet link. No `.torrent` file is stored on Nostr — the `x` tag carries the
 * BitTorrent v1 info hash, `file` tags list the files inside, and `tracker`
 * tags are optional announce URLs. The content is a pre-formatted description.
 */
export const TORRENT_KIND = 2003;

/** NIP-35 torrent comment (kind 2004). Works exactly like kind 1 (NIP-10). */
export const TORRENT_COMMENT_KIND = 2004;

/** A file inside the torrent, from a `file` tag. */
export interface TorrentFile {
  /** Full path inside the torrent, e.g. `info/example.txt`. */
  path: string;
  /** Size in bytes, when the tag carries a well-formed one. */
  size?: number;
}

/** A link to an external media database, from an `i` tag prefix. */
export interface TorrentExternalId {
  /** Database key, e.g. `imdb`, `tmdb`. */
  source: TorrentExternalSource;
  /** Display name for the database. */
  label: string;
  /** Resolved https URL on the database's site. */
  url: string;
}

export type TorrentExternalSource = 'imdb' | 'tmdb' | 'ttvdb' | 'mal' | 'anilist';

/** A fully-parsed torrent with everything the UI needs. */
export interface ParsedTorrent {
  /** Info hash, normalized to lowercase hex (or uppercase base32). */
  infoHash: string;
  /** `title` tag, if present. */
  title?: string;
  /** Pre-formatted long description (the event content). */
  description: string;
  files: TorrentFile[];
  /** Sum of every known file size. Undefined when no file declares a size. */
  totalSize?: number;
  /** Validated tracker URLs (udp, http(s), ws(s)), deduplicated. */
  trackers: string[];
  /** `tcat` category path, e.g. `['video', 'movie', '4k']`. */
  categories: string[];
  /** Links to IMDb, TMDB, TheTVDB, MyAnimeList, and AniList. */
  externalIds: TorrentExternalId[];
  /** `t` tags. */
  hashtags: string[];
}

/** V1 info hashes are 40 hex chars; magnet links also allow 32-char base32. */
const HEX_INFO_HASH_RE = /^[0-9a-f]{40}$/i;
const BASE32_INFO_HASH_RE = /^[a-z2-7]{32}$/i;

const TRACKER_PROTOCOLS = new Set(['udp:', 'http:', 'https:', 'ws:', 'wss:']);

/** Caps on attacker-controlled tag lists, to bound render and magnet size. */
const MAX_FILES = 10_000;
const MAX_TRACKERS = 20;

/** Normalize an `x` tag value to a valid info hash, or undefined. */
export function normalizeInfoHash(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (HEX_INFO_HASH_RE.test(trimmed)) return trimmed.toLowerCase();
  if (BASE32_INFO_HASH_RE.test(trimmed)) return trimmed.toUpperCase();
  return undefined;
}

function parseTracker(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (!TRACKER_PROTOCOLS.has(url.protocol) || !url.hostname) return undefined;
    // Opening the magnet has the torrent client announce to every tracker,
    // so one at a local address lets the event's author aim requests at the
    // viewer's router. `udp:` hosts come back unnormalized (`0x7f.1`), so
    // they're checked as an http host.
    if (isLocalNetworkUrl(`http://${url.host}/`)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function parseFileSize(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,16}$/.test(value)) return undefined;
  const size = Number(value);
  return Number.isSafeInteger(size) ? size : undefined;
}

const EXTERNAL_LABELS: Record<TorrentExternalSource, string> = {
  imdb: 'IMDb',
  tmdb: 'TMDB',
  ttvdb: 'TheTVDB',
  mal: 'MyAnimeList',
  anilist: 'AniList',
};

/**
 * Resolve an `i` tag prefix value (without the `tcat`/`newznab` kinds) to a
 * database URL. Every id segment is matched against a strict pattern, so the
 * resulting URL never carries attacker-controlled path characters.
 */
function parseExternalId(value: string): TorrentExternalId | undefined {
  let match: RegExpMatchArray | null;
  let source: TorrentExternalSource | undefined;
  let url: string | undefined;

  if ((match = value.match(/^imdb:(tt\d{1,12})$/))) {
    source = 'imdb';
    url = `https://www.imdb.com/title/${match[1]}/`;
  } else if ((match = value.match(/^tmdb:(movie|tv):(\d{1,12})$/))) {
    source = 'tmdb';
    url = `https://www.themoviedb.org/${match[1]}/${match[2]}`;
  } else if ((match = value.match(/^ttvdb:(movie|series):(\d{1,12})$/))) {
    source = 'ttvdb';
    url = `https://thetvdb.com/dereferrer/${match[1]}/${match[2]}`;
  } else if ((match = value.match(/^mal:(anime|manga):(\d{1,12})$/))) {
    source = 'mal';
    url = `https://myanimelist.net/${match[1]}/${match[2]}`;
  } else if ((match = value.match(/^anilist:(anime|manga):(\d{1,12})$/))) {
    source = 'anilist';
    url = `https://anilist.co/${match[1]}/${match[2]}`;
  }

  if (!source || !url) return undefined;
  return { source, label: EXTERNAL_LABELS[source], url };
}

/**
 * Parse a kind 2003 event. Returns undefined when the event is not a torrent
 * or has no valid info hash — without one there is no magnet link to offer.
 */
export function parseTorrent(event: NostrEvent): ParsedTorrent | undefined {
  if (event.kind !== TORRENT_KIND) return undefined;

  let infoHash: string | undefined;
  let title: string | undefined;
  const files: TorrentFile[] = [];
  const trackers = new Set<string>();
  let categories: string[] = [];
  const externalIds = new Map<string, TorrentExternalId>();
  const hashtags = new Set<string>();

  for (const [name, value, extra] of event.tags) {
    if (typeof value !== 'string') continue;
    switch (name) {
      case 'x':
        infoHash ??= normalizeInfoHash(value);
        break;
      case 'title':
        if (!title && value.trim()) title = value.trim();
        break;
      case 'file':
        if (value.trim() && files.length < MAX_FILES) {
          files.push({ path: value.trim(), size: parseFileSize(extra) });
        }
        break;
      case 'tracker': {
        const tracker = parseTracker(value);
        if (tracker && trackers.size < MAX_TRACKERS) trackers.add(tracker);
        break;
      }
      case 'i':
        if (value.startsWith('tcat:')) {
          if (categories.length === 0) {
            categories = value.slice(5).split(',').map((c) => c.trim()).filter(Boolean);
          }
        } else {
          const id = parseExternalId(value);
          if (id && !externalIds.has(id.url)) externalIds.set(id.url, id);
        }
        break;
      case 't':
        if (value.trim()) hashtags.add(value.trim().toLowerCase());
        break;
    }
  }

  if (!infoHash) return undefined;

  const sized = files.filter((f) => f.size !== undefined);
  const totalSize = sized.length > 0 ? sized.reduce((sum, f) => sum + (f.size ?? 0), 0) : undefined;

  return {
    infoHash,
    title,
    description: event.content,
    files,
    totalSize,
    trackers: [...trackers],
    categories,
    externalIds: [...externalIds.values()],
    hashtags: [...hashtags],
  };
}

/** Display title: the `title` tag, else the first file's name. */
export function torrentDisplayTitle(torrent: ParsedTorrent): string | undefined {
  if (torrent.title) return torrent.title;
  const first = torrent.files[0]?.path;
  return first?.split('/').pop() || undefined;
}

/** Build a BEP-9 magnet URI from a parsed torrent. */
export function buildMagnetUri(torrent: ParsedTorrent): string {
  const params = [`xt=urn:btih:${torrent.infoHash}`];
  const name = torrentDisplayTitle(torrent);
  if (name) params.push(`dn=${encodeURIComponent(name)}`);
  for (const tracker of torrent.trackers) {
    params.push(`tr=${encodeURIComponent(tracker)}`);
  }
  return `magnet:?${params.join('&')}`;
}
