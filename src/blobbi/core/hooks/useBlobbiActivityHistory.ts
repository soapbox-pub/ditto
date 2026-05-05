/**
 * Hook for fetching Blobbi interaction history (kind 1124) for the Activity tab.
 *
 * Unlike `useBlobbiInteractions`, this hook does NOT apply the checkpoint filter.
 * It fetches the most recent interactions regardless of whether they have been
 * consumed/consolidated. This gives the owner a persistent view of who has been
 * caring for their Blobbi.
 *
 * Read-only: never mutates canonical state.
 */

import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import type { BlobbiCompanion } from '../lib/blobbi';
import {
  KIND_BLOBBI_INTERACTION,
  parseInteractionEvent,
  type BlobbiInteraction,
} from '../lib/blobbi-interaction';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of history events to fetch. */
const HISTORY_LIMIT = 50;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBlobbiActivityHistoryResult {
  /** Parsed interactions sorted newest-first (descending created_at). */
  interactions: BlobbiInteraction[];
  /** True only while the initial load is in progress with no cached data. */
  isLoading: boolean;
}

/**
 * Fetch recent interaction history for a Blobbi (no checkpoint filtering).
 *
 * @param companion - The current Blobbi companion, or null to disable.
 */
export function useBlobbiActivityHistory(
  companion: BlobbiCompanion | null,
): UseBlobbiActivityHistoryResult {
  const { nostr } = useNostr();

  const coordinate = useMemo(() => {
    if (!companion) return undefined;
    return `31124:${companion.event.pubkey}:${companion.d}`;
  }, [companion]);

  const query = useQuery({
    queryKey: ['blobbi-activity-history', coordinate],
    queryFn: async ({ signal }) => {
      if (!coordinate || !companion) return [];

      const events = await nostr.query(
        [{
          kinds: [KIND_BLOBBI_INTERACTION],
          '#a': [coordinate],
          limit: HISTORY_LIMIT,
        }],
        { signal },
      );

      // Validate, parse, exclude owner interactions (same as useBlobbiInteractions).
      const ownerPubkey = companion.event.pubkey;
      const parsed: BlobbiInteraction[] = [];
      for (const event of events) {
        if (event.pubkey === ownerPubkey) continue;
        const interaction = parseInteractionEvent(event);
        if (interaction) parsed.push(interaction);
      }

      // Sort descending (newest first) for display.
      parsed.sort((a, b) => b.createdAt - a.createdAt || b.event.id.localeCompare(a.event.id));

      return parsed;
    },
    enabled: !!coordinate,
    staleTime: 2 * 60_000,      // 2 minutes
    gcTime: 5 * 60 * 1000,      // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return {
    interactions: query.data ?? [],
    isLoading: query.isLoading,
  };
}
