import { useCallback } from 'react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';

import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  parseBlobbiEvent,
  type BlobbiCompanion,
  type BlobbonautProfile,
  type StorageItem,
} from '../lib/blobbi';

import { fetchFreshBlobbonautProfile } from '../lib/fetchFreshBlobbonautProfile';

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
 */
export function useFreshBlobbiBeforeAction() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  /**
   * Fetch the freshest companion event directly from relays, bypassing cache.
   */
  const fetchFreshCompanion = useCallback(async (
    pubkey: string,
    dTag: string,
  ): Promise<BlobbiCompanion | null> => {
    const events = await nostr.query([{
      kinds: [KIND_BLOBBI_STATE],
      authors: [pubkey],
      '#d': [dTag],
    }]);

    const validEvents = events
      .filter(isValidBlobbiEvent)
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
    if (!user?.pubkey) return null;

    const { companion: cachedCompanion, profile: cachedProfile } = options;

    // Fetch fresh data from relays (read step of read-modify-write)
    const [freshCompanion, freshProfile] = await Promise.all([
      fetchFreshCompanion(user.pubkey, cachedCompanion.d),
      fetchFreshBlobbonautProfile(nostr, user.pubkey),
    ]);

    // Use fresh data, falling back to cached only if relay fetch returned nothing
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
  }, [user?.pubkey, nostr, fetchFreshCompanion]);

  return {
    /** Fetch fresh companion + profile data before an action */
    fetchFreshBlobbiBeforeAction,
  };
}
