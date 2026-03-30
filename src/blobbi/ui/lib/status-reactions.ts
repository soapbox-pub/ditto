/**
 * Status-Based Reaction System for Blobbi — Part-Priority Architecture
 *
 * Resolves current Blobbi stats directly into a final BlobbiVisualRecipe
 * by picking each facial/body part independently based on priority rules.
 *
 * Instead of selecting a single "winning" emotion preset and applying it
 * wholesale, the resolver asks five independent questions:
 *
 *   1. Which stat should own the **eyes** right now?
 *   2. Which stat should own the **mouth**?
 *   3. Which stat should own the **eyebrows**?
 *   4. Which stats contribute **extras** (drool, tears, Zzz)?
 *   5. Which stats contribute **bodyEffects** (dirt, stink, anger)?
 *
 * Each part has its own priority order. Low stats contribute their parts
 * according to these priorities, and the final recipe is composed by
 * picking the highest-priority contributor for each slot. Extras and
 * bodyEffects are additive — multiple stats can contribute simultaneously.
 *
 * This produces natural, layered expressions when multiple stats are low.
 * Named emotion presets (EMOTION_RECIPES) are still used as the source of
 * part definitions — the part-priority system just picks *which* preset
 * contributes each part, rather than using one preset for everything.
 *
 * Consumers receive one final BlobbiVisualRecipe and pass it to
 * applyVisualRecipe(). No separate body effects channel is needed.
 */

import type { BlobbiStats } from '@/blobbi/core/types/blobbi';
import type { BlobbiEmotion } from './emotion-types';
import type {
  BlobbiVisualRecipe,
  EyeRecipe,
  MouthRecipe,
  EyebrowRecipe,
  BodyEffectsRecipe,
  ExtrasRecipe,
} from './recipe';

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
 * Configuration for how a stat maps to reactions (legacy).
 * Kept for backward compatibility with analyzeAllStats/analyzeStat.
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
 * Body effects are folded directly into recipe.bodyEffects.
 * Consumers pass this recipe to applyVisualRecipe() which handles all
 * rendering. No separate body effects channel is needed.
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
 * Stat reaction configurations (legacy format, kept for backward compat).
 * Used by analyzeAllStats/analyzeStat.
 */
export const STAT_REACTION_CONFIGS: StatReactionConfig[] = [
  { stat: 'energy', priority: 1, normalReaction: 'sleepy' },
  { stat: 'health', priority: 2, normalReaction: 'boring', criticalReaction: 'dizzy' },
  { stat: 'hunger', priority: 3, normalReaction: 'hungry' },
  { stat: 'hygiene', priority: 4, normalReaction: 'boring' },
  { stat: 'happiness', priority: 5, normalReaction: 'boring' },
];

/**
 * Default timing configuration.
 */
export const DEFAULT_TIMING: StatusReactionTiming = {
  checkInterval: 5000,
  reactionDuration: 4000,
  baseCooldown: 8000,
  cooldownMultipliers: {
    normal: 2.0,
    warning: 1.5,
    high: 1.0,
    critical: 0.5,
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
    if (analysis.severity !== 'normal') {
      analyses.push(analysis);
    }
  }

  return analyses.sort((a, b) => a.priority - b.priority);
}

/**
 * Resolve the best reaction to show based on current stats.
 *
 * @deprecated Use `resolveStatusRecipe()` instead.
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part-Priority Resolution System
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * What a single low stat contributes to each recipe part.
 *
 * Each stat defines its contributions per severity tier. The resolver
 * iterates over low stats and uses the part-priority rules below to
 * decide which stat's contribution wins for each slot. Extras and
 * bodyEffects are additive (all contributors are merged).
 */
interface StatPartContributions {
  eyes?: EyeRecipe;
  mouth?: MouthRecipe;
  eyebrows?: EyebrowRecipe;
  extras?: ExtrasRecipe;
  bodyEffects?: BodyEffectsRecipe;
}

/**
 * Maps a stat + severity to the parts it contributes.
 *
 * Returns undefined if the stat at this severity contributes nothing
 * (i.e. the stat is normal or doesn't affect that severity tier).
 */
type PartContributionResolver = (severity: StatSeverity) => StatPartContributions | undefined;

