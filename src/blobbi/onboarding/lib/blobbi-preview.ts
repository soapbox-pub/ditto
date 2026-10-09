/**
 * Blobbi Preview Generation Utilities
 *
 * This module provides utilities for generating egg previews during onboarding.
 * The preview is the source of truth for the final adopted event - no regeneration
 * should occur when adopting.
 *
 * A new Ditto Blobbi is born V3: it IS its address. `@blobbi-kit/core` derives
 * its seed from (owner pubkey, d), and Algorithm 1 derives everything it looks
 * like from that seed, so the event states no seed, colour, trait, size or
 * adult form, only `visual_generation = v3`. The preview holds the address and
 * nothing the published event could disagree with; the ceremony draws the
 * preview and the published egg from the same parsed companion.
 */

import {
  DEFAULT_EGG_STATS,
  KIND_BLOBBI_STATE,
  buildEggTags,
  deriveBlobbiV3Seed,
  generatePetId10,
  getCanonicalBlobbiD,
  parseBlobbiEvent,
  updateBlobbiTags,
  type BlobbiCompanion,
  type BlobbiStats,
} from '@blobbi-kit/core';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Complete preview data for a Blobbi egg before adoption.
 * This is the source of truth - the same data is used to build the final event.
 */
export interface BlobbiEggPreview {
  /** Random 10-char hex petId */
  petId: string;
  /** Canonical d-tag: blobbi-{pubkeyPrefix12}-{petId10} */
  d: string;
  /** The V3 seed: the address (owner, d), hashed by the kit. Never a tag. */
  seed: string;
  /** Display name for the egg (default: 'Egg') */
  name: string;
  /** Life stage - always 'egg' for previews */
  stage: 'egg';
  /** Activity state */
  state: 'active';
  /** Progression state - new eggs start incubating; older eggs may be 'none' */
  progressionState: 'incubating' | 'none';
  /** Default stats for a new egg */
  stats: BlobbiStats;
  /** Unix timestamp when preview was created (the egg's created_at) */
  createdAt: number;
  /** Owner pubkey */
  ownerPubkey: string;
}

// ─── Generation ───────────────────────────────────────────────────────────────

/**
 * Generate a new egg preview with all data needed for adoption.
 *
 * This function creates a complete preview that can be:
 * 1. Rendered in the UI using the existing visual system
 * 2. Converted directly to event tags for publishing (without regeneration)
 *
 * @param pubkey - The owner's pubkey
 * @param name - Optional name for the egg (default: 'Egg')
 * @returns Complete preview data
 */
export function generateEggPreview(
  pubkey: string,
  name = 'Egg'
): BlobbiEggPreview {
  const petId = generatePetId10();
  const d = getCanonicalBlobbiD(pubkey, petId);
  const createdAt = Math.floor(Date.now() / 1000);
  const seed = deriveBlobbiV3Seed(pubkey, d);

  return {
    petId,
    d,
    seed,
    name,
    stage: 'egg',
    state: 'active',
    progressionState: 'incubating',
    stats: { ...DEFAULT_EGG_STATS },
    createdAt,
    ownerPubkey: pubkey,
  };
}

// ─── Update Preview ───────────────────────────────────────────────────────────

/**
 * Update the name in an existing preview.
 * Returns a new preview object with the updated name.
 * All other data (petId, d, seed) remains unchanged.
 *
 * Note: This allows empty names during editing. Validation should be done
 * at the UI level (disable adopt button) or on submit, not here.
 */
export function updatePreviewName(
  preview: BlobbiEggPreview,
  name: string
): BlobbiEggPreview {
  return {
    ...preview,
    name, // Allow empty during editing - validate on submit
  };
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a preview to event tags for publishing.
 *
 * CRITICAL: This uses the exact preview data - no regeneration occurs.
 * The preview is the source of truth for the final adopted event.
 *
 * The tags are the kit's own V3 creation (`buildEggTags`), with the egg's
 * incubation started through the kit's republish merge: a canonical V3 event
 * carries its `d` and `visual_generation = v3`, and no seed, colour, trait,
 * algorithm, size or adult form. Its identity is its address.
 *
 * @param preview - The preview to convert
 * @returns Tags array for Kind 31124 event
 */
export function previewToEventTags(preview: BlobbiEggPreview): string[][] {
  const egg = buildEggTags(preview.ownerPubkey, preview.petId, preview.createdAt, preview.name, { visualGeneration: 'v3' });
  if (preview.progressionState !== 'incubating') return egg;
  const now = preview.createdAt.toString();
  return updateBlobbiTags(egg, { progression_state: 'incubating', progression_started_at: now });
}

// ─── Adapter for Visual Components ────────────────────────────────────────────

/**
 * Convert a preview to the BlobbiCompanion the published egg will parse to.
 * The same parser as the real thing (`parseBlobbiEvent`), over the tags this
 * preview publishes and the owner as author: the preview the player sees is
 * the Blobbi of this address, drawn exactly as the published egg will be.
 */
export function previewToBlobbiCompanion(preview: BlobbiEggPreview): BlobbiCompanion {
  const tags = previewToEventTags(preview);
  const companion = parseBlobbiEvent({
    id: '',
    pubkey: preview.ownerPubkey,
    created_at: preview.createdAt,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '',
  });
  if (!companion) throw new Error('[blobbi-preview] the preview does not parse as a Blobbi');
  return companion;
}
