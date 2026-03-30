/**
 * Status-Based Reaction System for Blobbi
 *
 * Resolves current Blobbi stats directly into a final BlobbiVisualRecipe.
 * The resolver owns the full pipeline from stats → recipe, with no
 * intermediate "emotion name" step in the runtime path.
 *
 * Design principles:
 *   - Priority order determines which stat "wins" for face expression
 *   - When multiple stats are low, their recipes are merged internally
 *   - Body effects (dirty) are folded directly into the recipe's bodyEffects
 *   - The output is a single, fully-resolved recipe — no secondary outputs
 *   - Named emotions are only used internally as lookup keys for presets
 *   - Consumers receive one recipe and pass it to applyVisualRecipe()
 *     which handles all rendering including body effects — no separate
 *     body effects channel needed
 */

import type { BlobbiEmotion } from './emotion-types';
import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import { resolveVisualRecipe, mergeVisualRecipes, type BlobbiVisualRecipe } from './recipe';

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
 * Result of resolving the best reaction to show based on current stats.
 *
 * @deprecated Use `resolveStatusRecipe()` instead, which resolves stats
 * directly into a fully-resolved BlobbiVisualRecipe.
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
 * Result of resolving stats into a final visual recipe.
 *
 * The recipe is fully resolved — no further merging is needed by consumers.
 * Body effects from hygiene are folded directly into recipe.bodyEffects.
 * Consumers pass this recipe to applyVisualRecipe() which handles all
 * rendering including body effects. No separate body effects channel is needed.
 *
 * Metadata (triggeringStat, label) is provided for UI display and
 * animation-safety decisions in the hook layer.
 */
export interface StatusRecipeResult {
  /** The fully resolved visual recipe (empty object = neutral) */
  recipe: BlobbiVisualRecipe;
  /** Human-readable label for the resolved state (for CSS classes, debugging) */
  label: string;
  /** The highest-priority stat that contributed to this recipe */
  triggeringStat: ReactiveStat | null;
  /** Severity of the triggering stat */
  severity: StatSeverity | null;
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
 * the face. Dirty body effects (dirt marks, stink clouds) are folded
 * directly into the recipe's bodyEffects by resolveStatusRecipe().
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
 * @deprecated Use `resolveStatusRecipe()` instead.
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
 * Resolve current stats directly into a final visual recipe.
 *
 * This is the single entry point for the stats → recipe pipeline.
 * All recipe merging happens here — consumers receive a final recipe
 * that can be passed straight to applyVisualRecipe().
 *
 * Resolution logic:
 *   1. Analyze all stats, keep those below the normal threshold
 *   2. The highest-priority stat determines the primary emotion preset
 *   3. If energy is low AND another stat also triggers, merge sleepy's
 *      recipe with the other stat's recipe (sleepy parts take precedence)
 *   4. Hygiene triggers dirty body effects folded into the recipe
 *   5. Return the fully-resolved recipe + metadata
 *
 * Example scenarios:
 *   - Only energy low → sleepy recipe
 *   - Only hygiene low → boring recipe + dirty bodyEffects
 *   - Energy + hygiene low → sleepy eyes/mouth merged with boring eyebrows + dirty bodyEffects
 *   - Energy + hunger low → sleepy eyes/mouth merged with hungry eyebrows/extras
 *
 * @param stats - Current Blobbi stats
 * @returns Fully resolved recipe, label, triggering stat, and body effects
 */
export function resolveStatusRecipe(stats: BlobbiStats): StatusRecipeResult {
  const analyses = analyzeAllStats(stats);

  // No stats are low enough to trigger → neutral
  if (analyses.length === 0) {
    return {
      recipe: {},
      label: 'neutral',
      triggeringStat: null,
      severity: null,
    };
  }

  const winner = analyses[0];

  // Check if sleepy needs to be merged with another face emotion
  const sleepyAnalysis = analyses.find(a => a.reaction === 'sleepy');
  const nonSleepyAnalyses = analyses.filter(a => a.reaction !== 'sleepy');

  let recipe: BlobbiVisualRecipe;
  let label: string;

  if (sleepyAnalysis && nonSleepyAnalyses.length > 0) {
    // Both sleepy and another face emotion — merge them.
    // Sleepy recipe takes precedence (it defines eyes + mouth).
    // The secondary fills in parts sleepy doesn't define (eyebrows, extras).
    const sleepyRecipe = resolveVisualRecipe(sleepyAnalysis.reaction);
    const secondaryRecipe = resolveVisualRecipe(nonSleepyAnalyses[0].reaction);
    recipe = mergeVisualRecipes(secondaryRecipe, sleepyRecipe);
    label = `${nonSleepyAnalyses[0].reaction}-${sleepyAnalysis.reaction}`;
  } else {
    // Single winner takes all
    recipe = resolveVisualRecipe(winner.reaction);
    label = winner.reaction;
  }

  // Hygiene triggers dirty body effects — fold directly into the recipe.
  // This is the only place dirty body effects are added. Consumers receive
  // a single recipe that applyVisualRecipe() renders in full.
  const hygieneAnalysis = analyses.find(a => a.stat === 'hygiene');
  if (hygieneAnalysis) {
    recipe = {
      ...recipe,
      bodyEffects: {
        ...recipe.bodyEffects,
        dirtMarks: { enabled: true, count: 3 },
        stinkClouds: { enabled: true, count: 3 },
      },
    };
  }

  return {
    recipe,
    label,
    triggeringStat: winner.stat,
    severity: winner.severity,
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
