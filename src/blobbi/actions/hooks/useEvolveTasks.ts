// src/blobbi/actions/hooks/useEvolveTasks.ts

/**
 * Hook to compute evolve task progress.
 *
 * Progress is stored in `MissionsContent.evolution[]` on kind 11125.
 * - Interactions: TallyMission tracked via `trackEvolutionMissionTally`
 * - Event-based tasks: EventMission, backfilled from retroactive Nostr queries
 * - Dynamic task (maintain_stats): computed from current companion stats, NEVER stored
 */

import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';
import type { MissionsContent } from '@/blobbi/core/lib/missions';
import { missionProgress, isEventMission } from '@/blobbi/core/lib/missions';
import { trackEvolutionMissionEvent, readMissionsFromStorage } from '../lib/daily-mission-tracker';
import {
  EVOLVE_MISSIONS,
  EVOLVE_REQUIRED_INTERACTIONS,
  EVOLVE_REQUIRED_THEMES,
  EVOLVE_REQUIRED_COLOR_MOMENTS,
  EVOLVE_STAT_THRESHOLD,
  findEvolutionMission,
} from '../lib/evolution-missions';

import {
  KIND_THEME_DEFINITION,
  KIND_COLOR_MOMENT,
  KIND_PROFILE_METADATA,
  type HatchTask,
  type TaskType,
} from './useHatchTasks';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Kind for custom profile tabs event */
export const KIND_PROFILE_TABS = 16769;

// Re-export for backward compat
export {
  EVOLVE_REQUIRED_INTERACTIONS,
  EVOLVE_REQUIRED_THEMES,
  EVOLVE_REQUIRED_COLOR_MOMENTS,
  EVOLVE_STAT_THRESHOLD,
};

// Re-export task types for convenience
export type { HatchTask as EvolveTask, TaskType };

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of computing evolve tasks.
 */
export interface EvolveTasksResult {
  tasks: HatchTask[];
  /** All persistent tasks are complete */
  persistentTasksComplete: boolean;
  /** Dynamic stat task is complete */
  dynamicTaskComplete: boolean;
  /** All tasks (persistent + dynamic) are complete - required to evolve */
  allCompleted: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Refetch task progress */
  refetch: () => void;
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute evolve task progress from evolution missions + Nostr event backfill.
 *
 * @param companion - The Blobbi companion (must be in evolving state)
 * @param missions - Current MissionsContent from the session store
 */
export function useEvolveTasks(
  companion: BlobbiCompanion | null,
  missions: MissionsContent | undefined,
): EvolveTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const pubkey = user?.pubkey;
  const isEvolving = companion?.state === 'evolving';
  const evolution = useMemo(() => missions?.evolution ?? [], [missions?.evolution]);

  // ─── Retroactive Nostr Queries (discover event IDs to backfill) ───
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['evolve-tasks', pubkey],
    queryFn: async () => {
      if (!pubkey) return null;

      const filters: NostrFilter[] = [
        { kinds: [KIND_THEME_DEFINITION], authors: [pubkey], limit: EVOLVE_REQUIRED_THEMES },
        { kinds: [KIND_COLOR_MOMENT], authors: [pubkey], limit: EVOLVE_REQUIRED_COLOR_MOMENTS },
        { kinds: [KIND_PROFILE_TABS], authors: [pubkey], limit: 1 },
        { kinds: [KIND_PROFILE_METADATA], authors: [pubkey], limit: 1 },
      ];

      const events = await nostr.query(filters);

      return {
        themeEvents: events.filter(e => e.kind === KIND_THEME_DEFINITION),
        colorMomentEvents: events.filter(e => e.kind === KIND_COLOR_MOMENT),
        profileTabsEvents: events.filter(e => e.kind === KIND_PROFILE_TABS),
        hasProfileMetadata: events.some(e => e.kind === KIND_PROFILE_METADATA),
      };
    },
    enabled: !!pubkey && isEvolving,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // ─── Compute event counts directly from Nostr query results ───
  // These are the authoritative counts for event-based tasks.
  const queryCounts: Record<string, number> = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    return {
      create_themes: data.themeEvents.length,
      color_moments: data.colorMomentEvents.length,
      edit_profile: (data.profileTabsEvents.length >= 1 || data.hasProfileMetadata) ? 1 : 0,
    };
  }, [data]);

  // ─── Backfill event IDs into evolution missions (for persistence only) ───
  const lastBackfilledDataRef = useRef<typeof data>(null);

  useEffect(() => {
    if (!data || !pubkey || evolution.length === 0) return;
    if (data === lastBackfilledDataRef.current) return;
    lastBackfilledDataRef.current = data;

    const current = readMissionsFromStorage(pubkey);
    if (!current || current.evolution.length === 0) return;
    const evo = current.evolution;

    for (const event of data.themeEvents) {
      const m = findEvolutionMission(evo, 'create_themes');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('create_themes', event.id, pubkey);
      }
    }
    for (const event of data.colorMomentEvents) {
      const m = findEvolutionMission(evo, 'color_moments');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('color_moments', event.id, pubkey);
      }
    }
    const profileEditEvents = [
      ...data.profileTabsEvents,
      ...(data.hasProfileMetadata ? [{ id: 'profile-metadata' }] : []),
    ];
    for (const event of profileEditEvents) {
      const m = findEvolutionMission(evo, 'edit_profile');
      if (m && isEventMission(m) && !m.events.includes(event.id)) {
        trackEvolutionMissionEvent('edit_profile', event.id, pubkey);
      }
    }
  }, [data, pubkey, evolution]);

  // ─── Build task view models ───
  // For event-based tasks, use the MAX of the Nostr query count and the
  // evolution mission progress. The query is authoritative but the mission
  // store may have progress from a previous session that hasn't been
  // re-queried yet.
  const tasks: HatchTask[] = EVOLVE_MISSIONS.map((def) => {
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

  // ─── Dynamic Task: Maintain All Stats >= 80 ───
  const stats = companion?.stats ?? {};
  const hunger = stats.hunger ?? 0;
  const happiness = stats.happiness ?? 0;
  const health = stats.health ?? 0;
  const hygiene = stats.hygiene ?? 0;
  const energy = stats.energy ?? 0;

  const statsOk =
    hunger >= EVOLVE_STAT_THRESHOLD &&
    happiness >= EVOLVE_STAT_THRESHOLD &&
    health >= EVOLVE_STAT_THRESHOLD &&
    hygiene >= EVOLVE_STAT_THRESHOLD &&
    energy >= EVOLVE_STAT_THRESHOLD;

  const minStat = Math.min(hunger, happiness, health, hygiene, energy);

  tasks.push({
    id: 'maintain_stats',
    name: 'Peak Condition',
    description: `Keep all stats above ${EVOLVE_STAT_THRESHOLD}`,
    current: statsOk ? EVOLVE_STAT_THRESHOLD : minStat,
    required: EVOLVE_STAT_THRESHOLD,
    completed: statsOk,
    type: 'dynamic',
  });

  // ─── Completion ───
  const persistentTasks = tasks.filter(t => t.type === 'persistent');
  const dynamicTasks = tasks.filter(t => t.type === 'dynamic');

  const persistentTasksComplete = persistentTasks.every(t => t.completed);
  const dynamicTaskComplete = dynamicTasks.every(t => t.completed);
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


