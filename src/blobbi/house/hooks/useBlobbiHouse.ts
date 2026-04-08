// src/blobbi/house/hooks/useBlobbiHouse.ts

/**
 * useBlobbiHouse — Fetches, bootstraps, and manages the Blobbi House
 * root event (kind 11127).
 *
 * ── Data flow ────────────────────────────────────────────────────────
 *
 * 1. Query for existing kind 11127 event for the logged-in user.
 * 2. If found, parse and validate the content → use as house data.
 * 3. If not found AND profile event is available, check kind 11125
 *    for legacy `roomCustomization` data and merge it into a new house.
 * 4. If not found AND no legacy data, build a fresh default house.
 * 5. Return the parsed house content + the raw event for write-back.
 *
 * ── Bootstrap safety ─────────────────────────────────────────────────
 *
 * Bootstrap only fires when ALL of:
 *   - The house query has settled (not loading, not fetching)
 *   - No house event was found
 *   - The profile event has been provided (not undefined = still loading)
 *   - No bootstrap is already in progress (guarded by ref)
 *
 * This prevents duplicate publishes across re-mounts and avoids
 * firing before the profile is ready (which would miss legacy data).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { KIND_BLOBBI_HOUSE, buildHouseDTag, buildHouseTags } from '../lib/house-constants';
import { parseHouseContent } from '../lib/house-content';
import { buildDefaultHouseContent } from '../lib/house-defaults';
import { resolveHouseBootstrap } from '../lib/house-migration';
import type { BlobbiHouseContent } from '../lib/house-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseBlobbiHouseResult {
  /** The parsed house content, or null while loading. */
  house: BlobbiHouseContent | null;
  /** The raw house event, or null if not yet fetched/created. */
  houseEvent: NostrEvent | null;
  /** Whether the house is still loading (query + bootstrap). */
  isLoading: boolean;
  /** Optimistic cache update — call after publishing a new house event. */
  updateHouseEvent: (event: NostrEvent) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBlobbiHouse(
  profileEvent: NostrEvent | null | undefined,
): UseBlobbiHouseResult {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const pubkey = user?.pubkey;

  // ── Fetch existing house event ──

  const query = useQuery({
    queryKey: ['blobbi-house', pubkey],
    queryFn: async ({ signal }) => {
      if (!pubkey) return null;

      const events = await nostr.query(
        [{
          kinds: [KIND_BLOBBI_HOUSE],
          authors: [pubkey],
          '#d': [buildHouseDTag(pubkey)],
          limit: 1,
        }],
        { signal },
      );

      if (events.length === 0) return null;
      return events.reduce((latest, current) =>
        current.created_at > latest.created_at ? current : latest,
      );
    },
    enabled: !!pubkey,
    staleTime: 60_000,
  });

  const houseEvent = query.data ?? null;

  // ── Bootstrap: create house if it doesn't exist ──
  //
  // Guard: `bootstrapInFlightRef` prevents concurrent bootstrap attempts.
  // Unlike a simple "attempted" flag, this is only set while a publish is
  // in-flight and is cleared on completion (success or failure). This means:
  //   - Re-mounts don't skip bootstrap if the previous attempt failed
  //   - Concurrent attempts are prevented during in-flight publishes
  //   - Successful bootstrap is reflected via the cache update (not the ref)

  const bootstrapInFlightRef = useRef(false);

  useEffect(() => {
    // Wait for the query to fully settle
    if (!pubkey || query.isLoading || query.isFetching) return;

    // House already exists — nothing to do
    if (houseEvent) return;

    // Profile event must be explicitly available (null = no profile, undefined = still loading).
    // If undefined, we wait — bootstrap will re-evaluate when profileEvent arrives.
    if (profileEvent === undefined) return;

    // Already bootstrapping — don't fire again
    if (bootstrapInFlightRef.current) return;

    const { content, needsPublish } = resolveHouseBootstrap(
      null, // No house event
      profileEvent,
    );

    if (!needsPublish) return;

    bootstrapInFlightRef.current = true;

    // Publish the new house event
    publishEvent({
      kind: KIND_BLOBBI_HOUSE,
      content: JSON.stringify(content),
      tags: buildHouseTags(pubkey),
    }).then((event) => {
      // Optimistically set in cache so the query picks it up
      queryClient.setQueryData(['blobbi-house', pubkey], event);
    }).catch((err) => {
      if (import.meta.env.DEV) {
        console.error('[useBlobbiHouse] Failed to bootstrap house:', err);
      }
    }).finally(() => {
      bootstrapInFlightRef.current = false;
    });
  }, [pubkey, query.isLoading, query.isFetching, houseEvent, profileEvent, publishEvent, queryClient]);

  // ── Parse house content ──

  const house = useMemo((): BlobbiHouseContent | null => {
    if (!houseEvent) return null;
    return parseHouseContent(houseEvent.content) ?? buildDefaultHouseContent();
  }, [houseEvent]);

  // ── Optimistic update callback ──

  const updateHouseEvent = useCallback((event: NostrEvent) => {
    if (!pubkey) return;
    queryClient.setQueryData(['blobbi-house', pubkey], event);
  }, [pubkey, queryClient]);

  // Loading is true while the query hasn't settled OR while bootstrap is pending.
  // "Bootstrap pending" = query settled with no result and profile not yet available.
  const isBootstrapPending = !query.isLoading && !houseEvent && profileEvent === undefined;
  const isLoading = query.isLoading || isBootstrapPending;

  return {
    house,
    houseEvent,
    isLoading,
    updateHouseEvent,
  };
}
