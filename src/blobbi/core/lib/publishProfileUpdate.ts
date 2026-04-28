/**
 * publishProfileUpdate — Safe read-modify-write helper for kind 11125 updates.
 *
 * Fetches the freshest Blobbonaut profile from relays before publishing,
 * ensuring content is never accidentally wiped and stale cached data
 * cannot overwrite a newer relay version.
 *
 * Usage:
 * ```ts
 * const event = await publishProfileUpdate({
 *   nostr,
 *   pubkey: user.pubkey,
 *   publishEvent,
 *   fallbackProfile: profile,
 *   buildTags: (latest) => updateBlobbonautTags(latest.allTags, { coins: '42' }),
 * });
 * ```
 */

import type { NostrEvent, NPool } from '@nostrify/nostrify';

import {
  KIND_BLOBBONAUT_PROFILE,
  BLOBBONAUT_PROFILE_KINDS,
  getBlobbonautQueryDValues,
  isValidBlobbonautEvent,
  isLegacyBlobbonautKind,
  parseBlobbonautEvent,
  type BlobbonautProfile,
} from './blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

type PublishEventFn = (template: {
  kind: number;
  content: string;
  tags: string[][];
  prev?: NostrEvent;
}) => Promise<NostrEvent>;

export interface PublishProfileUpdateOptions {
  /** Nostr relay pool for querying the fresh event. */
  nostr: NPool;
  /** The current user's pubkey. */
  pubkey: string;
  /** The publishEvent mutation function from useNostrPublish. */
  publishEvent: PublishEventFn;
  /**
   * A cached/local profile to fall back on if the relay returns nothing.
   * This should be the profile the caller already has in scope.
   */
  fallbackProfile: BlobbonautProfile;
  /**
   * Builds the updated tag array from the latest profile.
   * Receives the freshest profile (from relay or fallback) so callers can
   * derive their tag mutations from the latest data.
   */
  buildTags: (latest: BlobbonautProfile) => string[][];
}

// ─── Fetch Helper ─────────────────────────────────────────────────────────────

/**
 * Fetch the freshest Blobbonaut profile directly from relays.
 * Prefers current kind (11125) over legacy (31125).
 * Returns null if no profile found on relays.
 */
export async function fetchFreshBlobbonautProfile(
  nostr: NPool,
  pubkey: string,
): Promise<BlobbonautProfile | null> {
  const dValues = getBlobbonautQueryDValues(pubkey);
  const signal = AbortSignal.timeout(10_000);

  const events = await nostr.query(
    [{
      kinds: [...BLOBBONAUT_PROFILE_KINDS],
      authors: [pubkey],
      '#d': dValues,
    }],
    { signal },
  );

  const validEvents = events.filter(isValidBlobbonautEvent);
  if (validEvents.length === 0) return null;

  // Prefer current kind (11125) over legacy (31125)
  const currentKindEvents = validEvents.filter(e => e.kind === KIND_BLOBBONAUT_PROFILE);
  if (currentKindEvents.length > 0) {
    const sorted = currentKindEvents.sort((a, b) => b.created_at - a.created_at);
    return parseBlobbonautEvent(sorted[0]) ?? null;
  }

  const legacyKindEvents = validEvents.filter(e => isLegacyBlobbonautKind(e));
  if (legacyKindEvents.length > 0) {
    const sorted = legacyKindEvents.sort((a, b) => b.created_at - a.created_at);
    return parseBlobbonautEvent(sorted[0]) ?? null;
  }

  return null;
}

// ─── Publish Helper ───────────────────────────────────────────────────────────

/**
 * Safe read-modify-write publish for an existing Blobbonaut profile.
 *
 * 1. Fetches the freshest profile from relays (falls back to `fallbackProfile`)
 * 2. Calls `buildTags(latest)` to construct the updated tag array
 * 3. Publishes with content and prev from the latest profile event
 *
 * @returns The published NostrEvent
 */
export async function publishProfileUpdate({
  nostr,
  pubkey,
  publishEvent,
  fallbackProfile,
  buildTags,
}: PublishProfileUpdateOptions): Promise<NostrEvent> {
  const freshProfile = await fetchFreshBlobbonautProfile(nostr, pubkey);
  const latest = freshProfile ?? fallbackProfile;

  const tags = buildTags(latest);

  return publishEvent({
    kind: KIND_BLOBBONAUT_PROFILE,
    content: latest.event.content ?? '',
    tags,
    prev: latest.event,
  });
}
