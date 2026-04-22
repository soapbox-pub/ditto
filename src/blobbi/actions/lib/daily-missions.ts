/**
 * Daily Missions System for Blobbi
 *
 * Defines the daily mission pool, selection logic, and state management.
 * Missions use the tally/event model from missions.ts:
 *   - Tally missions: { id, target, count }
 *   - Event missions: { id, target, events }
 * Completion is derived: count >= target or events.length >= target.
 * No explicit completed/claimed flags.
 */

import type { Mission, TallyMission, EventMission, MissionsContent } from '@/blobbi/core/lib/missions';
import { isTallyMission, isEventMission, isMissionComplete } from '@/blobbi/core/lib/missions';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Actions that can trigger daily mission progress.
 * Tally actions increment a counter. Event actions append an event ID.
 */
export type DailyMissionAction =
  | 'interact'      // Any care interaction (tally)
  | 'feed'          // Feeding action (tally)
  | 'clean'         // Cleaning action (tally)
  | 'sing'          // Sing direct action (tally)
  | 'play_music'    // Play music direct action (tally)
  | 'sleep'         // Put Blobbi to sleep (tally)
  | 'take_photo'    // Take a photo (event)
  | 'medicine';     // Give medicine (tally)

/** Whether a mission action tracks events or tallies */
export type MissionTrackingType = 'tally' | 'event';

/** Blobbi stage type for filtering missions */
export type BlobbiStage = 'egg' | 'baby' | 'adult';

/**
 * Definition of a daily mission in the pool.
 * This is the static template -- not the runtime state.
 */
