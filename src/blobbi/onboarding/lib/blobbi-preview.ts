/**
 * Blobbi Preview Generation Utilities
 * 
 * This module provides utilities for generating egg previews during onboarding.
 * The preview is the source of truth for the final adopted event - no regeneration
 * should occur when adopting.
 */

import {
  DEFAULT_EGG_STATS,
  DEFAULT_INCUBATION_TIME,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  BLOBBI_TOPIC_TAG,
  BLOBBI_CLIENT_TAG,
  deriveVisualTraits,
  deriveBlobbiSeedV1,
  generatePetId10,
  getCanonicalBlobbiD,
  type BlobbiVisualTraits,
  type BlobbiStats,
} from '@/lib/blobbi';

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
  /** 64-char hex seed for deterministic visual traits */
  seed: string;
  /** Display name for the egg (default: 'Egg') */
  name: string;
  /** Life stage - always 'egg' for previews */
  stage: 'egg';
  /** Activity state - always 'active' for new eggs */
  state: 'active';
  /** Visual traits derived from seed */
  visualTraits: BlobbiVisualTraits;
  /** Default stats for a new egg */
  stats: BlobbiStats;
  /** Incubation time in seconds */
  incubationTime: number;
  /** Unix timestamp when preview was created (used for seed derivation) */
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
  const seed = deriveBlobbiSeedV1(pubkey, d, createdAt);
  
  // Derive visual traits from seed (same as parseBlobbiEvent does)
  // Pass empty tags since this is a new preview with no existing tags
  const visualTraits = deriveVisualTraits([], seed);
  
  return {
    petId,
    d,
    seed,
    name,
    stage: 'egg',
    state: 'active',
    visualTraits,
    stats: { ...DEFAULT_EGG_STATS },
    incubationTime: DEFAULT_INCUBATION_TIME,
    createdAt,
    ownerPubkey: pubkey,
  };
}

// ─── Update Preview ───────────────────────────────────────────────────────────

/**
 * Update the name in an existing preview.
 * Returns a new preview object with the updated name.
 * All other data (petId, d, seed, visualTraits) remains unchanged.
 */
export function updatePreviewName(
  preview: BlobbiEggPreview,
  name: string
): BlobbiEggPreview {
  return {
    ...preview,
    name: name.trim() || 'Egg', // Fallback to 'Egg' if empty
  };
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a preview to event tags for publishing.
 * 
 * CRITICAL: This uses the exact preview data - no regeneration occurs.
 * The preview is the source of truth for the final adopted event.
 * 
 * Includes all visual trait tags to ensure deterministic rendering.
 * While these can be derived from the seed, including them explicitly:
 * 1. Makes the event self-describing
 * 2. Enables relay-level filtering by visual traits
 * 3. Ensures consistent rendering even if derivation logic changes
 * 
 * @param preview - The preview to convert
 * @returns Tags array for Kind 31124 event
 */
export function previewToEventTags(preview: BlobbiEggPreview): string[][] {
  const now = preview.createdAt.toString();
  const { visualTraits } = preview;
  
  return [
    ['d', preview.d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['t', BLOBBI_TOPIC_TAG],
    ['client', BLOBBI_CLIENT_TAG],
    ['name', preview.name],
    ['stage', preview.stage],
    ['state', preview.state],
    ['seed', preview.seed],
    ['visible_to_others', 'true'],
    ['generation', '1'],
    ['breeding_ready', 'false'],
    ['experience', '0'],
    ['care_streak', '0'],
    ['hunger', preview.stats.hunger.toString()],
    ['happiness', preview.stats.happiness.toString()],
    ['health', preview.stats.health.toString()],
    ['hygiene', preview.stats.hygiene.toString()],
    ['energy', preview.stats.energy.toString()],
    ['last_interaction', now],
    ['last_decay_at', now],
    ['incubation_time', preview.incubationTime.toString()],
    // Visual trait tags - ensures deterministic rendering
    ['base_color', visualTraits.baseColor],
    ['secondary_color', visualTraits.secondaryColor],
    ['eye_color', visualTraits.eyeColor],
    ['pattern', visualTraits.pattern],
    ['special_mark', visualTraits.specialMark],
    ['size', visualTraits.size],
  ];
}

// ─── Adapter for Visual Components ────────────────────────────────────────────

/**
 * Convert a preview to a minimal BlobbiCompanion-like object for rendering.
 * This allows the existing BlobbiStageVisual/BlobbiEggVisual to render the preview.
 */
export function previewToBlobbiCompanion(preview: BlobbiEggPreview) {
  // Create a minimal object that matches what BlobbiStageVisual needs
  return {
    // Required fields for BlobbiStageVisual
    d: preview.d,
    name: preview.name,
    stage: preview.stage,
    state: preview.state,
    seed: preview.seed,
    visualTraits: preview.visualTraits,
    stats: preview.stats,
    
    // Required but not used for preview rendering
    isLegacy: false,
    lastInteraction: preview.createdAt,
    lastDecayAt: preview.createdAt,
    visibleToOthers: true,
    generation: 1,
    breedingReady: false,
    experience: 0,
    careStreak: 0,
    incubationTime: preview.incubationTime,
    startIncubation: undefined,
    
    // We need allTags for the adapter, but preview has no extra tags
    allTags: previewToEventTags(preview),
    
    // Event placeholder - not needed for preview rendering
    event: {
      id: '',
      pubkey: preview.ownerPubkey,
      created_at: preview.createdAt,
      kind: 31124,
      tags: previewToEventTags(preview),
      content: '',
      sig: '',
    },
  };
}
