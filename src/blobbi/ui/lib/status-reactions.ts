/**
 * Status-Based Reaction System for Blobbi
 *
 * Determines which visual recipe Blobbi should display based on current stats.
 * Uses a priority-based system with severity levels and probabilistic selection.
 *
 * The system resolves stats into a single emotion + optional body effects.
 * There is no separate "base" or "overlay" layer — each stat condition maps
 * to one named emotion, and body effects are resolved independently.
 *
 * When multiple stats are low simultaneously (e.g. energy + hygiene), the
 * system merges their visual recipes at the recipe level rather than stacking
 * emotions sequentially. This is handled by resolveStatusEmotions().
 *
 * Design principles:
 *   - Priority order determines which stat "wins" for face expression
 *   - Severity levels affect how often reactions appear
 *   - Probabilistic triggering prevents constant flickering
 *   - Body effects (dirty) are independent of face emotions
 *   - Sleepy is a full emotion with its own complete recipe, not an overlay
 */

import type { BlobbiEmotion } from './emotions';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import type { BodyEffectsSpec } from './bodyEffects';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Severity levels based on stat value thresholds.
 * Determines how urgently Blobbi needs to react.
 */
export type StatSeverity = 'normal' | 'warning' | 'high' | 'critical';

/**
 * A stat that can trigger automatic reactions.
 */
export type ReactiveStat = keyof BlobbiStats;

/**
 * Configuration for how a stat maps to reactions.
 */
export interface StatReactionConfig {
  /** The stat this config applies to */
  stat: ReactiveStat;
  /** Priority (lower = higher priority, checked first) */
  priority: number;
  /** Emotion to show at warning/high severity */
  normalReaction: BlobbiEmotion;
  /** Emotion to show at critical severity (can be different) */
  criticalReaction?: BlobbiEmotion;
}

/**
 * Result of analyzing a stat's current state.
 */
export interface StatAnalysis {
  stat: ReactiveStat;
  value: number;
  severity: StatSeverity;
  reaction: BlobbiEmotion;
  priority: number;
  /** Probability (0-1) that this reaction should trigger */
  triggerProbability: number;
}

/**
 * Timing configuration for status reactions.
 */
export interface StatusReactionTiming {
  /** Base interval between reaction checks (ms) */
  checkInterval: number;
  /** How long a reaction stays visible (ms) */
  reactionDuration: number;
  /** Cooldown multipliers by severity (lower = shorter cooldown) */
  cooldownMultipliers: Record<StatSeverity, number>;
  /** Base cooldown duration (ms) */
  baseCooldown: number;
}

/**
 * Result of resolving the best reaction from current stats.
 *
 * @deprecated Use `resolveStatusEmotions()` instead, which properly separates
 * emotion from body effects.
 */
export interface StatusReactionResult {
  /** The emotion to display (null = stay at default) */
  emotion: BlobbiEmotion | null;
  /** The stat that triggered this reaction (null if default) */
  triggeringStat: ReactiveStat | null;
  /** Severity of the triggering stat */
  severity: StatSeverity | null;
  /** Whether this reaction should actually fire (probabilistic) */
  shouldTrigger: boolean;
  /** Suggested cooldown before next check (ms) */
  cooldownMs: number;
}

/**
 * Result of resolving emotions from current stats.
 *
 * The system resolves a single face emotion and independent body effects.
 * When multiple stats are low, priority determines which face emotion wins.
 * If both a face-affecting stat and energy are low simultaneously, the
 * emotions are merged at the recipe level by the consumer.
 */