export interface DailyMissionDefinition {
  /** Unique identifier */
  id: string;
  /** Display title */
  title: string;
  /** Description of what to do */
  description: string;
  /** Action that triggers progress */
  action: DailyMissionAction;
  /** Number of times the action must be performed */
  target: number;
  /** Whether this mission tracks events or tallies */
  tracking: MissionTrackingType;
  /** XP reward for completing this mission */
  xp: number;
  /** Selection weight (higher = more likely) */
  weight: number;
  /** Required stages to show this mission */
  requiredStages?: BlobbiStage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of mission rerolls allowed per day */
export const MAX_DAILY_REROLLS = 3;

/** Number of daily missions selected each day */
export const DAILY_MISSION_COUNT = 3;

/** XP bonus for completing all daily missions */
export const DAILY_BONUS_XP = 50;

// ─── Mission Pool ─────────────────────────────────────────────────────────────

export const DAILY_MISSION_POOL: DailyMissionDefinition[] = [
  // ── Baby/Adult only ──────────────────────────────────────────────────────
  {
    id: 'interact_3', title: 'Quick Care',
    description: 'Interact with your Blobbi 3 times',
    action: 'interact', target: 3, tracking: 'tally', xp: 15, weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'interact_6', title: 'Attentive Caretaker',
    description: 'Interact with your Blobbi 6 times',
    action: 'interact', target: 6, tracking: 'tally', xp: 30, weight: 8,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_1', title: 'Snack Time',
    description: 'Feed your Blobbi once',
    action: 'feed', target: 1, tracking: 'tally', xp: 10, weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_2', title: 'Hungry Blobbi',
    description: 'Feed your Blobbi 2 times',
    action: 'feed', target: 2, tracking: 'tally', xp: 20, weight: 8,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_3', title: 'Feast Day',
    description: 'Feed your Blobbi 3 times',
    action: 'feed', target: 3, tracking: 'tally', xp: 35, weight: 5,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'sleep_1', title: 'Nap Time',
    description: 'Put your Blobbi to sleep',
    action: 'sleep', target: 1, tracking: 'tally', xp: 15, weight: 6,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'take_photo_1', title: 'Snapshot',
    description: 'Take a photo of your Blobbi',
    action: 'take_photo', target: 1, tracking: 'event', xp: 25, weight: 4,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'take_photo_2', title: 'Photo Album',
    description: 'Take 2 photos of your Blobbi',
    action: 'take_photo', target: 2, tracking: 'event', xp: 40, weight: 2,
    requiredStages: ['baby', 'adult'],
  },

  // ── All stages ───────────────────────────────────────────────────────────
  {
    id: 'clean_1', title: 'Quick Cleanup',
    description: 'Clean your Blobbi once',
    action: 'clean', target: 1, tracking: 'tally', xp: 10, weight: 10,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'clean_2', title: 'Squeaky Clean',
    description: 'Clean your Blobbi 2 times',
    action: 'clean', target: 2, tracking: 'tally', xp: 20, weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'sing_1', title: 'Sing Along',
    description: 'Sing a song to your Blobbi',
    action: 'sing', target: 1, tracking: 'tally', xp: 15, weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'sing_2', title: 'Karaoke Session',
    description: 'Sing 2 songs to your Blobbi',
    action: 'sing', target: 2, tracking: 'tally', xp: 25, weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'play_music_1', title: 'DJ Time',
    description: 'Play a song for your Blobbi',
    action: 'play_music', target: 1, tracking: 'tally', xp: 15, weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'play_music_2', title: 'Music Marathon',
    description: 'Play 2 songs for your Blobbi',
    action: 'play_music', target: 2, tracking: 'tally', xp: 25, weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'medicine_1', title: 'Health Check',
    description: 'Give medicine to your Blobbi',
    action: 'medicine', target: 1, tracking: 'tally', xp: 20, weight: 5,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'medicine_2', title: 'Doctor Visit',
    description: 'Give medicine to your Blobbi 2 times',
    action: 'medicine', target: 2, tracking: 'tally', xp: 35, weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },
];

// ─── Lookup ──────────────────────────────────────────────────────────────────

const POOL_BY_ID = new Map(DAILY_MISSION_POOL.map((d) => [d.id, d]));

/** Look up a mission definition by ID */
export function getDefinition(id: string): DailyMissionDefinition | undefined {
  return POOL_BY_ID.get(id);
}

// ─── Date Utilities ──────────────────────────────────────────────────────────

/** YYYY-MM-DD in local timezone */
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Whether the missions content needs a daily reset */
export function needsDailyReset(missions: MissionsContent | undefined): boolean {
  if (!missions) return true;
  return missions.date !== getTodayDateString();
}

// ─── Selection ───────────────────────────────────────────────────────────────

/** Seeded PRNG (Mulberry32) */
function seededRandom(seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateDailySeed(dateString: string, pubkey?: string): number {
  const input = pubkey ? `${dateString}:${pubkey}` : dateString;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function isMissionAvailableForStages(def: DailyMissionDefinition, stages: BlobbiStage[]): boolean {
  const required = def.requiredStages ?? ['baby', 'adult'];
  return required.some((s) => stages.includes(s));
}

/**
 * Select N missions deterministically from the pool.
 * Seeded by date + pubkey so the same user gets the same missions for a given day.
 */
export function selectDailyMissions(
  count: number,
  dateString: string,
  pubkey?: string,
  availableStages?: BlobbiStage[],
): DailyMissionDefinition[] {
  const stages = availableStages ?? ['baby', 'adult'];
  const eligible = DAILY_MISSION_POOL.filter((m) => isMissionAvailableForStages(m, stages));
  if (eligible.length === 0) return [];

  const random = seededRandom(generateDailySeed(dateString, pubkey));
  const available = [...eligible];
  const selected: DailyMissionDefinition[] = [];

  while (selected.length < count && available.length > 0) {
    const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
    let pick = random() * totalWeight;
    let idx = 0;
    for (let i = 0; i < available.length; i++) {
      pick -= available[i].weight;
      if (pick <= 0) { idx = i; break; }
    }
    selected.push(available[idx]);
    available.splice(idx, 1);
  }

  return selected;
}

// ─── Mission Instantiation ───────────────────────────────────────────────────

/** Create a fresh Mission from a definition */
export function createMission(def: DailyMissionDefinition): Mission {
  if (def.tracking === 'event') {
    return { id: def.id, target: def.target, events: [] } satisfies EventMission;
  }
  return { id: def.id, target: def.target, count: 0 } satisfies TallyMission;
}

/** Create a fresh MissionsContent for a new day */
export function createDailyMissionsContent(
  dateString: string,
  pubkey?: string,
  availableStages?: BlobbiStage[],
): MissionsContent {
  const defs = selectDailyMissions(DAILY_MISSION_COUNT, dateString, pubkey, availableStages);
  return {
    date: dateString,
    daily: defs.map(createMission),
    rerolls: MAX_DAILY_REROLLS,
  };
}

// ─── Progress Tracking ───────────────────────────────────────────────────────

/**
 * Increment tally for all daily missions matching the given action.
 * Returns a new missions content (immutable).
 */
export function trackTally(
  missions: MissionsContent,
  action: DailyMissionAction,
  incrementBy: number = 1,
): MissionsContent {
  const updated = missions.daily.map((m) => {
    const def = POOL_BY_ID.get(m.id);
    if (!def || def.action !== action) return m;
    if (!isTallyMission(m)) return m;
    if (m.count >= m.target) return m; // already complete
    return { ...m, count: Math.min(m.count + incrementBy, m.target) };
  });
  return { ...missions, daily: updated };
}

/**
 * Append an event ID to a daily mission.
 * Deduplicates by event ID. Returns new missions content.
 */
export function trackEvent(
  missions: MissionsContent,
  action: DailyMissionAction,
  eventId: string,
): MissionsContent {
  const updated = missions.daily.map((m) => {
    const def = POOL_BY_ID.get(m.id);
    if (!def || def.action !== action) return m;
    if (!isEventMission(m)) return m;
    if (m.events.length >= m.target) return m; // already complete
    if (m.events.includes(eventId)) return m; // dedup
    return { ...m, events: [...m.events, eventId] };
  });
  return { ...missions, daily: updated };
}

// ─── Evolution Mission Tracking (operates on Mission[] directly) ─────────────

/**
 * Increment tally for an evolution mission by ID.
 * Returns a new array (immutable). Used by the evolution session store.
 */
export function trackEvolutionTally(
  evolution: Mission[],
  missionId: string,
  incrementBy: number = 1,
): Mission[] {
  return evolution.map((m) => {
    if (m.id !== missionId) return m;
    if (!isTallyMission(m)) return m;
    if (m.count >= m.target) return m;
    return { ...m, count: Math.min(m.count + incrementBy, m.target) };
  });
}

/**
 * Append a Nostr event ID to an evolution mission.
 * Returns a new array (immutable). Used by the evolution session store.
 */
export function trackEvolutionEvent(
  evolution: Mission[],
  missionId: string,
  eventId: string,
): Mission[] {
  return evolution.map((m) => {
    if (m.id !== missionId) return m;
    if (!isEventMission(m)) return m;
    if (m.events.length >= m.target) return m;
    if (m.events.includes(eventId)) return m;
    return { ...m, events: [...m.events, eventId] };
  });
}

// ─── Completion Queries ──────────────────────────────────────────────────────

/** Whether all daily missions are complete */
export function areAllDailyComplete(missions: MissionsContent): boolean {
  return missions.daily.length > 0 && missions.daily.every(isMissionComplete);
}

/** Total XP available from today's daily missions (including bonus if all complete) */
export function totalDailyXp(missions: MissionsContent): number {
  const base = missions.daily.reduce((sum, m) => {
    const def = POOL_BY_ID.get(m.id);
    return sum + (def && isMissionComplete(m) ? def.xp : 0);
  }, 0);
  const bonus = areAllDailyComplete(missions) ? DAILY_BONUS_XP : 0;
  return base + bonus;
}

/** XP earned by a specific daily mission (0 if incomplete or unknown) */
export function missionXp(missionId: string, mission: Mission): number {
  const def = POOL_BY_ID.get(missionId);
  if (!def || !isMissionComplete(mission)) return 0;
  return def.xp;
}

// ─── Reroll ──────────────────────────────────────────────────────────────────

/**
 * Select a replacement mission not already in the current set.
 * Uses Math.random (rerolls should feel random, not deterministic).
 */
export function selectReplacementMission(
  currentMissions: Mission[],
  missionToReplaceId: string,
  availableStages?: BlobbiStage[],
): DailyMissionDefinition | null {
  const stages = availableStages ?? ['baby', 'adult'];
  const excludedIds = new Set(currentMissions.map((m) => m.id));

  const eligible = DAILY_MISSION_POOL.filter((m) =>
    m.id !== missionToReplaceId &&
    !excludedIds.has(m.id) &&
    isMissionAvailableForStages(m, stages),
  );

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, m) => sum + m.weight, 0);
  let pick = Math.random() * totalWeight;
  for (const def of eligible) {
    pick -= def.weight;
    if (pick <= 0) return def;
  }
  return eligible[0];
}

/**
 * Reroll a daily mission. Returns updated missions content or null if not possible.
 */
export function rerollMission(
  missions: MissionsContent,
  missionId: string,
  availableStages?: BlobbiStage[],
): MissionsContent | null {
  if (missions.rerolls <= 0) return null;

  const idx = missions.daily.findIndex((m) => m.id === missionId);
  if (idx === -1) return null;

  const existing = missions.daily[idx];
  if (isMissionComplete(existing)) return null; // can't reroll completed

  const replacement = selectReplacementMission(missions.daily, missionId, availableStages);
  if (!replacement) return null;

  const updatedDaily = [...missions.daily];
  updatedDaily[idx] = createMission(replacement);

  return {
    ...missions,
    daily: updatedDaily,
    rerolls: missions.rerolls - 1,
  };
}

// Re-export mission utilities for convenience
export { isTallyMission, isEventMission, isMissionComplete, missionProgress } from '@/blobbi/core/lib/missions';
export type { Mission, TallyMission, EventMission, MissionsContent } from '@/blobbi/core/lib/missions';
