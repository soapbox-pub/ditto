import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  isLegacyBlobbiEvent,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
  type BlobbonautProfile,
  type StorageItem,
} from '@blobbi/core/blobbi';

import { fetchFreshBlobbonautProfile } from '@blobbi/core/fetchFreshBlobbonautProfile';

/**
 * Options for the fresh-fetch helper.
 */
export interface FreshBlobbiOptions {
  /** The currently selected companion (cached) */
  companion: BlobbiCompanion;
  /** The user's profile (cached) */
  profile: BlobbonautProfile;
  /** Callback to update the profile event in query cache */
  updateProfileEvent: (event: NostrEvent) => void;
  /** Callback to update the companion event in query cache */
  updateCompanionEvent: (event: NostrEvent) => void;
}

/**
 * Result of fetchFreshBlobbiBeforeAction — the freshest companion + profile
 * data to use as the base for a read-modify-write mutation.
 */
export interface FreshBlobbiResult {
  /** The (fresh) companion to act on */
  companion: BlobbiCompanion;
  /** The companion event tags to use for the action */
  allTags: string[][];
  /** The companion event content to use */
  content: string;
  /** The latest profile tags to use for profile updates */
  profileAllTags: string[][];
  /** The previous profile event, for passing as `prev` to publishEvent */
  profileEvent: NostrEvent;
  /** The latest profile storage to use as the base for storage modifications */
  profileStorage: StorageItem[];
}

/**
 * Hook providing the read step of the read-modify-write pattern for Blobbi
 * interactions.
 *
 * Before any action, fetches the freshest companion + profile directly from
 * relays (bypassing potentially stale cache) so mutations never publish over a
 * newer event with stale data.
 *
 * NOTE: This hook does NOT migrate old-app legacy Blobbi events. Automatic
 * migration of legacy formats was removed; only current canonical Blobbis are
 * supported.
 *
 * @param pubkey - The owner's hex pubkey. When absent (logged out),
 *                 `fetchFreshBlobbiBeforeAction` returns null.
 */
export function useFreshBlobbiBeforeAction(pubkey?: string) {
  const { nostr } = useNostr();

  /**
   * Fetch the freshest companion event directly from relays, bypassing cache.
   *
   * Old-app legacy Blobbi events are excluded: they are unsupported and must
   * never be returned as an actionable companion, so they can never become the
   * base for a republish (no migration into the canonical format).
   */
  const fetchFreshCompanion = useCallback(async (
    ownerPubkey: string,
    dTag: string,
  ): Promise<BlobbiCompanion | null> => {
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [ownerPubkey],
      '#d': [dTag],
    }]);

    const validEvents = events
      .filter((event) => isValidBlobbiEvent(event) && !isLegacyBlobbiEvent(event))
      .sort((a, b) => b.created_at - a.created_at);

    if (validEvents.length === 0) return null;
    return parseBlobbiEvent(validEvents[0]) ?? null;
  }, [nostr]);

  /**
   * Fetch fresh companion + profile data before performing an action.
   *
   * CRITICAL: This fetches fresh data from relays (read-modify-write pattern)
   * instead of using potentially stale cache data. This prevents state resets
   * caused by publishing over a newer event with stale cached data.
   *
   * Returns the fresh companion + profile context to use for the action, or
   * null if there is no logged-in user.
   */
  const fetchFreshBlobbiBeforeAction = useCallback(async (
    options: FreshBlobbiOptions,
  ): Promise<FreshBlobbiResult | null> => {
    if (!pubkey) return null;

    const { companion: cachedCompanion, profile: cachedProfile } = options;

    // Old-app legacy Blobbis are unsupported and must never become the base for
    // a publish. If the cached companion is itself legacy, bail out *before*
    // fetching — otherwise the `freshCompanion ?? cachedCompanion` fallback
    // below could return the legacy cached companion when the fresh fetch
    // (which filters out legacy events) returns null, reintroducing the legacy
    // event into a publish path (e.g. useCanonicalSync's refresh sync).
    if (cachedCompanion.isLegacy) {
      console.warn(
        '[FreshBlobbi] Refusing to act on legacy companion (unsupported):',
        cachedCompanion.d.slice(0, 24),
      );
      return null;
    }

    // Fetch fresh data from relays (read step of read-modify-write)
    const [freshCompanion, freshProfile] = await Promise.all([
      fetchFreshCompanion(pubkey, cachedCompanion.d),
      fetchFreshBlobbonautProfile(nostr, pubkey),
    ]);

    // Use fresh data, falling back to the cached companion only when the relay
    // fetch returned nothing (transient miss, or a freshly-created canonical
    // Blobbi not yet propagated). The cached companion is guaranteed non-legacy
    // here (we bailed above if it was legacy), so this fallback can never
    // reintroduce a legacy event into a publish path.
    const companion = freshCompanion ?? cachedCompanion;
    const profile = freshProfile ?? cachedProfile;

    return {
      companion,
      allTags: companion.allTags,
      content: companion.event.content,
      profileAllTags: profile.allTags,
      profileEvent: profile.event,
      profileStorage: profile.storage,
    };
  }, [pubkey, nostr, fetchFreshCompanion]);

  return {
    /** Fetch fresh companion + profile data before an action */
    fetchFreshBlobbiBeforeAction,
  };
}
