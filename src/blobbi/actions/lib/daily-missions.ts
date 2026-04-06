/**
 * Daily Missions System for Blobbi
 * 
 * This module defines the daily mission pool, selection logic, and types.
 * Daily missions are separate from hatch/evolve missions and provide
 * daily engagement loops with XP rewards applied to the active companion.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Mission action types that can trigger progress
 */
export type DailyMissionAction = 
  | 'interact'      // Any interaction (feed, clean, play, etc.)
  | 'feed'          // Feeding action specifically
  | 'clean'         // Cleaning action specifically
  | 'sing'          // Sing direct action
  | 'play_music'    // Play music direct action
  | 'sleep'         // Put Blobbi to sleep
  | 'take_photo'    // Take a photo of Blobbi
  | 'medicine';     // Give medicine to Blobbi

/**
 * Blobbi stage type for filtering missions
 */
export type BlobbiStage = 'egg' | 'baby' | 'adult';

/**
 * Definition of a daily mission in the pool
 */
export interface DailyMissionDefinition {
  /** Unique identifier for this mission type */
  id: string;
  /** Display title */
  title: string;
  /** Description of what to do */
  description: string;
  /** Action that triggers progress */
  action: DailyMissionAction;
  /** Number of times the action must be performed */
  requiredCount: number;
  /** XP reward for completing this mission (applied to active companion) */
  reward: number;
  /** Selection weight (higher = more likely to be selected) */
  weight: number;
  /** Required stages to show this mission (if empty/undefined, requires baby or adult) */
  requiredStages?: BlobbiStage[];
}

/**
 * A daily mission instance with progress tracking
 */
export interface DailyMission extends DailyMissionDefinition {
  /** Current progress (how many times the action has been performed today) */
  currentCount: number;
  /** Whether the mission has been completed */
  completed: boolean;
  /** Whether the reward has been claimed */
  claimed: boolean;
}

/**
 * Stored state for daily missions.
 *
 * Source of truth: Kind 11125 profile content JSON (`dailyMissions` section).
 * During a session, state is held in an in-memory map for instant UI updates.
 * `useDailyMissionsPersistence` debounces all intermediate state changes
 * (progress, rerolls, daily resets) back to kind 11125, so nothing is lost
 * on page refresh. localStorage is NOT used.
 */
