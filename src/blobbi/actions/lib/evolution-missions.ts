/**
 * Evolution Missions - Static definitions for hatch and evolve tasks.
 *
 * These are the lifecycle tasks that gate stage transitions (egg→baby, baby→adult).
 * Progress is tracked in `MissionsContent.evolution[]` on kind 11125, using the
 * same TallyMission / EventMission model as daily missions.
 *
 * Unlike daily missions, evolution missions:
 *   - Are populated when incubation/evolution starts
 *   - Are cleared when the stage transition completes (or is cancelled)
 *   - Are NOT deterministically seeded — the full set is always used
 */

import type { Mission, TallyMission, EventMission } from '@/blobbi/core/lib/missions';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/** Find an evolution mission by ID in the given array. */
export function findEvolutionMission(evolution: Mission[], id: string): Mission | undefined {
  return evolution.find((m) => m.id === id);
}

// ─── Tracking Type ───────────────────────────────────────────────────────────

export type EvolutionTrackingType = 'tally' | 'event';

// ─── Definition ──────────────────────────────────────────────────────────────

export interface EvolutionMissionDefinition {
  /** Unique identifier (matches Mission.id) */
  id: string;
  /** Display title */
  title: string;
  /** Description shown in the UI */
  description: string;
  /** Number of times the action must be performed / events collected */
  target: number;
  /** Whether this mission tracks a counter or event IDs */
  tracking: EvolutionTrackingType;
  /** UI action hint */
  action?: 'navigate' | 'open_modal' | 'external_link';
  /** Target for the action */
  actionTarget?: string;
  /** Button label */
  actionLabel?: string;
}

// ─── Hatch Mission Pool ──────────────────────────────────────────────────────

export const HATCH_MISSIONS: readonly EvolutionMissionDefinition[] = [
  {
    id: 'create_theme',
    title: 'Create Theme',
    description: 'Create a custom theme for your profile',
    target: 1,
    tracking: 'event',
    action: 'navigate',
    actionTarget: '/themes',
    actionLabel: 'Create Theme',
  },
  {
    id: 'color_moment',
    title: 'Color Moment',
    description: 'Share a color moment on espy',
    target: 1,
    tracking: 'event',
    action: 'external_link',
    actionTarget: 'https://espy.you/',
    actionLabel: 'Open espy',
  },
  {
    id: 'create_post',
    title: 'Create Post',
    description: 'Share a post with the #blobbi hashtag',
    target: 1,
    tracking: 'event',
    action: 'open_modal',
    actionTarget: 'blobbi_post',
    actionLabel: 'Create Post',
  },
  {
    id: 'interactions',
    title: 'Interact with Blobbi',
    description: 'Care for your Blobbi 7 times',
    target: 7,
    tracking: 'tally',
  },
] as const;

// ─── Evolve Mission Pool ─────────────────────────────────────────────────────

export const EVOLVE_MISSIONS: readonly EvolutionMissionDefinition[] = [
  {
    id: 'create_themes',
    title: 'Create Themes',
    description: 'Create 3 custom themes',
    target: 3,
    tracking: 'event',
    action: 'navigate',
    actionTarget: '/themes',
    actionLabel: 'Create Theme',
  },
  {
    id: 'color_moments',
    title: 'Color Moments',
    description: 'Share 3 color moments on espy',
    target: 3,
    tracking: 'event',
    action: 'external_link',
    actionTarget: 'https://espy.you/',
    actionLabel: 'Open espy',
  },
  {
    id: 'interactions',
    title: 'Interact with Blobbi',
    description: 'Care for your Blobbi 21 times',
    target: 21,
    tracking: 'tally',
  },
  {
    id: 'edit_profile',
    title: 'Edit Your Profile',
    description: 'Update your profile info or customize your profile tabs',
    target: 1,
    tracking: 'event',
    action: 'navigate',
    actionTarget: '/settings/profile',
    actionLabel: 'Edit Profile',
  },
] as const;

// ─── Instantiation ───────────────────────────────────────────────────────────

/** Create a fresh Mission from an evolution definition */
export function createEvolutionMission(def: EvolutionMissionDefinition): Mission {
  if (def.tracking === 'event') {
    return { id: def.id, target: def.target, events: [] } satisfies EventMission;
  }
  return { id: def.id, target: def.target, count: 0 } satisfies TallyMission;
}

/** Create the full set of hatch missions (for starting incubation) */
export function createHatchMissions(): Mission[] {
  return HATCH_MISSIONS.map(createEvolutionMission);
}

/** Create the full set of evolve missions (for starting evolution) */
export function createEvolveMissions(): Mission[] {
  return EVOLVE_MISSIONS.map(createEvolutionMission);
}

// ─── Constants (re-exported for backward compat) ─────────────────────────────

/** Required interactions to complete the hatch interactions task */
export const HATCH_REQUIRED_INTERACTIONS = 7;

/** Required interactions to complete the evolve interactions task */
export const EVOLVE_REQUIRED_INTERACTIONS = 21;

/** Required themes for evolve task */
export const EVOLVE_REQUIRED_THEMES = 3;

/** Required color moments for evolve task */
export const EVOLVE_REQUIRED_COLOR_MOMENTS = 3;

/** Stat threshold for evolve dynamic task (all stats >= 80) */
export const EVOLVE_STAT_THRESHOLD = 80;
