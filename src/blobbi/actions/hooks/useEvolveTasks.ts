// src/blobbi/actions/hooks/useEvolveTasks.ts

/**
 * Hook to compute evolve task progress from Nostr events and current stats.
 * 
 * CRITICAL ARCHITECTURE:
 * - PERSISTENT TASKS: Based on Nostr events, can be cached in tags
 * - DYNAMIC TASKS: Based on current stats, NEVER stored in tags
 * 
 * Tags are only cache for persistent tasks. Source of truth = Nostr events.
 *
 * Most persistent tasks are RETROACTIVE — they query the user's full history
 * without a `since:` filter. Only Blobbi-specific tasks (interactions,
 * maintain_stats) require actions on the current Blobbi instance.
 */

import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

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

/** Required themes for evolve task */
export const EVOLVE_REQUIRED_THEMES = 3;

/** Required color moments for evolve task */
export const EVOLVE_REQUIRED_COLOR_MOMENTS = 3;

/** Required interactions for evolve task */
export const EVOLVE_REQUIRED_INTERACTIONS = 21;

/** Stat threshold for evolve dynamic task (all stats >= 80) */
export const EVOLVE_STAT_THRESHOLD = 80;

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-export task types for convenience
export type { HatchTask as EvolveTask, TaskType };

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

// ─── Helper Functions ─────────────────────────────────────────────────────────

// ─── Main Hook ────────────────────────────────────────────────────────────────

/**
 * Hook to compute evolve task progress from Nostr events and current stats.
 * 
 * RETROACTIVE TASKS (count from full user history):
 * 1. Create 3 Themes (kind 36767) - ≥3 events ever
 * 2. Create 3 Color Moments (kind 3367) - ≥3 events ever
 * 3. Edit Profile once (kind 0 or kind 16769) - ≥1 event ever
 * 
 * BLOBBI-SPECIFIC TASKS (must be done for this Blobbi):
 * 4. Interact 21 times (tracked via companion.tasks cache)
 * 
 * DYNAMIC TASK (stat-based, NEVER cached):
 * 5. Maintain All Stats >= 80
 * 
 * @param companion - The Blobbi companion (must be in evolving state)
 * @param interactionCount - Current interaction count from companion tasks cache
 */