export interface DailyMissionsState {
  /** The date string (YYYY-MM-DD) when these missions were generated */
  date: string;
  /** The selected missions for this day */
  missions: DailyMission[];
  /** Total XP earned from daily missions (lifetime) */
  totalXpEarned: number;
  /** Whether the bonus mission has been claimed today */
  bonusClaimed?: boolean;
  /** Number of rerolls remaining for today (resets daily, max 3) */
  rerollsRemaining?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of mission rerolls allowed per day */
export const MAX_DAILY_REROLLS = 3;

// ─── In-Memory Session Store ──────────────────────────────────────────────────

/**
 * In-memory, pubkey-scoped store for daily missions state.
 *
 * ── Source-of-Truth Architecture ──────────────────────────────────────────────
 *
 *   Kind 11125 content JSON (`dailyMissions` section) is the ONLY persistent
 *   source of truth. This in-memory map is a short-lived UI cache:
 *
 *   • On page load / account switch, `useDailyMissions` hydrates this map
 *     from `profile.content.dailyMissions` (parsed from the kind 11125 event).
 *   • During the session, progress/rerolls update this map for instant UI.
 *   • `useDailyMissionsPersistence` debounces writes of intermediate progress
 *     (currentCount, completed, rerolls, etc.) back to kind 11125.
 *   • Claims persist to kind 11125 immediately via `useClaimMissionReward`.
 *   • On page refresh the map is empty, so the hook re-hydrates from kind 11125
 *     — which now includes intermediate progress, not just claimed rewards.
 *
 *   localStorage is NOT used for daily missions. This eliminates all
 *   cross-account leakage bugs.
 */
const sessionStore = new Map<string, DailyMissionsState>();

/**
 * Read daily missions state from the in-memory session store.
 *
 * Returns null if:
 *   - No state exists for this pubkey in the current session
 *   - The pubkey is empty/undefined
 */
export function readDailyMissionsState(pubkey: string | undefined): DailyMissionsState | null {
  if (!pubkey) return null;
  return sessionStore.get(pubkey) ?? null;
}

/**
 * Write daily missions state to the in-memory session store.
 *
 * This is the ONLY correct way to update session mission state.
 * No-ops silently if pubkey is empty/undefined (logged-out users
 * should not have mission state).
 *
 * Note: This does NOT persist to kind 11125 by itself. Callers
 * should dispatch a `daily-missions-updated` DOM event after writing
 * so that `useDailyMissionsPersistence` picks up the change and
 * debounces the write to kind 11125.
 */
export function writeDailyMissionsState(pubkey: string | undefined, state: DailyMissionsState): void {
  if (!pubkey) return;
  sessionStore.set(pubkey, state);
}

/**
 * Clear the session store entry for a pubkey.
 * Used when the hook needs to re-hydrate from kind 11125 data.
 */
export function clearDailyMissionsState(pubkey: string | undefined): void {
  if (!pubkey) return;
  sessionStore.delete(pubkey);
}

// ─── Mission Pool ─────────────────────────────────────────────────────────────

/**
 * The pool of available daily missions.
 * Weights determine selection frequency:
 * - High weight (10): Common missions (interact, feed, clean)
 * - Medium weight (6): Regular missions (sing, play music, sleep)
 * - Low weight (2): Uncommon missions (change shape)
 * - Rare weight (1): Rare missions (take photo)
 */
export const DAILY_MISSION_POOL: DailyMissionDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // BABY/ADULT ONLY MISSIONS
  // These actions are NOT available for eggs
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Interact Missions (Baby/Adult only) ───────────────────────────────────
  {
    id: 'interact_3',
    title: 'Quick Care',
    description: 'Interact with your Blobbi 3 times',
    action: 'interact',
    requiredCount: 3,
    reward: 15,
    weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'interact_6',
    title: 'Attentive Caretaker',
    description: 'Interact with your Blobbi 6 times',
    action: 'interact',
    requiredCount: 6,
    reward: 30,
    weight: 8,
    requiredStages: ['baby', 'adult'],
  },

  // ─── Feed Missions (Baby/Adult only) ───────────────────────────────────────
  {
    id: 'feed_1',
    title: 'Snack Time',
    description: 'Feed your Blobbi once',
    action: 'feed',
    requiredCount: 1,
    reward: 10,
    weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_2',
    title: 'Hungry Blobbi',
    description: 'Feed your Blobbi 2 times',
    action: 'feed',
    requiredCount: 2,
    reward: 20,
    weight: 8,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_3',
    title: 'Feast Day',
    description: 'Feed your Blobbi 3 times',
    action: 'feed',
    requiredCount: 3,
    reward: 35,
    weight: 5,
    requiredStages: ['baby', 'adult'],
  },

  // ─── Sleep Missions (Baby/Adult only) ──────────────────────────────────────
  {
    id: 'sleep_1',
    title: 'Nap Time',
    description: 'Put your Blobbi to sleep',
    action: 'sleep',
    requiredCount: 1,
    reward: 15,
    weight: 6,
    requiredStages: ['baby', 'adult'],
  },

