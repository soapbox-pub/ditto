import type { NostrEvent } from '@nostrify/nostrify';
import { isNostrId } from '@/lib/nostrId';
import type { ParsedAddr } from '@/lib/parseAddr';

/** NIP-72 community definition kind. */
export const COMMUNITY_KIND = 34550;
/** NIP-72 community post approval kind. */
export const COMMUNITY_APPROVAL_KIND = 4550;
/** NIP-51 "communities list" kind (joined communities). */
export const COMMUNITY_LIST_KIND = 10004;

/** A parsed NIP-72 kind 34550 community definition. */
export interface Community {
  /** The raw kind 34550 event. */
  event: NostrEvent;
  /** The `34550:<pubkey>:<d>` coordinate for this community. */
  coord: string;
  /** The community's `d` tag identifier. */
  identifier: string;
  /** Display name (`name` tag, falling back to the `d` tag). */
  name: string;
  /** Freeform description from the `description` tag. */
  description: string;
  /** Community image URL (unsanitized — run through sanitizeUrl before use in src). */
  image?: string;
  /**
   * Moderator pubkeys from `p` tags with the "moderator" role, validated as
   * 64-char hex at the parse layer. Does NOT include the owner — use
   * {@link communityModerators} for the full trust set.
   */
  moderators: string[];
  /** Preferred relays from `relay` tags. */
  relays: { url: string; marker?: string }[];
}

/** Build the `34550:<pubkey>:<d>` coordinate for community addr coords. */
export function communityCoord(addr: Pick<ParsedAddr, 'pubkey' | 'identifier'>): string {
  return `${COMMUNITY_KIND}:${addr.pubkey}:${addr.identifier}`;
}

/**
 * Parse a kind 34550 community definition event.
 *
 * Moderator pubkeys are validated with `isNostrId` here so consumers can
 * pass them straight into filter `authors` arrays and `nip19` encoders.
 */
export function parseCommunity(event: NostrEvent): Community {
  const getTag = (name: string): string | undefined =>
    event.tags.find(([n]) => n === name)?.[1];

  const identifier = getTag('d') ?? '';
  const name = getTag('name') || identifier || 'Unnamed Community';
  const description = getTag('description') ?? '';
  const image = getTag('image');

  const moderators = event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter((pubkey): pubkey is string => isNostrId(pubkey));

  const relays = event.tags
    .filter(([n, url]) => n === 'relay' && !!url)
    .map(([, url, marker]) => ({ url, marker }));

  return {
    event,
    coord: communityCoord({ pubkey: event.pubkey, identifier }),
    identifier,
    name,
    description,
    image,
    moderators,
    relays,
  };
}

/**
 * The full set of pubkeys trusted to moderate a community: the owner
 * (definition author) plus every `p`-tagged moderator, deduped.
 *
 * Use this as the `authors` filter when querying kind 4550 approvals —
 * anyone can publish an approval event, but only these count.
 */
export function communityModerators(community: Community): string[] {
  return [...new Set([community.event.pubkey, ...community.moderators])];
}

/** Whether a pubkey is the community owner or a listed moderator. */
export function isCommunityModerator(community: Community, pubkey: string | undefined): boolean {
  if (!pubkey) return false;
  return communityModerators(community).includes(pubkey);
}

/** Whether a string is a well-formed websocket relay URL. */
export function isRelayUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
  } catch {
    return false;
  }
}

/**
 * The relay URLs where a community's posts and approvals live, from the
 * definition's `relay` tags (NIP-72). The `author` marker is excluded —
 * that relay only hosts the owner's kind 0. Capped to avoid fanning out
 * to an unbounded set of attacker-supplied relays.
 */
export function communityRelayUrls(communities: Community | Community[], cap = 10): string[] {
  const list = Array.isArray(communities) ? communities : [communities];
  const urls = new Set<string>();
  for (const community of list) {
    for (const { url, marker } of community.relays) {
      if (marker === 'author') continue;
      if (isRelayUrl(url)) urls.add(url);
    }
  }
  return [...urls].slice(0, cap);
}

/**
 * Slugify a community name into a `d` tag identifier
 * (lowercase, hyphen-separated, alphanumerics only).
 */
export function communitySlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
