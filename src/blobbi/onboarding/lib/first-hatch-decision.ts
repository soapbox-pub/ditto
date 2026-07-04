/**
 * First-hatch / onboarding decision logic.
 *
 * Ditto must never create or hatch a second "first" Blobbi when the user
 * already owns a valid one. Ownership is derived from the authored kind 31124
 * Blobbi state collection (the single source of truth), NOT from the kind 11125
 * Blobbonaut profile.
 *
 * This matters because Blobbi Island can create a user's first Blobbi directly:
 * it publishes a final kind 31124 state at stage=baby (no prior egg event), an
 * empty 31124 content body, and no Ditto-specific hatch/mission JSON. Such a
 * Blobbi is still a fully valid, owned Blobbi and must suppress Ditto's
 * first-hatch flow.
 *
 * The `companions` passed here are already validated + parsed by
 * `useBlobbisCollection` (via `isValidBlobbiEvent` / `parseBlobbiEvent`), so any
 * entry present is a valid Blobbi state event with a valid `d` tag and a
 * `stage` of egg, baby, or adult. We therefore only need to inspect stages —
 * we deliberately do NOT require Ditto-specific content JSON, mission/streak
 * seed data, a prior egg event, or profile `has[]`/`current_companion`.
 */

import type { BlobbiCompanion } from '@blobbi-kit/core/blobbi';

/** A stage that counts as "the user already owns a Blobbi". */
const OWNED_STAGES = ['egg', 'baby', 'adult'] as const;

export interface FirstHatchDecisionInput {
  /**
   * Parsed, validated Blobbi state events authored by the user (from
   * `useBlobbisCollection`). Any entry here is already a valid Blobbi.
   */
  companions: BlobbiCompanion[];
  /**
   * The d-tag of the profile's `current_companion`, if a kind 11125 profile
   * exists and points at a companion. Used only to prefer/select a Blobbi —
   * never required to decide ownership.
   */
  currentCompanionD?: string;
}

export type FirstHatchDecision =
  /** No valid Blobbi exists — the first-hatch/onboarding flow may run. */
  | { kind: 'allow-hatch' }
  /**
   * The user only has egg(s) and no hatched Blobbi — reuse an existing egg for
   * the hatching ceremony instead of creating a new one.
   */
  | { kind: 'reuse-egg'; egg: BlobbiCompanion }
  /**
   * The user already owns a hatched (baby/adult) Blobbi — the first-hatch flow
   * must NOT run. `selected` is the Blobbi Ditto should prefer/select.
   */
  | { kind: 'has-blobbi'; selected: BlobbiCompanion };

/**
 * Returns true if the user already owns at least one valid Blobbi state event
 * (egg, baby, or adult). An Island-created baby with empty content counts.
 *
 * This is the authoritative "does the user have a Blobbi?" check. It relies
 * ONLY on the parsed 31124 collection, so it works even when the kind 11125
 * profile is missing or stale.
 */
export function hasExistingBlobbi(companions: BlobbiCompanion[]): boolean {
  return companions.some((c) => (OWNED_STAGES as readonly string[]).includes(c.stage));
}

/**
 * Pick the Blobbi Ditto should select/prefer from a set of hatched companions.
 * Prefers the profile's `current_companion` when it resolves to one of them.
 */
function selectPreferred(
  hatched: BlobbiCompanion[],
  currentCompanionD?: string,
): BlobbiCompanion {
  if (currentCompanionD) {
    const match = hatched.find((c) => c.d === currentCompanionD);
    if (match) return match;
  }
  return hatched[0];
}

/**
 * Decide what the first-hatch flow should do, given the user's already-validated
 * Blobbi collection and (optionally) their profile's current_companion.
 *
 * IMPORTANT: This must be called only once the collection has finished loading,
 * so an empty `companions` array reliably means "no Blobbi on relays" rather
 * than "not loaded yet". Callers gate on collection load state before deciding.
 */
export function decideFirstHatch({
  companions,
  currentCompanionD,
}: FirstHatchDecisionInput): FirstHatchDecision {
  const hatched = companions.filter(
    (c) => c.stage === 'baby' || c.stage === 'adult',
  );

  // The user already has a hatched Blobbi — never create/hatch another first
  // Blobbi. Prefer the profile's current_companion when it points at one.
  if (hatched.length > 0) {
    return { kind: 'has-blobbi', selected: selectPreferred(hatched, currentCompanionD) };
  }

  // Only egg(s) exist — reuse one for the ceremony instead of creating a new one.
  const eggs = companions.filter((c) => c.stage === 'egg');
  if (eggs.length > 0) {
    const preferred = currentCompanionD
      ? eggs.find((c) => c.d === currentCompanionD)
      : undefined;
    const egg =
      preferred ??
      (eggs.length === 1 ? eggs[0] : eggs[Math.floor(Math.random() * eggs.length)]);
    return { kind: 'reuse-egg', egg };
  }

  // No valid Blobbi at all — the first-hatch flow may create one.
  return { kind: 'allow-hatch' };
}