// ─── Per-Stat Part Definitions ────────────────────────────────────────────────
//
// Each stat defines what it contributes to each facial/body area at each
// severity level. Parts left undefined are simply not contributed — another
// stat can fill them in.
//
// Design philosophy:
//   - Each stat has a distinct "personality" in how it affects the face
//   - Hunger = pleading, needy, hopeful (not just sad)
//   - Energy = drowsy, fading, relaxed tiredness
//   - Health = weak, unwell (mild) → disoriented (critical)
//   - Hygiene = uncomfortable, irritated, "I feel gross"
//   - Happiness = genuine emotional sadness, building to tears

/**
 * Energy severity escalation:
 *   warning  → sleepy (gentle blinks, soft breathing)
 *   high     → heavier sleepy (heavier-lidded blinks)
 *   critical → very drowsy (eyes barely open, struggling to stay awake)
 *
 * Lower cycleDuration = more time with eyes closed per cycle = drowsier feel.
 */
const ENERGY_PARTS: PartContributionResolver = (severity) => {
  if (severity === 'normal') return undefined;

  // Sleepiness is a relaxed, fading state — not distressed.
  // Lower cycle duration = more closed time = heavier eyelids.
  const cycleDuration = severity === 'critical' ? 5 : severity === 'high' ? 6 : 8;

  return {
    // Sleepy blink — heavy-lidded, drowsy closing eyes
    // Slower cycles = heavier eyelids, more tired
    eyes: { sleepyBlink: { cycleDuration } },
    // Sleepy breathing mouth — soft, relaxed
    mouth: { sleepyMouth: true },
    // Low energy doesn't own eyebrows — it's a relaxed state.
    // Other stats (hunger, sadness) can add their worried brows on top.
    eyebrows: undefined,
  };
};

/**
 * Health severity escalation:
 *   warning  → weak (mild discomfort, no eye claim)
 *   high     → sick (more unwell, weak brows/mouth, still no eye dominance)
 *   critical → dizzy (disoriented, dizzy spirals DOMINATE eyes)
 *
 * IMPORTANT: Only critical health claims eyes. This lets sadness/hunger
 * show their watery eyes when health is merely warning/high.
 */
const HEALTH_PARTS: PartContributionResolver = (severity) => {
  if (severity === 'normal') return undefined;

  if (severity === 'critical') {
    // Critical health → severely unwell, disoriented
    // Dizzy spirals DOMINATE eyes — this is urgent
    return {
      eyes: { dizzySpirals: { rotationDuration: 2 } },
      mouth: { roundMouth: { rx: 4, ry: 5, filled: true } },
      eyebrows: {
        // Raised/worried (distress)
        config: { angle: -14, offsetY: -11, strokeWidth: 1.4, color: '#6b7280', curve: 0.2 },
      },
    };
  }

  // Warning / high → weak, unwell (distinct from sadness)
  // Does NOT claim eyes — other stats (sadness, hunger) can show their eyes
  return {
    // NO eye claim at warning/high — let other stats express through eyes
    eyes: undefined,
    // Weak, slight frown
    mouth: { sadMouth: true },
    // Lowered, weak brows — not intensely worried, just weak
    eyebrows: {
      config: {
        angle: severity === 'high' ? -10 : -6,
        offsetY: -9,
        strokeWidth: 1.2,
        color: '#9ca3af',
      },
    },
  };
};

/**
 * Hunger severity escalation:
 *   warning  → hopeful/asking (bright eyes, small anticipating mouth)
 *   high     → needy (bigger pleading eyes, more open mouth, worried brows)
 *   critical → weak/desperate (droopy desperate mouth, very worried brows)
 *
 * The progression goes from "ooh, food?" to "please..." to "I'm so hungry..."
 */
const HUNGER_PARTS: PartContributionResolver = (severity) => {
  if (severity === 'normal') return undefined;

  // Shiny, hopeful eyes at all levels (glistening but not sad-watery)
  const eyes: EyeRecipe = { wateryEyes: { includeWaterFill: false } };

  // Mouth changes with severity:
  //   warning  → small round "ooh" (hopeful anticipation)
  //   high     → bigger round (more eager/needy)
  //   critical → droopy/pleading (weak, desperate)
  let mouth: MouthRecipe;
  if (severity === 'critical') {
    // Desperate — droopy, weak, pleading
    mouth = { droopyMouth: { widthScale: 0.85, curveScale: 0.5 } };
  } else if (severity === 'high') {
    // Needy — bigger anticipating mouth
    mouth = { roundMouth: { rx: 3.5, ry: 4.5, filled: true } };
  } else {
    // Warning — hopeful, small "ooh"
    mouth = { roundMouth: { rx: 2.5, ry: 3, filled: true } };
  }

  // Eyebrows escalate from hopeful to worried to desperate
  const eyebrowAngle = severity === 'critical' ? -16 : severity === 'high' ? -14 : -10;
  const eyebrowCurve = severity === 'critical' ? 0.2 : severity === 'high' ? 0.15 : 0.1;

  return {
    eyes,
    mouth,
    eyebrows: {
      config: {
        angle: eyebrowAngle,
        offsetY: -10,
        strokeWidth: 1.3,
        color: '#6b7280',
        curve: eyebrowCurve,
      },
    },
    // Drool + food icon — hunger's signature extras.
    // Drool is semantically hunger-driven (salivating for food) and is
    // intentionally not contributed by other stats. The drool anchor system
    // in recipe.ts handles positioning based on the final mouth shape.
    extras: {
      drool: { enabled: true, side: 'right' as const },
      foodIcon: { enabled: true, type: 'utensils' as const },
    },
  };
};

