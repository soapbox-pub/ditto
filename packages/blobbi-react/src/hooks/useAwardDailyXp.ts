/**
 * useAwardDailyXp - Award XP for completed daily missions.
 *
 * Completion is implicit (derived from progress vs target). This hook
 * calculates the total XP earned today and persists the updated XP total to
 * the kind 11125 Blobbonaut profile tags.
 *
 * Uses fetchFreshEvent to avoid stale-read overwrites when multiple mutations
 * race (e.g. item-use XP + daily XP).
 *
 * Headless and app-agnostic: it surfaces success/error through the returned
 * mutation (and optional callbacks) so the host app can render its own user
 * feedback (toasts, cache invalidation, etc.). The host supplies the owner
 * `pubkey`, a `publish` function, and an optional cache-update callback.
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBONAUT_PROFILE,
  updateBlobbonautTags,
  parseBlobbonautEvent,
} from '@blobbi/core/blobbi';
import { buildXpTagUpdates } from '@blobbi/core/progression';
import { serializeProfileContent } from '@blobbi/core/missions';
import type { MissionsContent } from '@blobbi/core/missions';
import { fetchFreshEvent } from '@blobbi/core/fetchFreshEvent';

import { totalDailyXp } from '../lib/daily-missions';

import type { PublishAdapter } from '../adapters/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseAwardDailyXpOptions {
  /** Owner hex pubkey. When absent (logged out), awarding throws. */
  pubkey: string | undefined;
  /** Publishes the updated kind 11125 profile event (host `useNostrPublish`). */
  publish: PublishAdapter['publish'];
  /** Optional callback to update the profile event in the host's query cache. */
  updateProfileEvent?: (event: NostrEvent) => void;
  /**
   * Optional success callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onSuccess?: (result: AwardDailyXpResult, variables: AwardDailyXpRequest) => void;
  /**
   * Optional error callback, forwarded to the underlying mutation. Hosts use
   * this to surface user feedback (toasts, etc.) — the hook itself stays UI-free.
   */
  onError?: (error: Error, variables: AwardDailyXpRequest) => void;
}

export interface AwardDailyXpRequest {
  /** Current missions state to calculate XP from */
  missions: MissionsContent;
}

export interface AwardDailyXpResult {
  xpAwarded: number;
  newTotalXp: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAwardDailyXp(
  options: UseAwardDailyXpOptions,
): UseMutationResult<AwardDailyXpResult, Error, AwardDailyXpRequest> {
  const { pubkey, publish, updateProfileEvent, onSuccess, onError } = options;
  const { nostr } = useNostr();

  return useMutation<AwardDailyXpResult, Error, AwardDailyXpRequest>({
    mutationFn: async ({ missions }): Promise<AwardDailyXpResult> => {
      if (!pubkey) throw new Error('Must be logged in');

      const xpToAward = totalDailyXp(missions);
      if (xpToAward <= 0) return { xpAwarded: 0, newTotalXp: 0 };

      // Fetch fresh profile from relays to avoid stale-read overwrites
      const prev = await fetchFreshEvent(nostr, {
        kinds: [KIND_BLOBBONAUT_PROFILE],
        authors: [pubkey],
      });

      const freshProfile = prev ? parseBlobbonautEvent(prev) : undefined;
      const currentXp = freshProfile?.xp ?? 0;
      const newTotalXp = currentXp + xpToAward;

      // Update XP and level tags on the fresh event's tags
      const updatedTags = updateBlobbonautTags(
        prev?.tags ?? [],
        buildXpTagUpdates(newTotalXp),
      );

      // Persist missions state to content field
      const content = serializeProfileContent(
        prev?.content ?? '',
        { missions },
      );

      const event = await publish({
        kind: KIND_BLOBBONAUT_PROFILE,
        content,
        tags: updatedTags,
        prev: prev ?? undefined,
      });

      updateProfileEvent?.(event);

      return { xpAwarded: xpToAward, newTotalXp };
    },
    onSuccess,
    onError,
  });
}