  // ─── Photo Missions (Baby/Adult only) ──────────────────────────────────────
  {
    id: 'take_photo_1',
    title: 'Snapshot',
    description: 'Take a polaroid photo of your Blobbi',
    action: 'take_photo',
    requiredCount: 1,
    reward: 25,
    weight: 4,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'take_photo_2',
    title: 'Photo Album',
    description: 'Take 2 photos of your Blobbi',
    action: 'take_photo',
    requiredCount: 2,
    reward: 40,
    weight: 2,
    requiredStages: ['baby', 'adult'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EGG + BABY + ADULT MISSIONS
  // These actions are available for ALL stages including eggs
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Clean Missions (All stages) ───────────────────────────────────────────
  {
    id: 'clean_1',
    title: 'Quick Cleanup',
    description: 'Clean your Blobbi once',
    action: 'clean',
    requiredCount: 1,
    reward: 10,
    weight: 10,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'clean_2',
    title: 'Squeaky Clean',
    description: 'Clean your Blobbi 2 times',
    action: 'clean',
    requiredCount: 2,
    reward: 20,
    weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },

  // ─── Sing Missions (All stages) ────────────────────────────────────────────
  {
    id: 'sing_1',
    title: 'Sing Along',
    description: 'Sing a song to your Blobbi',
    action: 'sing',
    requiredCount: 1,
    reward: 15,
    weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'sing_2',
    title: 'Karaoke Session',
    description: 'Sing 2 songs to your Blobbi',
    action: 'sing',
    requiredCount: 2,
    reward: 25,
    weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },

  // ─── Play Music Missions (All stages) ──────────────────────────────────────
  {
    id: 'play_music_1',
    title: 'DJ Time',
    description: 'Play a song for your Blobbi',
    action: 'play_music',
    requiredCount: 1,
    reward: 15,
    weight: 6,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'play_music_2',
    title: 'Music Marathon',
    description: 'Play 2 songs for your Blobbi',
    action: 'play_music',
    requiredCount: 2,
    reward: 25,
    weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },

  // ─── Medicine Missions (All stages) ────────────────────────────────────────
  {
    id: 'medicine_1',
    title: 'Health Check',
    description: 'Give medicine to your Blobbi',
    action: 'medicine',
    requiredCount: 1,
    reward: 20,
    weight: 5,
    requiredStages: ['egg', 'baby', 'adult'],
  },
  {
    id: 'medicine_2',
    title: 'Doctor Visit',
    description: 'Give medicine to your Blobbi 2 times',
    action: 'medicine',
    requiredCount: 2,
    reward: 35,
    weight: 3,
    requiredStages: ['egg', 'baby', 'adult'],
  },
];

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get the current date string in YYYY-MM-DD format (local timezone)
 */
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Generate a seed number from a date string and optional user pubkey.
 * Used for deterministic daily mission selection.
 */
function generateDailySeed(dateString: string, pubkey?: string): number {
  const input = pubkey ? `${dateString}:${pubkey}` : dateString;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator (Mulberry32)
 */
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Check if a mission is available for the given stages.
 * Missions with no requiredStages default to requiring baby or adult.
 */
function isMissionAvailableForStages(
  mission: DailyMissionDefinition,
  availableStages: BlobbiStage[]
): boolean {
  const requiredStages = mission.requiredStages ?? ['baby', 'adult'];
  return requiredStages.some((stage) => availableStages.includes(stage));
}

/**
 * Select N missions from the pool using weighted random selection.
 * Uses a seeded random generator for deterministic daily selection.
 * 
 * @param count - Number of missions to select
 * @param dateString - Date string for seeding (YYYY-MM-DD)
 * @param pubkey - Optional user pubkey for seeding
 * @param availableStages - Stages the user has available (filters eligible missions)
 */
export function selectDailyMissions(
  count: number,
  dateString: string,
  pubkey?: string,
  availableStages?: BlobbiStage[]
): DailyMissionDefinition[] {
  const seed = generateDailySeed(dateString, pubkey);
  const random = seededRandom(seed);
  
  // Filter pool by available stages (default to baby/adult if not specified)
  const stagesToCheck = availableStages ?? ['baby', 'adult'];
  const eligibleMissions = DAILY_MISSION_POOL.filter((m) =>
    isMissionAvailableForStages(m, stagesToCheck)
  );
  
  // If no missions are available for the user's stages, return empty
  if (eligibleMissions.length === 0) {
    return [];
  }
  
  // Create a copy of the eligible pool
  const available = [...eligibleMissions];
  const selected: DailyMissionDefinition[] = [];
  
  while (selected.length < count && available.length > 0) {
    // Calculate total weight of remaining missions
    const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
    
    // Pick a random value in [0, totalWeight)
    let pick = random() * totalWeight;
    
    // Find the mission that corresponds to this pick
    let selectedIndex = 0;
    for (let i = 0; i < available.length; i++) {
      pick -= available[i].weight;
      if (pick <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    // Add to selected and remove from available
    selected.push(available[selectedIndex]);
    available.splice(selectedIndex, 1);
  }
  
  return selected;
}

/**
 * Create a fresh DailyMission from a definition
 */
export function createMissionFromDefinition(def: DailyMissionDefinition): DailyMission {
  return {
    ...def,
    currentCount: 0,
    completed: false,
    claimed: false,
  };
}

/**
 * Create the initial daily missions state for a new day
 */
export function createDailyMissionsState(
  dateString: string,
  pubkey?: string,
  previousTotalXp: number = 0,
  availableStages?: BlobbiStage[]
): DailyMissionsState {
  const definitions = selectDailyMissions(3, dateString, pubkey, availableStages);
  return {
    date: dateString,
    missions: definitions.map(createMissionFromDefinition),
    totalXpEarned: previousTotalXp,
    rerollsRemaining: MAX_DAILY_REROLLS,
  };
}

/**
 * Check if the daily missions need to be reset (new day)
 */
export function needsDailyReset(state: DailyMissionsState | null): boolean {
  if (!state) return true;
  return state.date !== getTodayDateString();
}

/**
 * Update mission progress for a given action
 */
export function updateMissionProgress(
  state: DailyMissionsState,
  action: DailyMissionAction,
  incrementBy: number = 1
): DailyMissionsState {
  const updatedMissions = state.missions.map((mission) => {
    // Skip if not the matching action or already completed
    if (mission.action !== action || mission.completed) {
      return mission;
    }
    
    const newCount = Math.min(mission.currentCount + incrementBy, mission.requiredCount);
    const nowCompleted = newCount >= mission.requiredCount;
    
    return {
      ...mission,
      currentCount: newCount,
      completed: nowCompleted,
    };
  });
  
  return {
    ...state,
    missions: updatedMissions,
  };
}

/**
 * Claim reward for a completed mission
 */
export function claimMissionReward(
  state: DailyMissionsState,
  missionId: string
): { state: DailyMissionsState; xpEarned: number } {
  let xpEarned = 0;
  
  const updatedMissions = state.missions.map((mission) => {
    if (mission.id !== missionId) return mission;
    
    // Can only claim if completed and not yet claimed
    if (!mission.completed || mission.claimed) return mission;
    
    xpEarned = mission.reward;
    return {
      ...mission,
      claimed: true,
    };
  });
  
  return {
    state: {
      ...state,
      missions: updatedMissions,
      totalXpEarned: state.totalXpEarned + xpEarned,
    },
    xpEarned,
  };
}

/**
 * Get the total potential reward for all daily missions
 */
export function getTotalPotentialReward(state: DailyMissionsState): number {
  return state.missions.reduce((sum, m) => sum + m.reward, 0);
}

/**
 * Get the total claimed reward for today
 */
export function getTodayClaimedReward(state: DailyMissionsState): number {
  return state.missions
    .filter((m) => m.claimed)
    .reduce((sum, m) => sum + m.reward, 0);
}

/**
 * Check if all daily missions are completed
 */
export function areAllMissionsCompleted(state: DailyMissionsState): boolean {
  return state.missions.every((m) => m.completed);
}

/**
 * Check if all daily missions are claimed
 */
export function areAllMissionsClaimed(state: DailyMissionsState): boolean {
  return state.missions.every((m) => m.claimed);
}

// ─── Bonus Mission ────────────────────────────────────────────────────────────

/**
 * The bonus mission that becomes available after completing all regular missions.
 * This is a special mission that rewards extra coins for daily completion.
 */
export const BONUS_MISSION_DEFINITION: DailyMissionDefinition = {
  id: 'bonus_daily_complete',
  title: 'Daily Champion',
  description: 'Complete all daily missions to claim this bonus XP',
  action: 'interact', // Not actually used - bonus is auto-completed
  requiredCount: 1,
  reward: 50,
  weight: 0, // Not part of random selection
};

/**
 * Check if the bonus mission is available (all regular missions completed)
 */
export function isBonusMissionAvailable(state: DailyMissionsState): boolean {
  // Bonus is available if there are regular missions and all are completed
  return state.missions.length > 0 && areAllMissionsCompleted(state);
}

/**
 * Check if the bonus mission has been claimed today
 */
export function isBonusMissionClaimed(state: DailyMissionsState): boolean {
  return state.bonusClaimed ?? false;
}

/**
 * Claim the bonus mission reward
 */
export function claimBonusMissionReward(
  state: DailyMissionsState
): { state: DailyMissionsState; xpEarned: number } {
  // Can only claim if bonus is available and not yet claimed
  if (!isBonusMissionAvailable(state) || isBonusMissionClaimed(state)) {
    return { state, xpEarned: 0 };
  }
  
  return {
    state: {
      ...state,
      bonusClaimed: true,
      totalXpEarned: state.totalXpEarned + BONUS_MISSION_DEFINITION.reward,
    },
    xpEarned: BONUS_MISSION_DEFINITION.reward,
  };
}

// ─── Mission Reroll ───────────────────────────────────────────────────────────

/**
 * Get the number of rerolls remaining for today.
 * Returns MAX_DAILY_REROLLS if not set (for backward compatibility with old state).
 */
export function getRerollsRemaining(state: DailyMissionsState): number {
  // If rerollsRemaining is not set (old state), default to max
  if (state.rerollsRemaining === undefined || state.rerollsRemaining === null) {
    return MAX_DAILY_REROLLS;
  }
  return state.rerollsRemaining;
}

/**
 * Check if the user can reroll a mission
 */
export function canRerollMission(state: DailyMissionsState, missionId: string): boolean {
  const rerollsRemaining = getRerollsRemaining(state);
  if (rerollsRemaining <= 0) return false;
  
  // Find the mission
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return false;
  
  // Cannot reroll completed or claimed missions
  if (mission.completed || mission.claimed) return false;
  
  return true;
}

/**
 * Select a replacement mission that:
 * - Is not already in the current mission list
 * - Is not the mission being replaced (avoid immediately giving back the same)
 * - Respects the user's available stages
 * 
 * Uses weighted random selection from eligible missions.
 */
export function selectReplacementMission(
  currentMissions: DailyMission[],
  missionToReplace: DailyMission,
  availableStages?: BlobbiStage[]
): DailyMissionDefinition | null {
  // Default to baby/adult if no stages provided (most common case)
  const stagesToCheck = availableStages && availableStages.length > 0 
    ? availableStages 
    : ['baby', 'adult'] as BlobbiStage[];
  
  // Get IDs of missions that cannot be selected (current active missions)
  const excludedIds = new Set<string>();
  
  // Exclude all current missions EXCEPT the one being replaced
  for (const m of currentMissions) {
    if (m.id !== missionToReplace.id) {
      excludedIds.add(m.id);
    }
  }
  
  // Filter pool to eligible missions
  const eligibleMissions = DAILY_MISSION_POOL.filter((m) => {
    // Must not be an already-active mission (except the one being replaced)
    if (excludedIds.has(m.id)) return false;
    // Must not be the same mission being replaced
    if (m.id === missionToReplace.id) return false;
    // Must be available for user's stages
    if (!isMissionAvailableForStages(m, stagesToCheck)) return false;
    return true;
  });
  
  // If no eligible missions, return null
  if (eligibleMissions.length === 0) {
    return null;
  }
  
  // Use Math.random() for non-deterministic selection (rerolls should feel random)
  const totalWeight = eligibleMissions.reduce((sum, m) => sum + m.weight, 0);
  let pick = Math.random() * totalWeight;
  
  for (const mission of eligibleMissions) {
    pick -= mission.weight;
    if (pick <= 0) {
      return mission;
    }
  }
  
  // Fallback to first eligible (shouldn't happen)
  return eligibleMissions[0];
}

/**
 * Reroll a mission, replacing it with a new one from the pool.
 * Returns the updated state and the new mission, or null if reroll failed.
 */
export function rerollMission(
  state: DailyMissionsState,
  missionId: string,
  availableStages?: BlobbiStage[]
): { state: DailyMissionsState; newMission: DailyMission } | null {
  // Check if reroll is allowed
  if (!canRerollMission(state, missionId)) {
    return null;
  }
  
  // Find the mission index
  const missionIndex = state.missions.findIndex((m) => m.id === missionId);
  if (missionIndex === -1) {
    return null;
  }
  
  const oldMission = state.missions[missionIndex];
  
  // Select a replacement
  const replacement = selectReplacementMission(state.missions, oldMission, availableStages);
  if (!replacement) {
    return null;
  }
  
  // Create the new mission instance
  const newMission = createMissionFromDefinition(replacement);
  
  // Update the missions array
  const updatedMissions = [...state.missions];
  updatedMissions[missionIndex] = newMission;
  
  // Decrement rerolls remaining
  const newRerollsRemaining = getRerollsRemaining(state) - 1;
  
  return {
    state: {
      ...state,
      missions: updatedMissions,
      rerollsRemaining: newRerollsRemaining,
    },
    newMission,
  };
}