/**
 * Hygiene severity escalation:
 *   warning  → uncomfortable (mild grimace, few dirt marks)
 *   high     → gross (more grimace, more dirt/stink)
 *   critical → very gross (strong grimace, lots of dirt/stink)
 *
 * Hygiene doesn't claim eyes — it's physical discomfort, not emotional.
 */
const HYGIENE_PARTS: PartContributionResolver = (severity) => {
  if (severity === 'normal') return undefined;

  // Mouth grimace escalates with severity
  const widthScale = severity === 'critical' ? 0.75 : severity === 'high' ? 0.8 : 0.85;
  const curveScale = severity === 'critical' ? 0.15 : severity === 'high' ? 0.2 : 0.3;

  // Furrowed brows escalate
  const browAngle = severity === 'critical' ? 12 : severity === 'high' ? 10 : 6;

  return {
    // Hygiene doesn't claim eyes — discomfort shows in brows/mouth
    eyes: undefined,
    // Grimace / uncomfortable flat mouth (distinct from sad frown)
    mouth: { droopyMouth: { widthScale, curveScale } },
    // Furrowed brows — annoyance/discomfort
    eyebrows: {
      config: {
        angle: browAngle,
        offsetY: -9,
        strokeWidth: 1.3,
        color: '#6b7280',
      },
    },
    // Dirty body effects — the main visual signal for low hygiene
    bodyEffects: {
      dirtMarks: {
        enabled: true,
        count: severity === 'critical' ? 5 : severity === 'high' ? 4 : 3,
      },
      stinkClouds: {
        enabled: true,
        count: severity === 'critical' ? 4 : severity === 'high' ? 3 : 2,
      },
    },
  };
};

/**
 * Happiness (sadness when low) severity escalation:
 *   warning  → down (glistening eyes, mild frown, no tears)
 *   high     → sad (wetter eyes, deeper frown, alternating tears)
 *   critical → crying (full watery eyes, deep frown, both eyes tears)
 *
 * Sadness is emotional — distinct from hunger (hopeful) and health (weak).
 */
const HAPPINESS_PARTS: PartContributionResolver = (severity) => {
  if (severity === 'normal') return undefined;

  // Eyes get progressively wetter
  const includeWaterFill = severity === 'critical';

  // Eyebrow angle deepens with sadness
  const browAngle = severity === 'critical' ? -18 : severity === 'high' ? -15 : -10;
  const browCurve = severity === 'critical' ? 0.2 : severity === 'high' ? 0.18 : 0.12;

  // Tears only at high/critical
  let extras: ExtrasRecipe | undefined;
  if (severity === 'critical') {
    extras = {
      tears: { enabled: true, eye: 'both', duration: 4, pauseBetween: 1 },
    };
  } else if (severity === 'high') {
    extras = {
      tears: { enabled: true, eye: 'alternating', duration: 6, pauseBetween: 3 },
    };
  }

  return {
    eyes: { wateryEyes: { includeWaterFill } },
    mouth: { sadMouth: true },
    eyebrows: {
      config: {
        angle: browAngle,
        offsetY: -10,
        strokeWidth: 1.4,
        color: '#4b5563',
        curve: browCurve,
      },
    },
    extras,
  };
};

/**
 * Registry mapping each reactive stat to its part contribution resolver.
 */
const STAT_PART_RESOLVERS: Record<ReactiveStat, PartContributionResolver> = {
  energy: ENERGY_PARTS,
  health: HEALTH_PARTS,
  hunger: HUNGER_PARTS,
  hygiene: HYGIENE_PARTS,
  happiness: HAPPINESS_PARTS,
};

