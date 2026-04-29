import type { NPool } from '@nostrify/nostrify';

import {
  BLOBBONAUT_PROFILE_KINDS,
  KIND_BLOBBONAUT_PROFILE,
  getBlobbonautQueryDValues,
  isValidBlobbonautEvent,
  isLegacyBlobbonautKind,
  parseBlobbonautEvent,
  type BlobbonautProfile,
} from './blobbi';

/**
 * Fetch the freshest Blobbonaut profile (kind 11125) directly from relays,
 * bypassing any local TanStack Query cache.
 *
 * Prefers the current kind (11125) over legacy (31125). Returns a fully-parsed
 * `BlobbonautProfile` including `.event` (the raw NostrEvent) so callers can
 * pass it as `prev` to `useNostrPublish`.
 *
 * Use this inside every mutation that performs a read-modify-write on the
 * Blobbonaut profile to avoid overwriting content (daily missions JSON) or
 * tags with stale cached data.
 */
export async function fetchFreshBlobbonautProfile(
  nostr: NPool,
  pubkey: string,
): Promise<BlobbonautProfile | null> {
  const dValues = getBlobbonautQueryDValues(pubkey);

  const signal = AbortSignal.timeout(10_000);

  const events = await nostr.query([{
    kinds: [...BLOBBONAUT_PROFILE_KINDS],
    authors: [pubkey],
    '#d': dValues,
  }], { signal });

  const validEvents = events.filter(isValidBlobbonautEvent);
  if (validEvents.length === 0) return null;

  // Prefer current kind over legacy
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
