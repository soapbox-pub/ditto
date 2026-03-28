// src/types/blobbi.ts

/**
 * Minimal, clean Blobbi domain types for the new project.
 *
 * Goal:
 * - keep the model small and portable
 * - support egg / baby / adult rendering
 * - support sleep state
 * - support visual customization
 * - avoid dragging old project complexity into the new app
 */

/* ────────────────────────────────────────────────────────────────────────── *
 * Core lifecycle / state
 * ────────────────────────────────────────────────────────────────────────── */

export type BlobbiLifeStage = 'egg' | 'baby' | 'adult';
export type BlobbiState = 'active' | 'sleeping' | 'hibernating' | 'incubating' | 'evolving';

/* ────────────────────────────────────────────────────────────────────────── *
 * Visual traits
 * ────────────────────────────────────────────────────────────────────────── */

export type BlobbiPattern = 'solid' | 'spotted' | 'striped' | 'gradient';
export type BlobbiSpecialMark = 'none' | 'star' | 'heart' | 'sparkle' | 'blush';
export type BlobbiSize = 'small' | 'medium' | 'large';

export interface BlobbiVisualTraits {
  /**
   * Main body/base color.
   * Example: "#8B5CF6"
   */
  baseColor?: string;

  /**
   * Secondary/accent color, usually used in gradients or details.
   */
  secondaryColor?: string;

  /**
   * Eye / pupil color.
   */
  eyeColor?: string;

  /**
   * Optional pattern used by egg or future visual systems.
   */
  pattern?: BlobbiPattern;

  /**
   * Optional visual mark.
   */
  specialMark?: BlobbiSpecialMark;

  /**
   * Optional size hint for rendering.
   */
  size?: BlobbiSize;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Basic stats
 * Keep only what is useful right now for UI and simple interactions.
 * ────────────────────────────────────────────────────────────────────────── */

export interface BlobbiStats {
  hunger: number;
  happiness: number;
  health: number;
  hygiene: number;
  energy: number;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Stage-specific fields
 * ────────────────────────────────────────────────────────────────────────── */

export interface BlobbiEggData {
  incubationTime?: number;
  incubationProgress?: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BlobbiBabyData {
  // Reserved for future baby-specific fields
}

export interface BlobbiAdultData {
  evolutionForm?: string;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Main Blobbi entity
 * ────────────────────────────────────────────────────────────────────────── */

export interface Blobbi extends BlobbiVisualTraits {
  /**
   * Stable unique identifier.
   */
  id: string;

  /**
   * Display name.
   */
  name: string;

  /**
   * Current lifecycle stage.
   */
  lifeStage: BlobbiLifeStage;

  /**
   * Current activity state.
   */
  state: BlobbiState;

  /**
   * Optional convenience boolean for UI code that still expects this.
   * Prefer using `state === "sleeping"` in new code.
   */
  isSleeping?: boolean;

  /**
   * Basic gameplay / care stats.
   */
  stats: BlobbiStats;

  /**
   * Ownership / identity metadata.
   */
  ownerPubkey?: string;
  seed?: string;

  /**
   * Timestamps.
   * Keep them simple for now; decide later whether the project will
   * standardize on seconds or milliseconds everywhere.
   */
  createdAt?: number;
  birthTime?: number;
  hatchTime?: number;
  lastInteraction?: number;

  /**
   * Progression.
   */
  experience?: number;
  generation?: number;
  careStreak?: number;

  /**
   * Visibility / social.
   */
  visibleToOthers?: boolean;
  crossoverApp?: string | null;
  themeVariant?: string;

  /**
   * Optional raw tags for Nostr-backed or metadata-driven rendering.
   */
  tags?: string[][];

  /**
   * Optional stage-specific buckets.
   * This keeps the root model clean while leaving room to grow.
   */
  egg?: BlobbiEggData;
  baby?: BlobbiBabyData;
  adult?: BlobbiAdultData;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Defaults / helpers
 * ────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_BLOBBI_STATS: BlobbiStats = {
  hunger: 100,
  happiness: 100,
  health: 100,
  hygiene: 100,
  energy: 100,
};

export const DEFAULT_BLOBBI_STATE: BlobbiState = 'active';
export const DEFAULT_BLOBBI_LIFE_STAGE: BlobbiLifeStage = 'egg';

export function createDefaultBlobbi(overrides: Partial<Blobbi> = {}): Blobbi {
  const state = overrides.state ?? DEFAULT_BLOBBI_STATE;

  return {
    id: overrides.id ?? 'blobbi-1',
    name: overrides.name ?? 'Blobbi',
    lifeStage: overrides.lifeStage ?? DEFAULT_BLOBBI_LIFE_STAGE,
    state,
    isSleeping: overrides.isSleeping ?? state === 'sleeping',
    stats: overrides.stats ?? { ...DEFAULT_BLOBBI_STATS },

    baseColor: overrides.baseColor,
    secondaryColor: overrides.secondaryColor,
    eyeColor: overrides.eyeColor,
    pattern: overrides.pattern,
    specialMark: overrides.specialMark,
    size: overrides.size,

    ownerPubkey: overrides.ownerPubkey,
    seed: overrides.seed,

    createdAt: overrides.createdAt,
    birthTime: overrides.birthTime,
    hatchTime: overrides.hatchTime,
    lastInteraction: overrides.lastInteraction,

    experience: overrides.experience ?? 0,
    generation: overrides.generation ?? 1,
    careStreak: overrides.careStreak ?? 0,

    visibleToOthers: overrides.visibleToOthers ?? true,
    crossoverApp: overrides.crossoverApp ?? null,
    themeVariant: overrides.themeVariant,
    tags: overrides.tags ?? [],

    egg: overrides.egg,
    baby: overrides.baby,
    adult: overrides.adult,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Type guards
 * ────────────────────────────────────────────────────────────────────────── */

export function isEggBlobbi(blobbi: Blobbi): boolean {
  return blobbi.lifeStage === 'egg';
}

export function isBabyBlobbi(blobbi: Blobbi): boolean {
  return blobbi.lifeStage === 'baby';
}

export function isAdultBlobbi(blobbi: Blobbi): boolean {
  return blobbi.lifeStage === 'adult';
}

export function isBlobbiSleeping(blobbi: Blobbi): boolean {
  return blobbi.state === 'sleeping' || blobbi.isSleeping === true;
}