// ─── Part Priority Rules ──────────────────────────────────────────────────────
//
// For exclusive parts (eyes, mouth, eyebrows), the stat that appears first
// in the priority list wins that slot. Lower index = higher priority.
//
// The priority order can differ per part — e.g. energy dominates eyes
// (sleepy blink) but hunger dominates mouth (droopy + drool).

/**
 * Eyes priority: which stat's eye contribution wins when multiple are low.
 *
 * 1. health (critical only → dizzy spirals, highest urgency)
 * 2. energy (sleepy blink)
 * 3. happiness (watery/sad eyes)
 * 4. hunger (watery eyes, lower priority than sadness)
 * 5. hygiene (no strong eye contribution)
 */
const EYES_PRIORITY: ReactiveStat[] = ['health', 'energy', 'happiness', 'hunger', 'hygiene'];

/**
 * Mouth priority: which stat's mouth contribution wins.
 *
 * 1. energy (sleepy breathing mouth)
 * 2. health (sad mouth, or round mouth if critical)
 * 3. happiness (sad mouth)
 * 4. hunger (round mouth at warning/high, droopy at critical)
 * 5. hygiene (grimace/droopy)
 *
 * **Exception:** Critical health overrides this priority list entirely.
 * When health is critical, the dizzy round mouth always wins regardless
 * of energy. This ensures "sick/urgent" reads over "sleepy" in severe states.
 * See the mouth resolution logic in resolveStatusRecipe() for details.
 */
const MOUTH_PRIORITY: ReactiveStat[] = ['energy', 'health', 'happiness', 'hunger', 'hygiene'];

/**
 * Eyebrows priority: which stat's eyebrow contribution wins.
 *
 * 1. health (worried / intense at critical)
 * 2. hunger (worried / pleading)
 * 3. happiness (sad / lowered)
 * 4. hygiene (flat / bored)
 * 5. energy (no strong eyebrow opinion — sleepy doesn't define eyebrows)
 */
const EYEBROW_PRIORITY: ReactiveStat[] = ['health', 'hunger', 'happiness', 'hygiene', 'energy'];

// ─── Part-Priority Composer ───────────────────────────────────────────────────

/**
 * Given a map of stat → contributions (from all low stats), pick the
 * highest-priority contributor for an exclusive part.
 */
function pickPart<K extends keyof StatPartContributions>(
  contributions: Map<ReactiveStat, StatPartContributions>,
  priorityOrder: ReactiveStat[],
  part: K,
): StatPartContributions[K] | undefined {
  for (const stat of priorityOrder) {
    const c = contributions.get(stat);
    if (c && c[part] !== undefined) {
      return c[part];
    }
  }
  return undefined;
}

/**
 * Merge all extras from every contributing stat additively.
 * Multiple stats can contribute drool, tears, food icons, etc. simultaneously.
 */
function mergeAllExtras(
  contributions: Map<ReactiveStat, StatPartContributions>,
): ExtrasRecipe | undefined {
  let merged: ExtrasRecipe | undefined;

  for (const c of contributions.values()) {
    if (c.extras) {
      merged = merged ? { ...merged, ...c.extras } : { ...c.extras };
    }
  }

  return merged;
}

/**
 * Merge all body effects from every contributing stat additively.
 * Dirt marks + stink clouds can coexist with anger-rise, etc.
 */
function mergeAllBodyEffects(
  contributions: Map<ReactiveStat, StatPartContributions>,
): BodyEffectsRecipe | undefined {
  let merged: BodyEffectsRecipe | undefined;

  for (const c of contributions.values()) {
    if (c.bodyEffects) {
      merged = merged ? { ...merged, ...c.bodyEffects } : { ...c.bodyEffects };
    }
  }

  return merged;
}

/**
 * Build a human-readable label from the set of contributing stats.
 * For single stats it's just the stat name. For multiple, they're joined
 * in priority order (energy > health > hunger > hygiene > happiness).
 */
function buildLabel(lowStats: Map<ReactiveStat, StatSeverity>): string {
  const LABEL_ORDER: ReactiveStat[] = ['energy', 'health', 'hunger', 'hygiene', 'happiness'];
  const parts: string[] = [];
  for (const stat of LABEL_ORDER) {
    const sev = lowStats.get(stat);
    if (sev) {
      parts.push(STAT_LABEL_MAP[stat]);
    }
  }
  return parts.length > 0 ? parts.join('-') : 'neutral';
}

