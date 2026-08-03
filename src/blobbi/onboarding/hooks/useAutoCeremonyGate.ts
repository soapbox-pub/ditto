/**
 * useAutoCeremonyGate — decides when the page may *silently* start the hatching
 * ceremony for a user.
 *
 * Starting that ceremony publishes a brand-new Blobbi, so a wrong "yes" is
 * expensive and user-visible: a returning Blobbonaut ends up with a second,
 * duplicate Blobbi they never asked for. The whole job of this gate is to make
 * sure "this user has nothing yet" is a fact confirmed by the relays, and not
 * merely the absence of data during loading, an error, or a logged-out moment.
 *
 * It deliberately says "no" while uncertain. Waiting shows a loading state for a
 * moment longer; guessing wrong mints a duplicate.
 */

import { useCallback, useRef } from 'react';
import type { BlobbiCompanion, BlobbonautProfile } from '@blobbi-kit/core/blobbi';

export interface AutoCeremonyGateInput {
  /** The logged-in user's pubkey, or undefined while logged out / still resolving. */
  pubkey: string | undefined;
  /** The Blobbonaut profile, or null when the query settled with none. */
  profile: BlobbonautProfile | null;
  /** True once the profile query has completed successfully at least once. */
  profileSettled: boolean;
  /** Companions returned by the collection query. */
  companions: BlobbiCompanion[];
  /** True while the collection query has no data yet. */
  collectionLoading: boolean;
  /** True while the collection query is fetching (including background refetches). */
  collectionFetching: boolean;
  /** The collection query's error, if it failed. */
  collectionError: Error | null;
}

export interface AutoCeremonyGate {
  /**
   * True only for a confirmed brand-new user: the profile query succeeded and
   * came back empty. A null profile that is merely unloaded does not qualify.
   */
  definitelyNeedsCeremony: boolean;
  /**
   * True when the companion list can be trusted to decide whether this user owns
   * anything — an empty list is only meaningful once the query really succeeded.
   */
  companionDataReady: boolean;
  /**
   * Claim the single automatic start allowed per page mount. Returns true to the
   * first caller and false to every caller after it, so repeated effect runs,
   * re-renders and query refreshes cannot start a second ceremony.
   */
  claimAutomaticStart: () => boolean;
  /** Whether the automatic start has already been claimed this mount. */
  hasClaimedAutomaticStart: () => boolean;
}

export function useAutoCeremonyGate({
  pubkey,
  profile,
  profileSettled,
  companions,
  collectionLoading,
  collectionFetching,
  collectionError,
}: AutoCeremonyGateInput): AutoCeremonyGate {
  // One-shot latch. Without it the no-profile gate can re-fire after the
  // ceremony's own pre-publish guard aborts and completes while `profile` is
  // still null, looping the ceremony and re-querying relays each time.
  const claimedRef = useRef(false);

  const claimAutomaticStart = useCallback(() => {
    if (claimedRef.current) return false;
    claimedRef.current = true;
    return true;
  }, []);

  const hasClaimedAutomaticStart = useCallback(() => claimedRef.current, []);

  // Only a *successfully settled* empty profile means "new user". A null profile
  // during an in-flight fetch, an error, or a transient empty relay response must
  // not trigger auto-creation.
  const definitelyNeedsCeremony = !profile && profileSettled;

  // The collection query is disabled until a pubkey exists, and a disabled query
  // also reports `isLoading: false` — so without the pubkey check the logged-out
  // window is indistinguishable from a settled-empty collection.
  const collectionSettled = !!pubkey && !collectionLoading && !collectionError;

  const companionDataReady =
    collectionSettled && (!collectionFetching || companions.length > 0);

  return {
    definitelyNeedsCeremony,
    companionDataReady,
    claimAutomaticStart,
    hasClaimedAutomaticStart,
  };
}
