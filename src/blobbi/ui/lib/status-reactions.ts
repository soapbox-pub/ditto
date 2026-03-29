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
 */
export const STAT_REACTION_CONFIGS: StatReactionConfig[] = [
  {
    stat: 'energy',
    priority: 1,
    normalReaction: 'sleepy',
    // Energy doesn't have a distinct critical reaction
  },
  {
    stat: 'health',
    priority: 2,
    normalReaction: 'sad',
    criticalReaction: 'dizzy', // Critical health shows dizzy instead of sad
  },
  {
    stat: 'hunger',
    priority: 3,
    normalReaction: 'hungry',
  },
  {
    stat: 'hygiene',
    priority: 4,
    normalReaction: 'sad',
  },
  {
    stat: 'happiness',
    priority: 5,
    normalReaction: 'sad',
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
  const statusEmotions: BlobbiEmotion[] = ['sleepy', 'hungry', 'sad', 'dizzy'];
  return statusEmotions.includes(emotion);
}

/**
 * Get the default/neutral emotion when no status reactions are active.
 */
export function getDefaultEmotion(): BlobbiEmotion {
  return 'neutral'; // Base happy expression
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
