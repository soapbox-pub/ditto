/**
 * Daily Missions System for Blobbi
 * 
 * This module defines the daily mission pool, selection logic, and types.
 * Daily missions are separate from hatch/evolve missions and provide
 * daily engagement loops with coin rewards.
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
  | 'take_photo';   // Take a photo of Blobbi

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
  /** Coin reward for completing this mission */
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
 * Stored state for daily missions (persisted in localStorage)
 */
export interface DailyMissionsState {
  /** The date string (YYYY-MM-DD) when these missions were generated */
  date: string;
  /** The selected missions for this day */
  missions: DailyMission[];
  /** Total coins earned from daily missions (lifetime) */
  totalCoinsEarned: number;
  /** Whether the bonus mission has been claimed today */
  bonusClaimed?: boolean;
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
  // ─── Common Missions (High Weight) ────────────────────────────────────────
  {
    id: 'interact_6',
    title: 'Interact with your Blobbi',
    description: 'Interact with your Blobbi 6 times (feed, clean, play, etc.)',
    action: 'interact',
    requiredCount: 6,
    reward: 30,
    weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'feed_2',
    title: 'Feed your Blobbi',
    description: 'Feed your Blobbi 2 times',
    action: 'feed',
    requiredCount: 2,
    reward: 20,
    weight: 10,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'clean_1',
    title: 'Clean your Blobbi',
    description: 'Clean your Blobbi 1 time',
    action: 'clean',
    requiredCount: 1,
    reward: 20,
    weight: 10,
    requiredStages: ['baby', 'adult'],
  },

  // ─── Medium Frequency Missions ────────────────────────────────────────────
  {
    id: 'sing_1',
    title: 'Sing to your Blobbi',
    description: 'Sing a song to your Blobbi',
    action: 'sing',
    requiredCount: 1,
    reward: 25,
    weight: 6,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'play_music_1',
    title: 'Play music for your Blobbi',
    description: 'Play a song for your Blobbi to enjoy',
    action: 'play_music',
    requiredCount: 1,
    reward: 25,
    weight: 6,
    requiredStages: ['baby', 'adult'],
  },
  {
    id: 'sleep_1',
    title: 'Let your Blobbi sleep',
    description: 'Put your Blobbi to sleep',
    action: 'sleep',
    requiredCount: 1,
    reward: 20,
    weight: 6,
    requiredStages: ['baby', 'adult'],
  },

  // ─── Rare Missions ────────────────────────────────────────────────────────
  {
    id: 'take_photo_1',
    title: 'Take a photo',
    description: 'Take a polaroid photo of your Blobbi',
    action: 'take_photo',
    requiredCount: 1,
    reward: 35,
    weight: 1,
    requiredStages: ['baby', 'adult'],
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
  previousTotalCoins: number = 0,
  availableStages?: BlobbiStage[]
): DailyMissionsState {
  const definitions = selectDailyMissions(3, dateString, pubkey, availableStages);
  return {
    date: dateString,
    missions: definitions.map(createMissionFromDefinition),
    totalCoinsEarned: previousTotalCoins,
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
): { state: DailyMissionsState; coinsEarned: number } {
  let coinsEarned = 0;
  
  const updatedMissions = state.missions.map((mission) => {
    if (mission.id !== missionId) return mission;
    
    // Can only claim if completed and not yet claimed
    if (!mission.completed || mission.claimed) return mission;
    
    coinsEarned = mission.reward;
    return {
      ...mission,
      claimed: true,
    };
  });
  
  return {
    state: {
      ...state,
      missions: updatedMissions,
      totalCoinsEarned: state.totalCoinsEarned + coinsEarned,
    },
    coinsEarned,
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
  description: 'Complete all daily missions to claim this bonus reward',
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
): { state: DailyMissionsState; coinsEarned: number } {
  // Can only claim if bonus is available and not yet claimed
  if (!isBonusMissionAvailable(state) || isBonusMissionClaimed(state)) {
    return { state, coinsEarned: 0 };
  }
  
  return {
    state: {
      ...state,
      bonusClaimed: true,
      totalCoinsEarned: state.totalCoinsEarned + BONUS_MISSION_DEFINITION.reward,
    },
    coinsEarned: BONUS_MISSION_DEFINITION.reward,
  };
}
