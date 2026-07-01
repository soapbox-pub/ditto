/**
 * Social Projection — apply kind 1124 interactions to projected Blobbi stats.
 *
 * Pure function pipeline: takes already-decayed stats and a sorted list of
 * parsed interactions, returns socially-adjusted stats for display.
 *
 * This module is read-only projection. It never mutates kind 31124 state,
 * never advances checkpoints, and never publishes events.
 *
 * Processing rules:
 *   - Interactions are processed in ascending `created_at` order (caller
 *     must provide them pre-sorted via `sortInteractionEvents`).
 *   - Duplicate event IDs are skipped.
 *   - When an interaction carries an `itemId` and the caller supplies a
 *     `resolveCareItemEffect` resolver that returns an effect, that
 *     item-specific effect is applied. Otherwise a small fallback effect per
 *     action is used.
 *   - All stats are clamped to [STAT_MIN, STAT_MAX] after each interaction.
 *
 * The care-item effect table itself is NOT owned by this module: the host
 * application injects a `resolveCareItemEffect` resolver so @blobbi/core stays
 * decoupled from any specific item catalog.
 *
 * @module blobbi-social-projection
 */

import type { BlobbiStats } from './blobbi';
import { STAT_MIN, STAT_MAX } from './blobbi';
import type { BlobbiInteraction, InteractionAction, SocialCheckpoint } from './blobbi-interaction';
import type { ItemEffect } from '@blobbi/core/types/shop';

/**
 * Stat deltas a care item applies to a Blobbi when used in an interaction.
 *
 * Semantic alias for the underlying effect shape. The core thinks in terms of
 * "care item effects", not shop/purchase concepts — the host maps its own
 * catalog to this shape via `resolveCareItemEffect`.
 */
export type CareItemEffect = ItemEffect;

/**
 * Resolves an interaction's `itemId` to its care-item effect.
 *
 * Injected by the host so @blobbi/core never imports a concrete item catalog.
 * Returns `undefined` when the id is unknown, in which case the fallback
 * per-action effect is used.
 */
export type CareItemEffectResolver = (itemId: string) => CareItemEffect | undefined;

// ─── Fallback Effects ─────────────────────────────────────────────────────────

/**
 * Default stat deltas applied when an interaction has no `itemId`, no resolver
 * was provided, or the resolver did not recognise the item. Intentionally
 * conservative — item-based interactions should always be preferred.
 */
const FALLBACK_EFFECTS: Record<InteractionAction, CareItemEffect> = {
  feed:     { hunger: 10 },
  play:     { happiness: 10, energy: -5 },
  clean:    { hygiene: 15 },
  medicate: { health: 10 },
  boost:    { energy: 15 },
};

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Apply a list of kind 1124 interactions to already-decayed stats.
 *
 * This is the **read-only projection** path. It always processes all
 * interactions unconditionally (no need-driven filtering) so the UI
 * reflects the full social contribution.
 *
 * @param baseStats    - Full stats after decay projection (all 5 fields required).
 * @param interactions - Parsed interactions, **must be sorted ascending** by
 *                       `created_at` with id tie-break (as returned by
 *                       `sortInteractionEvents` → `parseInteractionEvent`).
 * @param checkpoint   - Optional social checkpoint from the 31124 content.
 *                       When present, the event identified by
 *                       `checkpoint.last_event_id` is skipped (it was already
 *                       consolidated into the canonical stats). This handles
 *                       the Nostr `since` inclusive boundary.
 *                       When absent (no prior consolidation), all interactions
 *                       in the array are processed.
 * @param resolveCareItemEffect - Optional resolver mapping an interaction's
 *                       `itemId` to its care-item effect. Injected by the host
 *                       so this module stays decoupled from any item catalog.
 *                       When omitted (or when it returns `undefined`), the
 *                       fallback per-action effect is used.
 * @returns A new `BlobbiStats` object with social effects applied.
 */
export function applySocialInteractions(
  baseStats: BlobbiStats,
  interactions: readonly BlobbiInteraction[],
  checkpoint?: SocialCheckpoint,
  resolveCareItemEffect?: CareItemEffectResolver,
): BlobbiStats {
  return consolidateSocialInteractions(baseStats, interactions, checkpoint, resolveCareItemEffect).stats;
}

