// src/blobbi/actions/hooks/useHatchTasks.ts

/**
 * Hook to compute hatch task progress.
 *
 * Progress is stored in the kind 31124 Blobbi event content JSON (per-Blobbi).
 * - Interactions: TallyMission tracked via `trackEvolutionMissionTally`
 * - Event-based tasks: EventMission, backfilled from retroactive Nostr queries
 *
 * The Nostr queries discover event IDs that satisfy event-based tasks and
 * feed them into the evolution tracker. The evolution array (from companion
 * or session store) is the source of truth for completion state.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { Mission } from '@/blobbi/core/lib/missions';
import { missionProgress, isEventMission } from '@/blobbi/core/lib/missions';
import {
  trackEvolutionMissionEvent,
  readEvolutionFromStorage,
  writeEvolutionToStorage,
  hydrateEvolutionFromPersisted,
} from '../lib/daily-mission-tracker';
import {
  HATCH_MISSIONS,
  HATCH_REQUIRED_INTERACTIONS,
  findEvolutionMission,
  createHatchMissions,
  evolutionMatchesDefinitions,
  migrateEvolutionMissions,
} from '../lib/evolution-missions';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for theme definition events */
export const KIND_THEME_DEFINITION = 36767;
/** Kind for color moment events (espy.you) */
export const KIND_COLOR_MOMENT = 3367;
/** Kind for profile metadata */
export const KIND_PROFILE_METADATA = 0;

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

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute hatch task progress from evolution missions + Nostr event backfill.
 *
 * @param companion - The Blobbi companion (must be incubating)
 */
export function useHatchTasks(
  companion: BlobbiCompanion | null,
): HatchTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const pubkey = user?.pubkey;
  const companionD = companion?.d;
  const isIncubating = companion?.progressionState === 'incubating';

  // Read evolution from companion (31124 content) or session store
  const evolution = useMemo((): Mission[] => {
    if (!pubkey || !companionD) return [];
    // Session store takes priority (has latest in-session progress)
    const fromStore = readEvolutionFromStorage(pubkey, companionD);
    if (fromStore && fromStore.length > 0) return fromStore;
    // Fall back to companion's persisted evolution from 31124 content
    return companion?.evolution ?? [];
  }, [pubkey, companionD, companion?.evolution]);

  // ─── Hydrate evolution store from companion on mount ───
  // If the companion has persisted evolution data but the session store is empty,
  // seed the session store so tally tracking works immediately.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isIncubating || !pubkey || !companionD) return;
    const hydrateKey = `${pubkey}:${companionD}`;
    if (hydratedRef.current === hydrateKey) return;
    hydratedRef.current = hydrateKey;

    const companionEvolution = companion?.evolution ?? [];
    if (companionEvolution.length > 0) {
      hydrateEvolutionFromPersisted(companionEvolution, pubkey, companionD);
    }
  }, [isIncubating, pubkey, companionD, companion?.evolution]);

  // ─── Ensure evolution missions exist and match current definitions ───
  // Safety net: if the companion is incubating but evolution[] is empty
  // (e.g. persist didn't fire, old content format), re-populate from
  // the static definitions so tally tracking works immediately.
  // Scoped by pubkey:d so switching Blobbis re-runs the check.
  const ensuredRef = useRef<string | null>(null);
  useEffect(() => {
    const ensureKey = `${pubkey}:${companionD}`;
    if (!isIncubating || !pubkey || !companionD || ensuredRef.current === ensureKey) return;

    const fromStore = readEvolutionFromStorage(pubkey, companionD);
    const current = fromStore && fromStore.length > 0 ? fromStore : (companion?.evolution ?? []);

    if (current.length === 0) {
      const fresh = createHatchMissions();
      writeEvolutionToStorage(fresh, pubkey, companionD);
      window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { evolution: true, d: companionD } }));
    } else if (!evolutionMatchesDefinitions(current, HATCH_MISSIONS)) {
      const migrated = migrateEvolutionMissions(current, HATCH_MISSIONS);
      writeEvolutionToStorage(migrated, pubkey, companionD);
      window.dispatchEvent(new CustomEvent('daily-missions-updated', { detail: { evolution: true, d: companionD } }));
    }
    ensuredRef.current = ensureKey;
  }, [isIncubating, pubkey, companionD, companion?.evolution]);

  // ─── Retroactive Nostr Queries (discover event IDs to backfill) ───
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hatch-tasks', pubkey, companionD],
    queryFn: async () => {
      if (!pubkey) return null;

      const filters: NostrFilter[] = [
        { kinds: [KIND_THEME_DEFINITION], authors: [pubkey], limit: 1 },
        { kinds: [KIND_COLOR_MOMENT], authors: [pubkey], limit: 1 },
      ];

      const events = await nostr.query(filters);

      return {
        themeEvents: events.filter(e => e.kind === KIND_THEME_DEFINITION),
        colorMomentEvents: events.filter(e => e.kind === KIND_COLOR_MOMENT),
      };
    },
    enabled: !!pubkey && isIncubating,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ─── Compute event counts directly from Nostr query results ───
  const queryCounts: Record<string, number> = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    return {
      create_theme: data.themeEvents.length,
      color_moment: data.colorMomentEvents.length,
    };
  }, [data]);

  // ─── Backfill event IDs into evolution missions (for persistence only) ───
  const lastBackfilledDataRef = useRef<typeof data>(null);

  useEffect(() => {
    if (!data || !pubkey || !companionD || evolution.length === 0) return;
    if (data === lastBackfilledDataRef.current) return;
    lastBackfilledDataRef.current = data;

    const current = readEvolutionFromStorage(pubkey, companionD);
    if (!current || current.length === 0) return;

    for (const event of data.themeEvents) {
      const m = findEvolutionMission(current, 'create_theme');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('create_theme', event.id, pubkey, companionD);
      }
    }
    for (const event of data.colorMomentEvents) {
      const m = findEvolutionMission(current, 'color_moment');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('color_moment', event.id, pubkey, companionD);
      }
    }
  }, [data, pubkey, companionD, evolution]);

  // ─── Build task view models ───
  const tasks: HatchTask[] = HATCH_MISSIONS.map((def) => {
    const mission = findEvolutionMission(evolution, def.id);
    const missionCount = mission ? missionProgress(mission) : 0;
    const queryCount = queryCounts[def.id] ?? 0;
    const current = Math.max(missionCount, queryCount);
    const completed = current >= def.target;

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
 * Filter tasks to only persistent tasks (for tag sync).
 * CRITICAL: Dynamic tasks must NEVER be synced to tags.
 */
export function filterPersistentTasks(tasks: HatchTask[]): HatchTask[] {
  return tasks.filter(t => t.type === 'persistent');
}
