// src/blobbi/house/hooks/useBlobbiHouse.ts

/**
 * useBlobbiHouse — Fetches, bootstraps, and manages the Blobbi House
 * root event (kind 11127).
 *
 * ── Data flow ────────────────────────────────────────────────────────
 *
 * 1. Query for existing kind 11127 event for the logged-in user.
 * 2. If found, parse and validate the content → use as house data.
 * 3. If not found, check kind 11125 for legacy roomCustomization,
 *    build a new house (with or without legacy data), and publish it.
 * 4. Return the parsed house content + the raw event for write-back.
 *
 * The hook publishes the bootstrap event automatically when needed.
 * Subsequent writes use the `updateHouseEvent` callback for optimistic
 * cache updates (same pattern as useBlobbonautProfile).
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
  /** Whether the house is still loading. */
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

  const bootstrapAttemptedRef = useRef(false);

  useEffect(() => {
    // Only attempt once, when query has settled and no house exists
    if (!pubkey || query.isLoading || query.isFetching || bootstrapAttemptedRef.current) return;
    if (houseEvent) return; // House already exists

    bootstrapAttemptedRef.current = true;

    const { content, needsPublish } = resolveHouseBootstrap(
      null, // No house event
      profileEvent ?? null,
    );

    if (!needsPublish) return;

    // Publish the new house event
    publishEvent({
      kind: KIND_BLOBBI_HOUSE,
      content: JSON.stringify(content),
      tags: buildHouseTags(pubkey),
    }).then((event) => {
      // Optimistically set in cache
      queryClient.setQueryData(['blobbi-house', pubkey], event);
    }).catch((err) => {
      if (import.meta.env.DEV) {
        console.error('[useBlobbiHouse] Failed to bootstrap house:', err);
      }
      // Reset so it can be retried
      bootstrapAttemptedRef.current = false;
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

  return {
    house,
    houseEvent,
    isLoading: query.isLoading,
    updateHouseEvent,
  };
}