export interface StatusEmotionResult {
  /** Primary face emotion (null = neutral/default). When energy is also low,
   *  this is the "lossy" face state and sleepy is provided as secondaryEmotion. */
  emotion: BlobbiEmotion | null;
  /** Secondary emotion to merge with the primary (only set when energy is low
   *  AND another stat is also producing a face emotion). The consumer should
   *  use mergeVisualRecipes() to combine these. */
  secondaryEmotion: BlobbiEmotion | null;
  /** The stat that triggered the primary emotion */
  triggeringStat: ReactiveStat | null;
  /** The stat that triggered the secondary emotion */
  triggeringSecondaryStat: ReactiveStat | null;
  /** Body effects to apply (independent of face emotions) */
  bodyEffects: BodyEffectsSpec | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Severity thresholds based on stat value.
 * Values are inclusive upper bounds.
 */
export const SEVERITY_THRESHOLDS = {
  critical: 30,  // 0-29: critical
  high: 50,      // 30-49: high
  warning: 70,   // 50-69: warning
  // 70+: normal
} as const;

/**
 * Trigger probabilities by severity.
 * Higher severity = higher chance of triggering.
 */
export const TRIGGER_PROBABILITIES: Record<StatSeverity, number> = {
  normal: 0,      // Never trigger when stat is healthy
  warning: 0.3,   // 30% chance
  high: 0.6,      // 60% chance
  critical: 0.9,  // 90% chance (almost always)
};

/**
 * Stat reaction configurations.
 * Priority order: energy > health > hunger > hygiene > happiness
 * Lower priority number = checked first (wins ties).
 *
 * Emotion mapping:
 *   - sleepy: low energy (full recipe with eye blink + breathing mouth + Zzz)
 *   - boring: low-energy, unamused state (generic "not feeling good" face)
 *   - dizzy: critical health state only
 *   - hungry: hunger-specific face with drool and food icon
 *
 * NOTE: "dirty" is NOT a face emotion. Hygiene maps to 'boring' for
 * the face, and dirty body effects (dirt marks, stink clouds) are applied
 * as independent body decorators via resolveStatusEmotions().bodyEffects.
 */
export const STAT_REACTION_CONFIGS: StatReactionConfig[] = [
  {
    stat: 'energy',
    priority: 1,
    normalReaction: 'sleepy',
  },
  {
    stat: 'health',
    priority: 2,
    normalReaction: 'boring',
    criticalReaction: 'dizzy',
  },
  {
    stat: 'hunger',
    priority: 3,
    normalReaction: 'hungry',
  },
  {
    stat: 'hygiene',
    priority: 4,
    normalReaction: 'boring',
  },
  {
    stat: 'happiness',
    priority: 5,
    normalReaction: 'boring',
  },
];

/**
 * Default timing configuration.
 */
export const DEFAULT_TIMING: StatusReactionTiming = {
  checkInterval: 5000,      // Check every 5 seconds
  reactionDuration: 4000,   // Reaction stays visible for 4 seconds
  baseCooldown: 8000,       // Base 8 second cooldown
  cooldownMultipliers: {
    normal: 2.0,    // Longest cooldown (not really used since normal doesn't trigger)
    warning: 1.5,   // Longer cooldown
    high: 1.0,      // Standard cooldown
    critical: 0.5,  // Shortest cooldown (more frequent reactions)
  },
};

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Determine severity level from a stat value.
 */
export function getSeverity(value: number): StatSeverity {
  if (value < SEVERITY_THRESHOLDS.critical) return 'critical';
  if (value < SEVERITY_THRESHOLDS.high) return 'high';
  if (value < SEVERITY_THRESHOLDS.warning) return 'warning';
  return 'normal';
}

/**
 * Get the trigger probability for a severity level.
 */
export function getTriggerProbability(severity: StatSeverity): number {
  return TRIGGER_PROBABILITIES[severity];
}

/**
 * Calculate cooldown duration based on severity.
 */
export function calculateCooldown(
  severity: StatSeverity,
  timing: StatusReactionTiming = DEFAULT_TIMING
): number {
  return timing.baseCooldown * timing.cooldownMultipliers[severity];
}

/**
 * Analyze a single stat and return its reaction details.
 */
export function analyzeStat(
  stat: ReactiveStat,
  value: number,
  config: StatReactionConfig
): StatAnalysis {
  const severity = getSeverity(value);
  const triggerProbability = getTriggerProbability(severity);

  // Choose between normal and critical reaction based on severity
  const reaction = severity === 'critical' && config.criticalReaction
    ? config.criticalReaction
    : config.normalReaction;

  return {
    stat,
    value,
    severity,
    reaction,
    priority: config.priority,
    triggerProbability,
  };
}

/**
 * Analyze all stats and return sorted by priority (highest priority first).
 * Only includes stats that are below normal threshold.
 */
export function analyzeAllStats(stats: BlobbiStats): StatAnalysis[] {
  const analyses: StatAnalysis[] = [];

  for (const config of STAT_REACTION_CONFIGS) {
    const value = stats[config.stat];
    const analysis = analyzeStat(config.stat, value, config);

    // Only include if severity is not normal
    if (analysis.severity !== 'normal') {
      analyses.push(analysis);
    }
  }

  // Sort by priority (lower number = higher priority)
  return analyses.sort((a, b) => a.priority - b.priority);
}

/**
 * Resolve the best reaction to show based on current stats.
 *
 * @deprecated Use `resolveStatusEmotions()` instead.
 *
 * @param stats - Current Blobbi stats
 * @param forceCheck - If true, bypasses probability check
 * @param timing - Timing configuration
 * @returns The reaction result
 */
export function resolveStatusReaction(
  stats: BlobbiStats,
  forceCheck = false,
  timing: StatusReactionTiming = DEFAULT_TIMING
): StatusReactionResult {
  const analyses = analyzeAllStats(stats);

  if (analyses.length === 0) {
    return {
      emotion: null,
      triggeringStat: null,
      severity: null,
      shouldTrigger: false,
      cooldownMs: timing.checkInterval,
    };
  }

  const winner = analyses[0];
  const shouldTrigger = forceCheck || Math.random() < winner.triggerProbability;

  return {
    emotion: winner.reaction,
    triggeringStat: winner.stat,
    severity: winner.severity,
    shouldTrigger,
    cooldownMs: calculateCooldown(winner.severity, timing),
  };
}

/**
 * Check if an emotion is a status-based reaction.
 */
export function isStatusReaction(emotion: BlobbiEmotion): boolean {
  const statusEmotions: BlobbiEmotion[] = ['sleepy', 'hungry', 'boring', 'dizzy'];
  return statusEmotions.includes(emotion);
}

/**
 * Get the default/neutral emotion when no status reactions are active.
 */
export function getDefaultEmotion(): BlobbiEmotion {
  return 'neutral';
}

/**
 * Resolve status emotions from current stats.
 *
 * Returns a primary emotion, an optional secondary emotion (for merging),
 * and independent body effects.
 *
 * When multiple stats are low:
 *   - The highest-priority stat determines the primary emotion
 *   - If energy is low AND another stat also triggers, sleepy becomes
 *     the secondary emotion (to be merged at the recipe level)
 *   - Body effects (dirty) are resolved independently from face emotions
 *
 * Example scenarios:
 *   - Only energy low → emotion: 'sleepy', secondary: null
 *   - Only hygiene low → emotion: 'boring', bodyEffects: dirty
 *   - Energy + hygiene low → emotion: 'sleepy', secondary: 'boring', bodyEffects: dirty
 *   - Energy + hunger low → emotion: 'sleepy', secondary: 'hungry'
 *
 * @param stats - Current Blobbi stats
 * @returns Primary emotion, optional secondary, and body effects
 */
export function resolveStatusEmotions(stats: BlobbiStats): StatusEmotionResult {
  const analyses = analyzeAllStats(stats);

  // Resolve body effects independently from face emotions.
  // Hygiene triggers dirty body effects regardless of which face emotion wins.
  const hygieneAnalysis = analyses.find(a => a.stat === 'hygiene');
  const bodyEffects: BodyEffectsSpec | null = hygieneAnalysis
    ? { dirtyMarks: { enabled: true, count: 3 }, stinkClouds: { enabled: true, count: 3 } }
    : null;

  // No stats are low enough to trigger
  if (analyses.length === 0) {
    return {
      emotion: null,
      secondaryEmotion: null,
      triggeringStat: null,
      triggeringSecondaryStat: null,
      bodyEffects: null,
    };
  }

  // The highest-priority analysis wins as primary emotion
  const winner = analyses[0];

  // Check if there's a sleepy analysis AND a separate face-affecting stat
  const sleepyAnalysis = analyses.find(a => a.reaction === 'sleepy');
  const nonSleepyAnalyses = analyses.filter(a => a.reaction !== 'sleepy');

  let primaryEmotion: BlobbiEmotion;
  let primaryStat: ReactiveStat;
  let secondaryEmotion: BlobbiEmotion | null = null;
  let secondaryStat: ReactiveStat | null = null;

  if (sleepyAnalysis && nonSleepyAnalyses.length > 0) {
    // Both sleepy and another face emotion are active.
    // Sleepy wins as primary (highest priority), the other is secondary for merging.
    primaryEmotion = sleepyAnalysis.reaction;
    primaryStat = sleepyAnalysis.stat;
    secondaryEmotion = nonSleepyAnalyses[0].reaction;
    secondaryStat = nonSleepyAnalyses[0].stat;
  } else {
    // Single winner takes all
    primaryEmotion = winner.reaction;
    primaryStat = winner.stat;
  }

  return {
    emotion: primaryEmotion,
    secondaryEmotion,
    triggeringStat: primaryStat,
    triggeringSecondaryStat: secondaryStat,
    bodyEffects,
  };
}

// ─── Action Emotion Mapping ───────────────────────────────────────────────────

/**
 * Types of actions that can trigger temporary emotion overrides.
 */
export type ActionType =
  | 'feed'      // Using food items
  | 'play'      // Using toys
  | 'clean'     // Using cleaning items
  | 'medicine'  // Using medicine items
  | 'music'     // Playing music
  | 'sing';     // Singing

/**
 * Mapping of actions to the emotions they trigger.
 * These are temporary emotions that override status reactions while the action is happening.
 */
export const ACTION_EMOTION_MAP: Record<ActionType, BlobbiEmotion> = {
  feed: 'happy',
  play: 'excited',
  clean: 'surprised',
  medicine: 'curious',
  music: 'happy',
  sing: 'excited',
};

/**
 * Get the emotion for a specific action type.
 */
export function getActionEmotion(action: ActionType): BlobbiEmotion {
  return ACTION_EMOTION_MAP[action];
}
