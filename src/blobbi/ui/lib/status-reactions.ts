/**
 * Status-Based Reaction System for Blobbi
 * 
 * Automatically determines which emotion Blobbi should display based on current stats.
 * Uses a priority-based system with severity levels and probabilistic selection.
 * 
 * Design principles:
 * - Priority order determines which stat "wins" when multiple are low
 * - Severity levels affect how often reactions appear
 * - Probabilistic triggering prevents constant flickering
 * - Extensible for future reactions and stat mappings
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
 * Result of resolving emotions with base + overlay separation.
 */
export interface StatusEmotionResult {
  /** The base/persistent emotion (null = neutral/default) */
  baseEmotion: BlobbiEmotion | null;
  /** The overlay emotion (null = none) */
  overlayEmotion: BlobbiEmotion | null;
  /** The stat that triggered the base emotion */
  triggeringBaseStat: ReactiveStat | null;
  /** The stat that triggered the overlay emotion */
  triggeringOverlayStat: ReactiveStat | null;
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
 * - boring: low-energy, unamused state (generic "not feeling good" face)
 * - dizzy: critical health state only
 * - hungry: hunger-specific face with drool and food icon
 * - sleepy: energy overlay (preserves base face)
 * - sad: reserved for dramatic emotional distress (not used by stats currently)
 * 
 * NOTE: "dirty" is no longer a face emotion. Hygiene maps to 'boring' for
 * the face, and dirty body effects (dirt marks, stink clouds) are applied
 * as a separate body decorator layer via resolveStatusEmotions().bodyEffects.
 */
export const STAT_REACTION_CONFIGS: StatReactionConfig[] = [
  {
    stat: 'energy',
    priority: 1,
    normalReaction: 'sleepy',
    // Energy doesn't have a distinct critical reaction
    // sleepy is now an OVERLAY that preserves the base face
  },
  {
    stat: 'health',
    priority: 2,
    normalReaction: 'boring', // Non-critical health shows boring (not feeling good)
    criticalReaction: 'dizzy', // Critical health shows dizzy (seriously unwell)
  },
  {
    stat: 'hunger',
    priority: 3,
    normalReaction: 'hungry', // Hungry emotion already has appropriate visuals
  },
  {
    stat: 'hygiene',
    priority: 4,
    normalReaction: 'boring', // Low hygiene shows boring face + dirty body effects
  },
  {
    stat: 'happiness',
    priority: 5,
    normalReaction: 'boring', // Low happiness shows boring (low energy, unamused)
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
 * Uses priority-based selection with probabilistic triggering.
 * 
 * @deprecated Use `resolveStatusEmotions()` instead, which properly separates
 * base and overlay emotions. This function flattens everything into a single
 * emotion and is kept only for legacy compatibility.
 * 
 * @param stats - Current Blobbi stats
 * @param forceCheck - If true, bypasses probability check (useful for initial state)
 * @param timing - Timing configuration
 * @returns The reaction result with emotion, trigger decision, and cooldown
 */
export function resolveStatusReaction(
  stats: BlobbiStats,
  forceCheck = false,
  timing: StatusReactionTiming = DEFAULT_TIMING
): StatusReactionResult {
  const analyses = analyzeAllStats(stats);
  
  // No stats are low enough to trigger
  if (analyses.length === 0) {
    return {
      emotion: null,
      triggeringStat: null,
      severity: null,
      shouldTrigger: false,
      cooldownMs: timing.checkInterval,
    };
  }
  
  // Get highest priority (first in sorted list)
  const winner = analyses[0];
  
  // Probabilistic trigger check
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
 * Useful for determining if a reaction should be overridden.
 */
export function isStatusReaction(emotion: BlobbiEmotion): boolean {
  const statusEmotions: BlobbiEmotion[] = ['sleepy', 'hungry', 'boring', 'dizzy'];
  return statusEmotions.includes(emotion);
}

/**
 * Get the default/neutral emotion when no status reactions are active.
 */
export function getDefaultEmotion(): BlobbiEmotion {
  return 'neutral'; // Base happy expression
}

/**
 * Resolve status emotions with base + overlay separation.
 * 
 * This is the recommended way to resolve emotions from stats.
 * It properly separates:
 * - BASE emotions (persistent face: boring, dizzy, hungry)
 * - OVERLAY emotions (temporary animations: sleepy)
 * - BODY EFFECTS (decorators: dirt marks, stink clouds)
 * 
 * Body effects are independent of face emotions:
 * - Low hygiene adds dirty body effects AND a boring face
 * - The dirty effects stack with whatever face state wins
 * 
 * Example:
 * - If energy is low AND hygiene is low:
 *   - Base: boring (from hygiene, unless a higher-priority stat wins)
 *   - Overlay: sleepy (from energy)
 *   - Body: dirty marks + stink clouds (from hygiene)
 *   - Result: Boring face + sleepy animation + dirt/stink effects
 * 
 * @param stats - Current Blobbi stats
 * @returns Base emotion, optional overlay emotion, and body effects
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
      baseEmotion: null,
      overlayEmotion: null,
      triggeringBaseStat: null,
      triggeringOverlayStat: null,
      bodyEffects: null,
    };
  }
  
  // Separate overlay emotions (sleepy) from base emotions
  const sleepyAnalysis = analyses.find(a => a.reaction === 'sleepy');
  const baseAnalyses = analyses.filter(a => a.reaction !== 'sleepy');
  
  // Get the highest priority base emotion (if any)
  const baseWinner = baseAnalyses.length > 0 ? baseAnalyses[0] : null;
  
  return {
    baseEmotion: baseWinner?.reaction ?? null,
    overlayEmotion: sleepyAnalysis?.reaction ?? null,
    triggeringBaseStat: baseWinner?.stat ?? null,
    triggeringOverlayStat: sleepyAnalysis?.stat ?? null,
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
  feed: 'happy',        // Happy while eating
  play: 'excited',      // Excited while playing
  clean: 'surprised',   // Surprised reaction to cleaning
  medicine: 'curious',  // Curious about medicine
  music: 'happy',       // Happy while listening to music
  sing: 'excited',      // Excited while singing
};

/**
 * Get the emotion for a specific action type.
 */
export function getActionEmotion(action: ActionType): BlobbiEmotion {
  return ACTION_EMOTION_MAP[action];
}