// ─── Consolidation ────────────────────────────────────────────────────────────

/**
 * Result of consolidating social interactions into canonical stats.
 */
export interface ConsolidationResult {
  /** New stats after applying all valid interactions */
  stats: BlobbiStats;
  /** Number of interactions that were actually applied (after dedup) */
  consumedCount: number;
  /** The last interaction that was actually applied, or `undefined` if none were consumed */
  lastConsumed: BlobbiInteraction | undefined;
}

/**
 * Consolidate social interactions into canonical stats, tracking which
 * interactions were actually consumed.
 *
 * Uses the **exact same rules** as `applySocialInteractions` (same dedup,
 * same item resolution, same effect application, same clamping) but also
 * returns metadata about what was consumed so the caller can advance the
 * checkpoint accurately.
 *
 * @param baseStats    - Full stats after decay (all 5 fields required).
 * @param interactions - Parsed interactions, **must be sorted ascending**.
 * @param checkpoint   - Optional existing checkpoint for dedup seeding.
 * @param resolveCareItemEffect - Optional resolver mapping an interaction's
 *                       `itemId` to its care-item effect (see
 *                       `applySocialInteractions`). Omitting it falls back to
 *                       per-action defaults.
 * @returns Consolidation result with new stats and consumed interaction info.
 */
export function consolidateSocialInteractions(
  baseStats: BlobbiStats,
  interactions: readonly BlobbiInteraction[],
  checkpoint?: SocialCheckpoint,
  resolveCareItemEffect?: CareItemEffectResolver,
): ConsolidationResult {
  if (interactions.length === 0) {
    return { stats: baseStats, consumedCount: 0, lastConsumed: undefined };
  }

  // Mutable working copy
  const stats: BlobbiStats = { ...baseStats };

  // Dedup set — general relay-duplicate safety net (same role as in
  // applySocialInteractions). Boundary event is already filtered upstream.
  const seen = new Set<string>();
  if (checkpoint) {
    seen.add(checkpoint.last_event_id);
  }

  let consumedCount = 0;
  let lastConsumed: BlobbiInteraction | undefined;

  for (const ix of interactions) {
    // ── Dedup (also handles checkpoint boundary) ──
    if (seen.has(ix.event.id)) continue;
    seen.add(ix.event.id);

    // ── Resolve effect ──
    const effect = resolveEffect(ix, resolveCareItemEffect);

    // ── Apply ──
    applyEffect(stats, effect);

    consumedCount++;
    lastConsumed = ix;
  }

  return { stats, consumedCount, lastConsumed };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the stat effect for a single interaction.
 *
 * Priority:
 *   1. Injected care-item effect (when `itemId` is present and the resolver
 *      returns an effect)
 *   2. Fallback per-action effect
 */
function resolveEffect(
  ix: BlobbiInteraction,
  resolveCareItemEffect?: CareItemEffectResolver,
): CareItemEffect {
  if (ix.itemId && resolveCareItemEffect) {
    const effect = resolveCareItemEffect(ix.itemId);
    if (effect) return effect;
  }
  return FALLBACK_EFFECTS[ix.action];
}

/** Apply a `CareItemEffect` to mutable stats, clamping each field. */
function applyEffect(stats: BlobbiStats, effect: CareItemEffect): void {
  if (effect.hunger !== undefined) {
    stats.hunger = clamp(stats.hunger + effect.hunger);
  }
  if (effect.happiness !== undefined) {
    stats.happiness = clamp(stats.happiness + effect.happiness);
  }
  if (effect.health !== undefined) {
    stats.health = clamp(stats.health + effect.health);
  }
  if (effect.hygiene !== undefined) {
    stats.hygiene = clamp(stats.hygiene + effect.hygiene);
  }
  if (effect.energy !== undefined) {
    stats.energy = clamp(stats.energy + effect.energy);
  }
}

function clamp(value: number): number {
  return Math.max(STAT_MIN, Math.min(STAT_MAX, value));
}