/** Stat → short label for recipe label composition */
const STAT_LABEL_MAP: Record<ReactiveStat, string> = {
  energy: 'sleepy',
  health: 'sick',
  hunger: 'hungry',
  hygiene: 'dirty',
  happiness: 'sad',
};

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve current stats into a final visual recipe using part-priority
 * composition.
 *
 * This is the single entry point for the stats → recipe pipeline.
 * Consumers receive one fully-resolved recipe to pass to applyVisualRecipe().
 *
 * Algorithm:
 *   1. For each stat, compute severity. Skip stats at 'normal'.
 *   2. For each low stat, resolve its part contributions via STAT_PART_RESOLVERS.
 *   3. For exclusive parts (eyes, mouth, eyebrows), pick the highest-priority
 *      contributor using the per-part priority lists.
 *   4. For additive parts (extras, bodyEffects), merge all contributors.
 *   5. Assemble the final recipe + metadata.
 *
 * Example compositions:
 *   - hunger only → hopeful watery eyes, round "ooh" mouth, pleading brows,
 *     drool + food icon extras
 *   - hunger + hygiene → hungry eyes, hungry mouth (hunger > hygiene),
 *     hungry brows (hunger > hygiene), drool + food, dirt + stink
 *   - energy + hunger → sleepy eyes, sleepy mouth, hungry brows,
 *     drool + food icon extras (additive)
 *   - health(critical) + anything → dizzy eyes dominate, sleepy mouth if
 *     energy also low, health brows, whatever extras each stat contributes
 *   - all stats low → eyes from highest-priority contributor,
 *     additive extras (drool + tears), dirt + stink bodyEffects
 */
export function resolveStatusRecipe(stats: BlobbiStats): StatusRecipeResult {
  // 1. Compute severity for each stat
  const lowStats = new Map<ReactiveStat, StatSeverity>();
  const contributions = new Map<ReactiveStat, StatPartContributions>();

  for (const config of STAT_REACTION_CONFIGS) {
    const severity = getSeverity(stats[config.stat]);
    if (severity === 'normal') continue;

    lowStats.set(config.stat, severity);

    // 2. Resolve part contributions for this stat at this severity
    const resolver = STAT_PART_RESOLVERS[config.stat];
    const parts = resolver(severity);
    if (parts) {
      contributions.set(config.stat, parts);
    }
  }

  // No low stats → neutral
  if (lowStats.size === 0) {
    return {
      recipe: {},
      label: 'neutral',
      triggeringStat: null,
      severity: null,
    };
  }

  // 3. Pick exclusive parts by priority
  const eyes = pickPart(contributions, EYES_PRIORITY, 'eyes');

  // Mouth has a special rule: critical health overrides normal priority.
  // When Blobbi is severely unwell (dizzy), the face should read "urgent/sick"
  // not "sleepy", even if energy is also low. This ensures the dizzy round
  // mouth appears in severe multi-stat scenarios like "health critical + tired".
  let mouth: MouthRecipe | undefined;
  const healthSeverity = lowStats.get('health');
  if (healthSeverity === 'critical' && contributions.get('health')?.mouth) {
    mouth = contributions.get('health')!.mouth;
  } else {
    mouth = pickPart(contributions, MOUTH_PRIORITY, 'mouth');
  }

  const eyebrows = pickPart(contributions, EYEBROW_PRIORITY, 'eyebrows');

  // 4. Merge additive parts from all contributors
  const extras = mergeAllExtras(contributions);
  const bodyEffects = mergeAllBodyEffects(contributions);

  // 5. Assemble
  const recipe: BlobbiVisualRecipe = {};
  if (eyes) recipe.eyes = eyes;
  if (mouth) recipe.mouth = mouth;
  if (eyebrows) recipe.eyebrows = eyebrows;
  if (extras) recipe.extras = extras;
  if (bodyEffects) recipe.bodyEffects = bodyEffects;

  const label = buildLabel(lowStats);

  // Triggering stat = highest-priority low stat (first in STAT_REACTION_CONFIGS order)
  let triggeringStat: ReactiveStat | null = null;
  let triggeringSeverity: StatSeverity | null = null;
  for (const config of STAT_REACTION_CONFIGS) {
    const sev = lowStats.get(config.stat);
    if (sev) {
      triggeringStat = config.stat;
      triggeringSeverity = sev;
      break;
    }
  }

  return {
    recipe,
    label,
    triggeringStat,
    severity: triggeringSeverity,
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
