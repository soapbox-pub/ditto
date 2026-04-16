// src/blobbi/actions/hooks/useHatchTasks.ts

/**
 * Hook to compute hatch task progress.
 *
 * Progress is stored in `MissionsContent.evolution[]` on kind 11125.
 * - Interactions: TallyMission tracked via `trackEvolutionMissionTally`
 * - Event-based tasks: EventMission, backfilled from retroactive Nostr queries
 *
 * The Nostr queries discover event IDs that satisfy event-based tasks and
 * feed them into the evolution tracker. The evolution array is the source of
 * truth for completion state.
 */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { MissionsContent, Mission } from '@/blobbi/core/lib/missions';
import { isMissionComplete, missionProgress, isEventMission } from '@/blobbi/core/lib/missions';
import { trackEvolutionMissionEvent } from '../lib/daily-mission-tracker';
import {
  HATCH_MISSIONS,
  HATCH_REQUIRED_INTERACTIONS,
} from '../lib/evolution-missions';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for theme definition events */
export const KIND_THEME_DEFINITION = 36767;
/** Kind for color moment events (espy.you) */
export const KIND_COLOR_MOMENT = 3367;
/** Kind for profile metadata */
export const KIND_PROFILE_METADATA = 0;
/** Kind for short text notes */
export const KIND_SHORT_TEXT_NOTE = 1;

/** Required hashtags for the Blobbi post (excludes Blobbi name, which is dynamic) */
export const BLOBBI_POST_REQUIRED_HASHTAGS = ['blobbi'];

/** Prefix text for Blobbi hatch post (the Blobbi name is appended after this) */
export const BLOBBI_POST_PREFIX = 'Posting to hatch';

// Legacy export for backwards compatibility
export { HATCH_REQUIRED_INTERACTIONS };
export const REQUIRED_INTERACTIONS = HATCH_REQUIRED_INTERACTIONS;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Task type classification.
 * - persistent: Based on Nostr events or tallies, stored in evolution[]
 * - dynamic: Based on current stats, NEVER stored
 */
export type TaskType = 'persistent' | 'dynamic';

/**
 * Individual task view model for the UI.
 */
export interface HatchTask {
  id: string;
  name: string;
  description: string;
  /** Current progress value */
  current: number;
  /** Required value for completion */
  required: number;
  /** Whether the task is complete */
  completed: boolean;
  /** Task type - persistent or dynamic */
  type: TaskType;
  /** Action to perform (if applicable) */
  action?: 'navigate' | 'open_modal' | 'external_link';
  /** Target for the action */
  actionTarget?: string;
  /** Button label */
  actionLabel?: string;
}

/**
 * Result of computing hatch tasks.
 */
export interface HatchTasksResult {
  tasks: HatchTask[];
  /** All persistent tasks are complete */
  persistentTasksComplete: boolean;
  /** Dynamic stat task is complete */
  dynamicTaskComplete: boolean;
  /** All tasks (persistent + dynamic) are complete - required to hatch */
  allCompleted: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Refetch task progress */
  refetch: () => void;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Build the required phrase for a hatch post.
 * Format: "Posting to hatch {CapitalizedName} #blobbi"
 */
export function buildHatchPhrase(blobbiName: string): string {
  const capitalized = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);
  return `${BLOBBI_POST_PREFIX} ${capitalized} #blobbi`;
}

/**
 * Check if a post is a valid Blobbi-related post.
 */
export function isValidHatchPost(event: NostrEvent): boolean {
  const hasBlobbiTag = event.tags.some(
    tag => tag[0] === 't' && tag[1]?.toLowerCase() === 'blobbi',
  );
  if (hasBlobbiTag) return true;
  return /#blobbi\b/i.test(event.content);
}

/** Find an evolution mission by ID */
function findMission(evolution: Mission[], id: string): Mission | undefined {
  return evolution.find((m) => m.id === id);
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute hatch task progress from evolution missions + Nostr event backfill.
 *
 * @param companion - The Blobbi companion (must be incubating)
 * @param missions - Current MissionsContent from the session store
 */
export function useHatchTasks(
  companion: BlobbiCompanion | null,
  missions: MissionsContent | undefined,
): HatchTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const pubkey = user?.pubkey;
  const isIncubating = companion?.state === 'incubating';
  const evolution = useMemo(() => missions?.evolution ?? [], [missions?.evolution]);

  // ─── Retroactive Nostr Queries (discover event IDs to backfill) ───
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hatch-tasks', pubkey],
    queryFn: async () => {
      if (!pubkey) return null;

      const filters: NostrFilter[] = [
        { kinds: [KIND_THEME_DEFINITION], authors: [pubkey], limit: 1 },
        { kinds: [KIND_COLOR_MOMENT], authors: [pubkey], limit: 1 },
        { kinds: [KIND_SHORT_TEXT_NOTE], authors: [pubkey], '#t': ['blobbi'], limit: 1 },
      ];

      const events = await nostr.query(filters);

      return {
        themeEvents: events.filter(e => e.kind === KIND_THEME_DEFINITION),
        colorMomentEvents: events.filter(e => e.kind === KIND_COLOR_MOMENT),
        postEvents: events.filter(e => e.kind === KIND_SHORT_TEXT_NOTE),
      };
    },
    enabled: !!pubkey && isIncubating,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ─── Backfill event IDs into evolution missions ───
  useEffect(() => {
    if (!data || !pubkey || evolution.length === 0) return;

    // Backfill theme events
    for (const event of data.themeEvents) {
      const m = findMission(evolution, 'create_theme');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('create_theme', event.id, pubkey);
      }
    }

    // Backfill color moment events
    for (const event of data.colorMomentEvents) {
      const m = findMission(evolution, 'color_moment');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('color_moment', event.id, pubkey);
      }
    }

    // Backfill valid post events
    for (const event of data.postEvents) {
      if (!isValidHatchPost(event)) continue;
      const m = findMission(evolution, 'create_post');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('create_post', event.id, pubkey);
      }
    }
  }, [data, pubkey, evolution]);

  // ─── Build task view models from evolution missions ───
  const tasks: HatchTask[] = HATCH_MISSIONS.map((def) => {
    const mission = findMission(evolution, def.id);
    const current = mission ? missionProgress(mission) : 0;
    const completed = mission ? isMissionComplete(mission) : false;

    return {
      id: def.id,
      name: def.title,
      description: def.description,
      current: Math.min(current, def.target),
      required: def.target,
      completed,
      type: 'persistent' as TaskType,
      action: def.action,
      actionTarget: def.actionTarget,
      actionLabel: def.actionLabel,
    };
  });

  const persistentTasksComplete = tasks.every(t => t.completed);
  const dynamicTaskComplete = true; // No dynamic tasks for hatching
  const allCompleted = persistentTasksComplete && dynamicTaskComplete;

  return {
    tasks,
    persistentTasksComplete,
    dynamicTaskComplete,
    allCompleted,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Get the current interaction count from evolution missions.
 * @deprecated Use missionProgress on the evolution mission directly.
 */
export function getInteractionCount(missions: MissionsContent | undefined): number {
  if (!missions) return 0;
  const m = missions.evolution.find(m => m.id === 'interactions');
  return m ? missionProgress(m) : 0;
}

/**
 * Filter tasks to only persistent tasks (for tag sync).
 * CRITICAL: Dynamic tasks must NEVER be synced to tags.
 */
export function filterPersistentTasks(tasks: HatchTask[]): HatchTask[] {
  return tasks.filter(t => t.type === 'persistent');
}