export function useEvolveTasks(
  companion: BlobbiCompanion | null,
  interactionCount?: number
): EvolveTasksResult {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  
  const pubkey = user?.pubkey;
  const isEvolving = companion?.state === 'evolving';
  
  // Query for all relevant events.
  //
  // RETROACTIVE tasks (theme, color moment, profile) query the user's full
  // history — no `since:` filter. Completing the activity once satisfies
  // the requirement for every future baby's evolution.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['evolve-tasks', pubkey],
    queryFn: async () => {
      if (!pubkey) {
        return null;
      }
      
      // Build filters for events we need
      const filters: NostrFilter[] = [
        // Theme definitions — retroactive (no since:)
        {
          kinds: [KIND_THEME_DEFINITION],
          authors: [pubkey],
          limit: EVOLVE_REQUIRED_THEMES,
        },
        // Color moments — retroactive (no since:)
        {
          kinds: [KIND_COLOR_MOMENT],
          authors: [pubkey],
          limit: EVOLVE_REQUIRED_COLOR_MOMENTS,
        },
        // Custom profile tabs — retroactive (no since:)
        {
          kinds: [KIND_PROFILE_TABS],
          authors: [pubkey],
          limit: 1,
        },
        // Profile metadata — retroactive (no since:)
        {
          kinds: [KIND_PROFILE_METADATA],
          authors: [pubkey],
          limit: 1,
        },
      ];
      
      // Execute all queries
      const events = await nostr.query(filters);
      
      // Categorize events
      const themeEvents = events.filter(e => e.kind === KIND_THEME_DEFINITION);
      const colorMomentEvents = events.filter(e => e.kind === KIND_COLOR_MOMENT);
      const profileTabsEvents = events.filter(e => e.kind === KIND_PROFILE_TABS);
      const profileEvents = events.filter(e => e.kind === KIND_PROFILE_METADATA);
      
      return {
        themeEvents,
        colorMomentEvents,
        profileTabsEvents,
        hasProfileMetadata: profileEvents.length > 0,
      };
    },
    enabled: !!pubkey && isEvolving,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });
  
  // ─── Compute PERSISTENT Tasks ───
  const tasks: HatchTask[] = [];
  
  // 1. Create 3 Themes (PERSISTENT) — retroactive
  const themeCount = data?.themeEvents?.length ?? 0;
  const themesCompleted = themeCount >= EVOLVE_REQUIRED_THEMES;
  tasks.push({
    id: 'create_themes',
    name: 'Create Themes',
    description: `Create ${EVOLVE_REQUIRED_THEMES} custom themes`,
    current: Math.min(themeCount, EVOLVE_REQUIRED_THEMES),
    required: EVOLVE_REQUIRED_THEMES,
    completed: themesCompleted,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/themes',
    actionLabel: 'Create Theme',
  });
  
  // 2. Create 3 Color Moments (PERSISTENT) — retroactive
  const colorMomentCount = data?.colorMomentEvents?.length ?? 0;
  const colorMomentsCompleted = colorMomentCount >= EVOLVE_REQUIRED_COLOR_MOMENTS;
  tasks.push({
    id: 'color_moments',
    name: 'Color Moments',
    description: `Share ${EVOLVE_REQUIRED_COLOR_MOMENTS} color moments on espy`,
    current: Math.min(colorMomentCount, EVOLVE_REQUIRED_COLOR_MOMENTS),
    required: EVOLVE_REQUIRED_COLOR_MOMENTS,
    completed: colorMomentsCompleted,
    type: 'persistent',
    action: 'external_link',
    actionTarget: 'https://espy.you/',
    actionLabel: 'Open espy',
  });
  
  // 3. Interact 21 times (PERSISTENT) — Blobbi-specific
  const interactions = interactionCount ?? 0;
  const interactionsCompleted = interactions >= EVOLVE_REQUIRED_INTERACTIONS;
  tasks.push({
    id: 'interactions',
    name: 'Interact with Blobbi',
    description: `Care for your Blobbi ${EVOLVE_REQUIRED_INTERACTIONS} times`,
    current: Math.min(interactions, EVOLVE_REQUIRED_INTERACTIONS),
    required: EVOLVE_REQUIRED_INTERACTIONS,
    completed: interactionsCompleted,
    type: 'persistent',
    // No action - just interact with Blobbi
  });
  
  // 4. Edit Profile once (PERSISTENT) — retroactive
  const hasTabsEdit = (data?.profileTabsEvents?.length ?? 0) >= 1;
  const hasMetadataEdit = data?.hasProfileMetadata ?? false;
  const hasProfileEdit = hasTabsEdit || hasMetadataEdit;
  tasks.push({
    id: 'edit_profile',
    name: 'Edit Your Profile',
    description: 'Update your profile info or customize your profile tabs',
    current: hasProfileEdit ? 1 : 0,
    required: 1,
    completed: hasProfileEdit,
    type: 'persistent',
    action: 'navigate',
    actionTarget: '/settings/profile',
    actionLabel: 'Edit Profile',
  });
  
  // ─── Compute DYNAMIC Task (stat-based, NEVER cached) ───
  // 5. Maintain All Stats >= 80 — Blobbi-specific
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
  
  // Calculate minimum stat for progress display
  const minStat = Math.min(hunger, happiness, health, hygiene, energy);
  
  tasks.push({
    id: 'maintain_stats',
    name: 'Peak Condition',
    description: `Keep all stats above ${EVOLVE_STAT_THRESHOLD}`,
    current: statsOk ? EVOLVE_STAT_THRESHOLD : minStat,
    required: EVOLVE_STAT_THRESHOLD,
    completed: statsOk,
    type: 'dynamic', // CRITICAL: Never persist this task
    // No action - just care for your Blobbi
  });
  
  // ─── Compute Completion States ───
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

/**
 * Get the current interaction count for evolve from companion task cache.
 */
export function getEvolveInteractionCount(companion: BlobbiCompanion | null): number {
  if (!companion) return 0;
  const interactionTask = companion.tasks.find(t => t.name === 'interactions');
  return interactionTask?.value ?? 0;
}
