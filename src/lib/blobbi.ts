import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { NostrEvent } from '@nostrify/nostrify';

// ─── Constants ────────────────────────────────────────────────────────────────

export const BLOBBI_ECOSYSTEM_NAMESPACE = 'blobbi:ecosystem:v1';
export const BLOBBI_TOPIC_TAG = 'blobbi';
export const BLOBBI_CLIENT_TAG = 'blobbi';

export const KIND_BLOBBI_STATE = 31124;
export const KIND_BLOBBONAUT_PROFILE = 31125;

// Default stats for a new egg
export const DEFAULT_EGG_STATS = {
  hunger: 100,
  happiness: 100,
  health: 100,
  hygiene: 100,
  energy: 100,
};

/**
 * @deprecated No longer used. Task system uses state_started_at instead.
 * Kept for backwards compatibility with older code that may reference it.
 */
export const DEFAULT_INCUBATION_TIME = 345600;

// ─── Onboarding Constants ─────────────────────────────────────────────────────

/** Initial coins given to new Blobbonauts */
export const INITIAL_BLOBBONAUT_COINS = 200;

/** Cost to reroll/generate another egg preview during onboarding */
export const BLOBBI_PREVIEW_REROLL_COST = 10;

/** Cost to adopt a Blobbi from the preview */
export const BLOBBI_ADOPTION_COST = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiStage = 'egg' | 'baby' | 'adult';
export type BlobbiState = 'active' | 'sleeping' | 'hibernating' | 'incubating' | 'evolving';

export interface BlobbiStats {
  hunger: number;
  happiness: number;
  health: number;
  hygiene: number;
  energy: number;
}

// ─── Visual Traits Types ──────────────────────────────────────────────────────

/**
 * Visual traits for a Blobbi, derived from seed or legacy tags.
 * 
 * This interface is designed to be directly consumable by the EggGraphic module.
 * All color values are canonical CSS hex colors.
 * All categorical values match the EggGraphic vocabulary.
 */
export interface BlobbiVisualTraits {
  /** Primary/base color - hex value (e.g., "#F59E0B") */
  baseColor: string;
  /** Secondary/accent color - hex value */
  secondaryColor: string;
  /** Eye color - hex value */
  eyeColor: string;
  /** Pattern type: 'solid' | 'spotted' | 'striped' | 'gradient' */
  pattern: BlobbiPattern;
  /** Special marking: 'none' | 'star' | 'heart' | 'sparkle' | 'blush' */
  specialMark: BlobbiSpecialMark;
  /** Size category: 'small' | 'medium' | 'large' */
  size: BlobbiSize;
}

/** Pattern types supported by EggGraphic */
export type BlobbiPattern = 'solid' | 'spotted' | 'striped' | 'gradient';

/** Special marks supported by EggGraphic */
export type BlobbiSpecialMark = 'none' | 'star' | 'heart' | 'sparkle' | 'blush';

/** Size categories supported by EggGraphic */
export type BlobbiSize = 'small' | 'medium' | 'large';

/**
 * Base color palette - canonical hex values.
 * These are carefully chosen to look good on egg shapes.
 */
export const BLOBBI_BASE_COLORS: readonly string[] = [
  '#F59E0B', // Amber/Gold
  '#55C4A2', // Teal
  '#60A5FA', // Sky Blue
  '#F472B6', // Pink
  '#A78BFA', // Purple
  '#F87171', // Coral Red
  '#34D399', // Emerald
  '#FBBF24', // Yellow
  '#818CF8', // Indigo
  '#FB923C', // Orange
] as const;

/**
 * Secondary color palette - complementary/accent hex values.
 */
export const BLOBBI_SECONDARY_COLORS: readonly string[] = [
  '#FCD34D', // Light Gold
  '#6EE7B7', // Light Teal
  '#93C5FD', // Light Blue
  '#F9A8D4', // Light Pink
  '#C4B5FD', // Light Purple
  '#FCA5A5', // Light Coral
  '#A7F3D0', // Light Emerald
  '#FDE68A', // Light Yellow
  '#A5B4FC', // Light Indigo
  '#FDBA74', // Light Orange
] as const;

/**
 * Eye color palette - expressive hex values.
 */
export const BLOBBI_EYE_COLORS: readonly string[] = [
  '#1F2937', // Dark Gray (default)
  '#7C3AED', // Violet
  '#059669', // Emerald
  '#DC2626', // Red
  '#2563EB', // Blue
  '#D97706', // Amber
  '#DB2777', // Pink
  '#4F46E5', // Indigo
] as const;

/** Available patterns - EggGraphic compatible */
export const BLOBBI_PATTERNS: readonly BlobbiPattern[] = [
  'solid',
  'spotted',
  'striped',
  'gradient',
] as const;

/** Available special marks - EggGraphic compatible */
export const BLOBBI_SPECIAL_MARKS: readonly BlobbiSpecialMark[] = [
  'none',
  'star',
  'heart',
  'sparkle',
  'blush',
] as const;

/** Available sizes - EggGraphic compatible */
export const BLOBBI_SIZES: readonly BlobbiSize[] = [
  'small',
  'medium',
  'large',
] as const;

/** Default visual traits when seed is missing */
export const DEFAULT_VISUAL_TRAITS: BlobbiVisualTraits = {
  baseColor: '#F59E0B',
  secondaryColor: '#FCD34D',
  eyeColor: '#1F2937',
  pattern: 'solid',
  specialMark: 'none',
  size: 'medium',
} as const;

/**
 * Parsed task progress stored in Blobbi event tags.
 * Format: ["task", "name:value"]
 */
export interface BlobbiTaskProgress {
  name: string;
  value: number;
}

/**
 * Parsed representation of a Kind 31124 Blobbi Current State event.
 */
export interface BlobbiCompanion {
  /** Original event for republishing */
  event: NostrEvent;
  /** The d tag value */
  d: string;
  /** Display name */
  name: string;
  /** Lifecycle stage */
  stage: BlobbiStage;
  /** Activity state */
  state: BlobbiState;
  /** Deterministic identity seed (64-char hex) */
  seed: string | undefined;
  /** Visual traits (derived from seed or legacy tags) */
  visualTraits: BlobbiVisualTraits;
  /** Whether this is a legacy event that needs migration */
  isLegacy: boolean;
  /** Timestamp of last user interaction (unix seconds) */
  lastInteraction: number;
  /** Timestamp used for stat decay checkpoint (unix seconds) */
  lastDecayAt: number | undefined;
  /** Stats (0-100) */
  stats: Partial<BlobbiStats>;
  /** Whether the Blobbi is publicly visible */
  visibleToOthers: boolean;
  /** Generation number */
  generation: number | undefined;
  /** Breeding eligibility */
  breedingReady: boolean;
  /** Total XP */
  experience: number | undefined;
  /** Consecutive care days */
  careStreak: number | undefined;
  /** 
   * @deprecated Incubation time in seconds - no longer used.
   * Task system uses state_started_at instead.
   */
  incubationTime: number | undefined;
  /** 
   * @deprecated When incubation began - no longer used.
   * Replaced by state_started_at for all process timing.
   */
  startIncubation: number | undefined;
  /** Adult evolution form type (adult only) */
  adultType: string | undefined;
  /** Timestamp when current state (incubating/evolving) started (unix seconds) */
  stateStartedAt: number | undefined;
  /** Task progress cache (source of truth is computed from Nostr events) */
  tasks: BlobbiTaskProgress[];
  /** Completed task names */
  tasksCompleted: string[];
  /** All tags preserved for republishing */
  allTags: string[][];
}

/**
 * Stored item in user's profile inventory
 */
export interface StorageItem {
  itemId: string;   // Must match a ShopItem.id
  quantity: number; // Must be >= 1
}

/**
 * Parsed representation of a Kind 31125 Blobbonaut Profile event.
 */
export interface BlobbonautProfile {
  /** Original event for republishing */
  event: NostrEvent;
  /** The d tag value */
  d: string;
  /** Currently selected companion Blobbi d-tag */
  currentCompanion: string | undefined;
  /** Whether onboarding/tutorial is complete */
  onboardingDone: boolean;
  /** Display name for the Blobbonaut */
  name: string | undefined;
  /** List of owned Blobbi d-tags */
  has: string[];
  /** In-game currency balance */
  coins: number;
  /** Petting level (interaction counter) */
  pettingLevel: number;
  /** Purchased items inventory */
  storage: StorageItem[];
  /** All tags preserved for republishing */
  allTags: string[][];
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get the first 12 lowercase hex characters from a pubkey.
 */
export function getPubkeyPrefix12(pubkey: string): string {
  return pubkey.slice(0, 12).toLowerCase();
}

/**
 * Generate a random 10-character lowercase hex petId.
 */
export function generatePetId10(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the canonical d-tag for a Blobbi (Kind 31124).
 * Format: blobbi-{ownerPubkeyPrefix12}-{petId10}
 */
export function getCanonicalBlobbiD(pubkey: string, petId: string): string {
  return `blobbi-${getPubkeyPrefix12(pubkey)}-${petId}`;
}

/**
 * Get the canonical d-tag for a Blobbonaut Profile (Kind 31125).
 * Format: blobbonaut-{pubkeyPrefix12}
 */
export function getCanonicalBlobbonautD(pubkey: string): string {
  return `blobbonaut-${getPubkeyPrefix12(pubkey)}`;
}

/**
 * Derive the Blobbi seed using sha256.
 * seed = sha256("blobbi:v1|" + pubkey + ":" + d + ":" + createdAt)
 * 
 * This is the raw derivation function. Use getOrDeriveSeed() when working with events
 * to ensure existing seeds are never recomputed.
 */
export function deriveBlobbiSeedV1(pubkey: string, d: string, createdAt: number): string {
  const input = `blobbi:v1|${pubkey}:${d}:${createdAt}`;
  const hashBytes = sha256(new TextEncoder().encode(input));
  return bytesToHex(hashBytes);
}

/**
 * Get the seed from an existing event, or derive it if not present.
 * Per spec: Clients MUST NOT recompute the seed if a seed tag already exists.
 * 
 * @param event - The Blobbi event to get/derive seed from
 * @returns The existing seed or a newly derived one
 */
export function getOrDeriveSeed(event: NostrEvent): string {
  const existingSeed = getTagValue(event.tags, 'seed');
  if (existingSeed && existingSeed.length === 64) {
    return existingSeed;
  }
  
  const d = getTagValue(event.tags, 'd');
  if (!d) {
    throw new Error('Cannot derive seed: event missing d tag');
  }
  
  return deriveBlobbiSeedV1(event.pubkey, d, event.created_at);
}

// ─── Tag Parsing Utilities ────────────────────────────────────────────────────

/**
 * Get the first value for a given tag name.
 * Does NOT assume tag order.
 */
export function getTagValue(tags: string[][], name: string): string | undefined {
  const tag = tags.find(([n]) => n === name);
  return tag?.[1];
}

/**
 * Get all values for a given tag name (for repeated tags like "has").
 */
export function getTagValues(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(t => t[1]).filter(Boolean);
}

/**
 * Parse a numeric tag value, returning undefined if invalid.
 */
function parseNumericTag(tags: string[][], name: string): number | undefined {
  const value = getTagValue(tags, name);
  if (value === undefined) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Parse a boolean tag value (string "true" or "false").
 */
function parseBooleanTag(tags: string[][], name: string, defaultValue = false): boolean {
  const value = getTagValue(tags, name);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return defaultValue;
}

/**
 * Parse storage tags from a Kind 31125 Blobbonaut Profile event.
 * Storage tags format: ['storage', 'itemId:quantity']
 * 
 * @param tags - Event tags array
 * @returns Array of storage items with itemId and quantity
 */
export function parseStorageTags(tags: string[][]): StorageItem[] {
  return tags
    .filter(tag => tag[0] === 'storage')
    .map(tag => {
      const [itemId, quantityStr] = tag[1].split(':');
      return {
        itemId,
        quantity: parseInt(quantityStr, 10),
      };
    })
    .filter(item => item.itemId && !isNaN(item.quantity) && item.quantity > 0);
}

/**
 * Create storage tags from storage items array.
 * Each item becomes: ['storage', 'itemId:quantity']
 * 
 * @param storage - Array of storage items
 * @returns Array of storage tags
 */
export function createStorageTags(storage: StorageItem[]): string[][] {
  return storage
    .filter(item => item.itemId && item.quantity > 0)
    .map(item => ['storage', `${item.itemId}:${item.quantity}`]);
}

// ─── Legacy Detection ─────────────────────────────────────────────────────────

/**
 * Check if a Blobbonaut d-tag is in canonical format.
 * Canonical: blobbonaut-{12 lowercase hex}
 */
export function isCanonicalBlobbonautD(d: string): boolean {
  return /^blobbonaut-[0-9a-f]{12}$/.test(d);
}

/**
 * Check if a Blobbonaut d-tag is a legacy format.
 * Legacy formats:
 * - Blobbonaut-{8-12 hex} (capitalized)
 * - blobbonaut-profile
 * - blobbonaut-{8-11 hex}
 */
export function isLegacyBlobbonautD(d: string): boolean {
  // Capitalized version
  if (/^Blobbonaut-[0-9a-fA-F]{8,12}$/.test(d)) return true;
  // Generic profile id
  if (d === 'blobbonaut-profile') return true;
  // Short prefix (8-11 chars instead of 12)
  if (/^blobbonaut-[0-9a-f]{8,11}$/.test(d)) return true;
  return false;
}

/**
 * Check if a Blobbi d-tag is in canonical format.
 * Canonical: blobbi-{12 lowercase hex}-{10 lowercase hex}
 * Per spec: petId MUST be 10 lowercase hex characters
 */
export function isCanonicalBlobbiD(d: string): boolean {
  return /^blobbi-[0-9a-f]{12}-[0-9a-f]{10}$/.test(d);
}

/**
 * Check if a Blobbi d-tag is a legacy format (e.g., blobbi-puck, blobbi-fluffy).
 */
export function isLegacyBlobbiD(d: string): boolean {
  // Legacy: blobbi-{name} where name is NOT the canonical format
  if (!d.startsWith('blobbi-')) return false;
  if (isCanonicalBlobbiD(d)) return false;
  return true;
}

// ─── Visual Trait Derivation ──────────────────────────────────────────────────

/**
 * Derive a numeric value from a seed at a specific offset.
 * Uses 4 bytes (8 hex chars) starting at offset to create a deterministic number.
 * 
 * Seed offset layout (per spec):
 * - [0..8]   base_color
 * - [8..16]  secondary_color / eye_color
 * - [16..24] pattern
 * - [24..32] special_mark
 * - [32..40] size
 */
function deriveIndexFromSeed(seed: string, offset: number, max: number): number {
  const slice = seed.slice(offset, offset + 8);
  const value = parseInt(slice, 16);
  return Math.abs(value) % max;
}

/**
 * Derive base color (hex) from seed.
 */
export function deriveBaseColorFromSeed(seed: string): string {
  const index = deriveIndexFromSeed(seed, 0, BLOBBI_BASE_COLORS.length);
  return BLOBBI_BASE_COLORS[index];
}

/**
 * Derive secondary color (hex) from seed.
 */
export function deriveSecondaryColorFromSeed(seed: string): string {
  const index = deriveIndexFromSeed(seed, 8, BLOBBI_SECONDARY_COLORS.length);
  return BLOBBI_SECONDARY_COLORS[index];
}

/**
 * Derive eye color (hex) from seed.
 */
export function deriveEyeColorFromSeed(seed: string): string {
  const index = deriveIndexFromSeed(seed, 12, BLOBBI_EYE_COLORS.length);
  return BLOBBI_EYE_COLORS[index];
}

/**
 * Derive pattern from seed.
 */
export function derivePatternFromSeed(seed: string): BlobbiPattern {
  const index = deriveIndexFromSeed(seed, 16, BLOBBI_PATTERNS.length);
  return BLOBBI_PATTERNS[index];
}

/**
 * Derive special mark from seed.
 */
export function deriveSpecialMarkFromSeed(seed: string): BlobbiSpecialMark {
  const index = deriveIndexFromSeed(seed, 24, BLOBBI_SPECIAL_MARKS.length);
  return BLOBBI_SPECIAL_MARKS[index];
}

/**
 * Derive size from seed.
 */
export function deriveSizeFromSeed(seed: string): BlobbiSize {
  const index = deriveIndexFromSeed(seed, 32, BLOBBI_SIZES.length);
  return BLOBBI_SIZES[index];
}

/**
 * Validate and normalize a pattern value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizePatternTag(value: string | undefined): BlobbiPattern | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiPattern;
  return BLOBBI_PATTERNS.includes(normalized) ? normalized : undefined;
}

/**
 * Validate and normalize a special mark value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizeSpecialMarkTag(value: string | undefined): BlobbiSpecialMark | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiSpecialMark;
  return BLOBBI_SPECIAL_MARKS.includes(normalized) ? normalized : undefined;
}

/**
 * Validate and normalize a size value from a tag.
 * Returns undefined if invalid, allowing fallback to seed derivation.
 */
function normalizeSizeTag(value: string | undefined): BlobbiSize | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase() as BlobbiSize;
  return BLOBBI_SIZES.includes(normalized) ? normalized : undefined;
}

/**
 * Validate a hex color value.
 * Returns the value if valid hex, undefined otherwise.
 */
function normalizeHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Accept both #RGB and #RRGGBB formats
  if (/^#[0-9A-Fa-f]{3}$/.test(value) || /^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  return undefined;
}

/**
 * Derive all visual traits from seed, with legacy tag fallbacks.
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ VISUAL TRAIT POLICY                                                         │
 * │                                                                              │
 * │ Trait resolution priority (per field):                                      │
 * │ 1. Explicit valid tags → always take precedence if present                  │
 * │ 2. Derive from seed → primary source for canonical events                   │
 * │ 3. Safe defaults → final fallback when both tag and seed are missing        │
 * │                                                                              │
 * │ IMPORTANT: Legacy events may have explicit tags WITHOUT a seed.             │
 * │ These tags must be respected - do NOT discard them in favor of defaults.    │
 * │                                                                              │
 * │ New canonical events should rely on seed for visual derivation.             │
 * │ Legacy tags are preserved for backwards compatibility.                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * This function is the SINGLE SOURCE OF TRUTH for visual trait resolution.
 * The UI should consume the output directly without additional logic.
 */
export function deriveVisualTraits(
  tags: string[][],
  seed: string | undefined
): BlobbiVisualTraits {
  // Step 1: Extract and validate explicit tag values
  // These always take precedence if present and valid
  const tagBaseColor = normalizeHexColor(getTagValue(tags, 'base_color'));
  const tagSecondaryColor = normalizeHexColor(getTagValue(tags, 'secondary_color'));
  const tagEyeColor = normalizeHexColor(getTagValue(tags, 'eye_color'));
  const tagPattern = normalizePatternTag(getTagValue(tags, 'pattern'));
  const tagSpecialMark = normalizeSpecialMarkTag(getTagValue(tags, 'special_mark'));
  const tagSize = normalizeSizeTag(getTagValue(tags, 'size'));
  
  // Step 2: Determine fallback values (seed-derived or defaults)
  const hasSeed = seed && seed.length === 64;
  
  // Resolve baseColor first (needed for secondaryColor fallback)
  const fallbackBaseColor = hasSeed ? deriveBaseColorFromSeed(seed) : DEFAULT_VISUAL_TRAITS.baseColor;
  const resolvedBaseColor = tagBaseColor ?? fallbackBaseColor;
  
  // Secondary color: if no seed, fall back to resolved baseColor for unified palette
  // This ensures legacy events with only base_color don't get a mismatched yellow accent
  const fallbackSecondaryColor = hasSeed ? deriveSecondaryColorFromSeed(seed) : resolvedBaseColor;
  
  const fallbackEyeColor = hasSeed ? deriveEyeColorFromSeed(seed) : DEFAULT_VISUAL_TRAITS.eyeColor;
  const fallbackPattern = hasSeed ? derivePatternFromSeed(seed) : DEFAULT_VISUAL_TRAITS.pattern;
  const fallbackSpecialMark = hasSeed ? deriveSpecialMarkFromSeed(seed) : DEFAULT_VISUAL_TRAITS.specialMark;
  const fallbackSize = hasSeed ? deriveSizeFromSeed(seed) : DEFAULT_VISUAL_TRAITS.size;
  
  // Step 3: Priority: explicit valid tag > fallback (seed-derived or default)
  return {
    baseColor: resolvedBaseColor,
    secondaryColor: tagSecondaryColor ?? fallbackSecondaryColor,
    eyeColor: tagEyeColor ?? fallbackEyeColor,
    pattern: tagPattern ?? fallbackPattern,
    specialMark: tagSpecialMark ?? fallbackSpecialMark,
    size: tagSize ?? fallbackSize,
  };
}

// ─── Legacy Event Detection ───────────────────────────────────────────────────

/**
 * Check if a Blobbi event is a legacy event that needs migration.
 * 
 * A Blobbi is considered legacy if ANY of the following is true:
 * - the d tag is not in canonical format
 * - the seed tag is missing
 * - the name tag is missing and must be derived from d
 * - visual traits exist but seed does not
 * 
 * Canonical Blobbi events must always contain:
 * - canonical d
 * - seed
 * - name
 * - stage
 * - state
 * - stats
 * - ecosystem tag
 */
export function isLegacyBlobbiEvent(event: NostrEvent): boolean {
  const tags = event.tags;
  const d = getTagValue(tags, 'd');
  
  if (!d) return true;
  
  // Check if d-tag is not canonical
  if (!isCanonicalBlobbiD(d)) {
    return true;
  }
  
  // Check if seed is missing
  const seed = getTagValue(tags, 'seed');
  if (!seed || seed.length !== 64) {
    return true;
  }
  
  // Check if name tag is missing
  const name = getTagValue(tags, 'name');
  if (!name) {
    return true;
  }
  
  // Check if visual traits exist but seed does not
  // (This case is already covered by seed check above, but being explicit)
  const hasVisualTags = getTagValue(tags, 'base_color') !== undefined ||
                        getTagValue(tags, 'pattern') !== undefined ||
                        getTagValue(tags, 'special_mark') !== undefined ||
                        getTagValue(tags, 'size') !== undefined;
  
  if (hasVisualTags && !seed) {
    return true;
  }
  
  return false;
}

/**
 * Check if a parsed BlobbiCompanion needs migration.
 * This is a convenience wrapper around isLegacyBlobbiEvent.
 */
export function companionNeedsMigration(companion: BlobbiCompanion): boolean {
  return companion.isLegacy;
}

// ─── Event Validation ─────────────────────────────────────────────────────────

/**
 * Validate that an event has the required tags for a valid Blobbi state (Kind 31124).
 * Required: d, b (blobbi:ecosystem:v1), t (blobbi), stage, state, last_interaction
 */
export function isValidBlobbiEvent(event: NostrEvent): boolean {
  if (event.kind !== KIND_BLOBBI_STATE) return false;
  
  const d = getTagValue(event.tags, 'd');
  const b = getTagValue(event.tags, 'b');
  const t = getTagValue(event.tags, 't');
  const stage = getTagValue(event.tags, 'stage');
  const state = getTagValue(event.tags, 'state');
  const lastInteraction = getTagValue(event.tags, 'last_interaction');
  
  if (!d) return false;
  if (b !== BLOBBI_ECOSYSTEM_NAMESPACE) return false;
  if (t !== BLOBBI_TOPIC_TAG) return false;
  if (!stage || !['egg', 'baby', 'adult'].includes(stage)) return false;
  if (!state || !['active', 'sleeping', 'hibernating'].includes(state)) return false;
  if (!lastInteraction) return false;
  
  return true;
}

/**
 * Validate that an event has the required tags for a valid Blobbonaut profile (Kind 31125).
 * Required: d, b (blobbi:ecosystem:v1), t (blobbi)
 */
export function isValidBlobbonautEvent(event: NostrEvent): boolean {
  if (event.kind !== KIND_BLOBBONAUT_PROFILE) return false;
  
  const d = getTagValue(event.tags, 'd');
  const b = getTagValue(event.tags, 'b');
  const t = getTagValue(event.tags, 't');
  
  if (!d) return false;
  if (b !== BLOBBI_ECOSYSTEM_NAMESPACE) return false;
  if (t !== BLOBBI_TOPIC_TAG) return false;
  
  return true;
}

// ─── Event Parsing ────────────────────────────────────────────────────────────

/**
 * Derive a display name from a legacy d-tag.
 * Legacy format: blobbi-{name} (e.g., "blobbi-puck" → "Puck")
 * 
 * @param d - The d-tag value
 * @returns The derived name with first letter capitalized, or "Unnamed Blobbi" if not derivable
 */
/**
 * Capitalize each word in a string.
 * @example "mr cool" -> "Mr Cool"
 */
function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Derive a display name from a legacy d-tag.
 * 
 * Transformation rules:
 * 1. Remove "blobbi-" prefix
 * 2. Replace "-" and "_" with spaces
 * 3. Trim whitespace
 * 4. Capitalize words in a human-friendly way
 * 5. Fallback to "Unnamed Blobbi" if result is empty
 * 
 * @example "blobbi-puck" -> "Puck"
 * @example "blobbi-mr-cool" -> "Mr Cool"
 * @example "blobbi_blue" -> "Blue"
 * @example "blobbi-" -> "Unnamed Blobbi"
 */
export function deriveNameFromLegacyD(d: string): string {
  if (!d.startsWith('blobbi-')) {
    return 'Unnamed Blobbi';
  }
  
  // Remove prefix and normalize separators
  const rawName = d
    .replace('blobbi-', '')
    .replace(/[-_]/g, ' ')
    .trim();
  
  // If nothing meaningful remains, return fallback
  if (!rawName || rawName.length === 0) {
    return 'Unnamed Blobbi';
  }
  
  // Capitalize words for human-friendly display
  return capitalizeWords(rawName);
}

/**
 * Parse a Kind 31124 Blobbi Current State event into a structured object.
 * Returns undefined if the event is invalid.
 * 
 * This function is the SINGLE SOURCE OF TRUTH for resolving:
 * - name (from tag or legacy d-tag derivation)
 * - seed
 * - visualTraits (derived from seed, with legacy tag fallbacks)
 * - isLegacy flag
 * 
 * The UI should NOT need to guess names or traits - everything is resolved here.
 * 
 * Name resolution priority:
 * 1. Use `name` tag if present
 * 2. Derive from legacy d-tag format (blobbi-{name})
 * 3. Fall back to "Unnamed Blobbi"
 * 
 * Visual trait priority:
 * 1. Use explicit visual tags if valid (legacy compatibility)
 * 2. Derive deterministically from seed
 * 3. Use safe defaults if seed is missing
 */
export function parseBlobbiEvent(event: NostrEvent): BlobbiCompanion | undefined {
  if (!isValidBlobbiEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  const nameTag = getTagValue(tags, 'name');
  const stage = getTagValue(tags, 'stage') as BlobbiStage;
  const state = getTagValue(tags, 'state') as BlobbiState;
  const seed = getTagValue(tags, 'seed');
  
  // Resolve name: tag > legacy d-tag derivation > fallback
  const name = nameTag ?? deriveNameFromLegacyD(d);
  
  // Derive visual traits (single source of truth)
  const visualTraits = deriveVisualTraits(tags, seed);
  
  // Check if this is a legacy event that needs migration
  const isLegacy = isLegacyBlobbiEvent(event);
  
  // Concise, structured debug log
  console.log('[Blobbi]', {
    d: d.length > 30 ? `${d.slice(0, 20)}...` : d,
    name,
    isLegacy,
    hasSeed: !!seed,
    traits: `${visualTraits.baseColor} ${visualTraits.pattern} ${visualTraits.size}`,
  });
  
  // Parse task progress tags: ["task", "name:value"]
  const tasks: BlobbiTaskProgress[] = [];
  for (const tag of tags) {
    if (tag[0] === 'task' && tag[1]) {
      const [taskName, taskValue] = tag[1].split(':');
      if (taskName && taskValue) {
        tasks.push({ name: taskName, value: parseInt(taskValue, 10) || 0 });
      }
    }
  }
  
  // Parse completed task tags: ["task_completed", "name"]
  const tasksCompleted: string[] = [];
  for (const tag of tags) {
    if (tag[0] === 'task_completed' && tag[1]) {
      tasksCompleted.push(tag[1]);
    }
  }
  
  return {
    event,
    d,
    name,
    stage,
    state,
    seed,
    visualTraits,
    isLegacy,
    lastInteraction: parseNumericTag(tags, 'last_interaction')!,
    lastDecayAt: parseNumericTag(tags, 'last_decay_at'),
    stats: {
      hunger: parseNumericTag(tags, 'hunger'),
      happiness: parseNumericTag(tags, 'happiness'),
      health: parseNumericTag(tags, 'health'),
      hygiene: parseNumericTag(tags, 'hygiene'),
      energy: parseNumericTag(tags, 'energy'),
    },
    visibleToOthers: parseBooleanTag(tags, 'visible_to_others', true),
    generation: parseNumericTag(tags, 'generation'),
    breedingReady: parseBooleanTag(tags, 'breeding_ready', false),
    experience: parseNumericTag(tags, 'experience'),
    careStreak: parseNumericTag(tags, 'care_streak'),
    incubationTime: parseNumericTag(tags, 'incubation_time'),
    startIncubation: parseNumericTag(tags, 'start_incubation'),
    adultType: getTagValue(tags, 'adult_type'),
    stateStartedAt: parseNumericTag(tags, 'state_started_at'),
    tasks,
    tasksCompleted,
    allTags: tags,
  };
}

/**
 * Parse a Kind 31125 Blobbonaut Profile event into a structured object.
 * Returns undefined if the event is invalid.
 * 
 * Note: pettingLevel is parsed from both 'pettingLevel' and 'petting_level' tags
 * for backwards compatibility with legacy profiles.
 */
export function parseBlobbonautEvent(event: NostrEvent): BlobbonautProfile | undefined {
  if (!isValidBlobbonautEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  
  // Parse pettingLevel from either camelCase or snake_case tag
  const pettingLevelValue = parseNumericTag(tags, 'pettingLevel') 
    ?? parseNumericTag(tags, 'petting_level') 
    ?? 0;
  
  return {
    event,
    d,
    currentCompanion: getTagValue(tags, 'current_companion'),
    onboardingDone: parseBooleanTag(tags, 'onboarding_done', false),
    name: getTagValue(tags, 'name'),
    has: getTagValues(tags, 'has'),
    coins: parseNumericTag(tags, 'coins') ?? 0,
    pettingLevel: pettingLevelValue,
    storage: parseStorageTags(tags),
    allTags: tags,
  };
}

// ─── Tag Building Utilities ───────────────────────────────────────────────────

/**
 * Build tags for a new Blobbonaut Profile (Kind 31125).
 * Includes pettingLevel: 0 by default.
 */
export function buildBlobbonautTags(pubkey: string): string[][] {
  return [
    ['d', getCanonicalBlobbonautD(pubkey)],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['t', BLOBBI_TOPIC_TAG],
    ['client', BLOBBI_CLIENT_TAG],
    ['onboarding_done', 'false'],
    ['pettingLevel', '0'],
  ];
}

/**
 * Build tags for a new Blobbi egg (Kind 31124).
 * Includes required and recommended tags for a new egg.
 * 
 * Visual traits are derived from the seed and explicitly stored
 * to ensure consistent rendering across clients.
 */
export function buildEggTags(
  pubkey: string,
  petId: string,
  createdAt: number,
  name = 'Egg'
): string[][] {
  const d = getCanonicalBlobbiD(pubkey, petId);
  const seed = deriveBlobbiSeedV1(pubkey, d, createdAt);
  const now = createdAt.toString();
  
  // Derive visual traits from seed for explicit storage
  const baseColor = deriveBaseColorFromSeed(seed);
  const secondaryColor = deriveSecondaryColorFromSeed(seed);
  const eyeColor = deriveEyeColorFromSeed(seed);
  const pattern = derivePatternFromSeed(seed);
  const specialMark = deriveSpecialMarkFromSeed(seed);
  const size = deriveSizeFromSeed(seed);
  
  return [
    ['d', d],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['t', BLOBBI_TOPIC_TAG],
    ['client', BLOBBI_CLIENT_TAG],
    ['name', name],
    ['stage', 'egg'],
    ['state', 'active'],
    ['seed', seed],
    ['visible_to_others', 'true'],
    ['generation', '1'],
    ['breeding_ready', 'false'],
    ['experience', '0'],
    ['care_streak', '0'],
    ['hunger', DEFAULT_EGG_STATS.hunger.toString()],
    ['happiness', DEFAULT_EGG_STATS.happiness.toString()],
    ['health', DEFAULT_EGG_STATS.health.toString()],
    ['hygiene', DEFAULT_EGG_STATS.hygiene.toString()],
    ['energy', DEFAULT_EGG_STATS.energy.toString()],
    ['last_interaction', now],
    ['last_decay_at', now],
    // Visual traits (derived from seed, explicitly stored for consistency)
    ['base_color', baseColor],
    ['secondary_color', secondaryColor],
    ['eye_color', eyeColor],
    ['pattern', pattern],
    ['special_mark', specialMark],
    ['size', size],
  ];
}

// ─── Managed Tag Sets (Separated by Kind) ─────────────────────────────────────

/**
 * Tags managed by the client for Kind 31124 (Blobbi State).
 * These tags are controlled by the application and may be overwritten.
 */
export const MANAGED_BLOBBI_STATE_TAG_NAMES = new Set([
  'd', 'b', 't', 'client', 'name', 'stage', 'state', 'seed',
  'visible_to_others', 'generation', 'breeding_ready', 'experience',
  'care_streak', 'hunger', 'happiness', 'health', 'hygiene', 'energy',
  'last_interaction', 'last_decay_at',
  // Task system tags (state_started_at is the single source of truth for process timing)
  'state_started_at', 'task', 'task_completed',
  // Visual trait tags (required for consistent rendering)
  'base_color', 'secondary_color', 'eye_color', 'pattern', 'special_mark', 'size',
]);

/**
 * Visual trait tags that are part of the canonical Blobbi format.
 * These tags ensure deterministic visual rendering across clients.
 * 
 * Note: While seed is the ultimate source of truth for visual generation,
 * these tags are explicitly stored for compatibility and faster rendering.
 */
export const VISUAL_TRAIT_TAG_NAMES = [
  'base_color',
  'secondary_color',
  'eye_color',
  'pattern',
  'special_mark',
  'size',
] as const;

/**
 * Deprecated tags that should be removed when republishing events.
 * These tags were part of earlier designs but are no longer used.
 * 
 * - shell_integrity: Eggs now use the standard health stat instead
 * - egg_temperature: Eggs now rely on warmth prop fallback; not part of active stat model
 * - incubation_progress: Obsolete task progress field
 * - egg_status: Obsolete status field
 * - fees: Obsolete fee tracking field
 * - incubation_time: Obsolete; task system uses state_started_at instead
 * - start_incubation: Obsolete; replaced by state_started_at
 */
export const DEPRECATED_BLOBBI_TAG_NAMES = new Set([
  'shell_integrity',
  'egg_temperature',
  'incubation_progress',
  'egg_status',
  'fees',
  'incubation_time',
  'start_incubation',
]);

/**
 * Tags managed by the client for Kind 31125 (Blobbonaut Profile).
 * These tags are controlled by the application and may be overwritten.
 */
export const MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES = new Set([
  'd', 'b', 't', 'client', 'name', 'current_companion', 'onboarding_done', 'has', 'storage',
  // Legacy player progress tags (preserved for compatibility)
  'coins', 'petting_level', 'pettingLevel', 'lifetime_blobbis', 'lifetimeBlobbis',
  'starter_blobbi', 'starterBlobbi', 'favorite_blobbi', 'favoriteBlobbi',
]);

/**
 * Combined set for backwards compatibility.
 * @deprecated Use kind-specific sets instead
 */
const MANAGED_TAG_NAMES = new Set([
  ...MANAGED_BLOBBI_STATE_TAG_NAMES,
  ...MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES,
]);

/**
 * Merge tags for republishing, preserving unknown tags from the original event.
 * @param existingTags - Tags from the original event
 * @param newTags - New tags to apply (will override existing by tag name)
 * @returns Merged tags array
 */
export function mergeTagsForRepublish(
  existingTags: string[][],
  newTags: string[][]
): string[][] {
  // Create a map of new tags by their first element (tag name)
  const newTagsMap = new Map<string, string[][]>();
  for (const tag of newTags) {
    const name = tag[0];
    if (!newTagsMap.has(name)) {
      newTagsMap.set(name, []);
    }
    newTagsMap.get(name)!.push(tag);
  }
  
  // Start with existing unknown tags (tags we don't manage)
  const unknownTags = existingTags.filter(tag => !MANAGED_TAG_NAMES.has(tag[0]));
  
  // Collect all new tags in order
  const result: string[][] = [];
  
  // Add new tags first
  for (const tags of newTagsMap.values()) {
    result.push(...tags);
  }
  
  // Preserve unknown tags
  result.push(...unknownTags);
  
  return result;
}

/**
 * Update specific tags in a Blobbi event while preserving unknown tags.
 * Uses MANAGED_BLOBBI_STATE_TAG_NAMES for Kind 31124.
 */
export function updateBlobbiTags(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  return mergeBlobbiStateTagsForRepublish(existingTags, updates);
}

/**
 * Merge tags for republishing a Kind 31124 Blobbi State event.
 * Preserves unknown tags and applies updates to managed tags.
 */
export function mergeBlobbiStateTagsForRepublish(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  const newTags: string[][] = [];
  const updateKeys = new Set(Object.keys(updates));
  
  // Preserve existing managed tags that aren't being updated
  for (const tag of existingTags) {
    const name = tag[0];
    if (MANAGED_BLOBBI_STATE_TAG_NAMES.has(name) && !updateKeys.has(name)) {
      newTags.push(tag);
    }
  }
  
  // Add updates
  for (const [name, value] of Object.entries(updates)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        newTags.push([name, v]);
      }
    } else {
      newTags.push([name, value]);
    }
  }
  
  // Preserve unknown tags (tags not managed by us), excluding deprecated tags
  const unknownTags = existingTags.filter(tag => 
    !MANAGED_BLOBBI_STATE_TAG_NAMES.has(tag[0]) && 
    !DEPRECATED_BLOBBI_TAG_NAMES.has(tag[0])
  );
  
  return [...newTags, ...unknownTags];
}

/**
 * Merge tags for republishing a Kind 31125 Blobbonaut Profile event.
 * Preserves unknown tags, applies updates, and deduplicates repeated tags like 'has'.
 */
export function mergeBlobbonautTagsForRepublish(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  const newTags: string[][] = [];
  const updateKeys = new Set(Object.keys(updates));
  
  // Preserve existing managed tags that aren't being updated
  for (const tag of existingTags) {
    const name = tag[0];
    if (MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has(name) && !updateKeys.has(name)) {
      newTags.push(tag);
    }
  }
  
  // Add updates
  for (const [name, value] of Object.entries(updates)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        newTags.push([name, v]);
      }
    } else {
      newTags.push([name, value]);
    }
  }
  
  // Preserve unknown tags (tags not managed by us)
  const unknownTags = existingTags.filter(tag => !MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES.has(tag[0]));
  
  // Deduplicate 'has' tags
  return deduplicateHasTags([...newTags, ...unknownTags]);
}

/**
 * Deduplicate 'has' tags in a tag array.
 * Ensures each pet reference appears only once.
 */
export function deduplicateHasTags(tags: string[][]): string[][] {
  const seenHas = new Set<string>();
  const result: string[][] = [];
  
  for (const tag of tags) {
    if (tag[0] === 'has') {
      const value = tag[1];
      if (value && !seenHas.has(value)) {
        seenHas.add(value);
        result.push(tag);
      }
    } else {
      result.push(tag);
    }
  }
  
  return result;
}

/**
 * Update Blobbonaut profile tags with proper deduplication.
 * Use this when updating Kind 31125 events.
 */
export function updateBlobbonautTags(
  existingTags: string[][],
  updates: Record<string, string | string[]>
): string[][] {
  return mergeBlobbonautTagsForRepublish(existingTags, updates);
}

// ─── Profile Normalization ────────────────────────────────────────────────────

/**
 * Check if a Blobbonaut profile is missing the pettingLevel tag.
 * This helps determine if normalization is needed.
 */
export function profileNeedsPettingLevelNormalization(profile: BlobbonautProfile): boolean {
  // Check if either pettingLevel or petting_level tag exists in allTags
  const hasPettingLevelTag = profile.allTags.some(
    ([name]) => name === 'pettingLevel' || name === 'petting_level'
  );
  return !hasPettingLevelTag;
}

/**
 * Build updated tags for normalizing a profile to include pettingLevel.
 * Preserves all existing tags and adds pettingLevel: 0 if missing.
 */
export function buildNormalizedProfileTags(profile: BlobbonautProfile): string[][] {
  if (!profileNeedsPettingLevelNormalization(profile)) {
    return profile.allTags;
  }
  
  return updateBlobbonautTags(profile.allTags, {
    pettingLevel: '0',
  });
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Get all possible d-tag values to query for a Blobbonaut profile.
 * Includes canonical and legacy formats for migration support.
 */
export function getBlobbonautQueryDValues(pubkey: string): string[] {
  const prefix12 = getPubkeyPrefix12(pubkey);
  const prefix8 = pubkey.slice(0, 8).toLowerCase();
  
  return [
    // Canonical
    `blobbonaut-${prefix12}`,
    // Legacy: capitalized
    `Blobbonaut-${prefix12}`,
    `Blobbonaut-${prefix8}`,
    // Legacy: generic
    'blobbonaut-profile',
    // Legacy: shorter prefixes
    `blobbonaut-${prefix8}`,
  ];
}

// ─── Legacy Migration Helpers ─────────────────────────────────────────────────

/**
 * Build tags for migrating a legacy Blobbi pet to canonical format.
 * 
 * Migration preserves:
 * - seed (existing or derived once)
 * - name (tag > legacy d-tag derived > fallback)
 * - core state tags (stage, state, stats, etc.)
 * - legacy visual tags (explicitly preserved for backwards compatibility)
 * - unknown tags (for forward compatibility)
 * 
 * @param legacyEvent - The original legacy event
 * @param newPetId - The new 10-char hex petId for canonical format
 * @param pubkey - The owner's pubkey
 * @returns Tags for the new canonical event
 */
export function buildMigrationTags(
  legacyEvent: NostrEvent,
  newPetId: string,
  pubkey: string
): string[][] {
  const canonicalD = getCanonicalBlobbiD(pubkey, newPetId);
  const legacyTags = legacyEvent.tags;
  
  // Get or derive seed - use legacy event's created_at for consistency
  // IMPORTANT: If seed exists and is valid, preserve it. Only derive if missing.
  const existingSeed = getTagValue(legacyTags, 'seed');
  const seed = existingSeed && existingSeed.length === 64
    ? existingSeed
    : deriveBlobbiSeedV1(pubkey, canonicalD, legacyEvent.created_at);
  
  const now = Math.floor(Date.now() / 1000).toString();
  
  // Start with required tags
  const newTags: string[][] = [
    ['d', canonicalD],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['t', BLOBBI_TOPIC_TAG],
    ['client', BLOBBI_CLIENT_TAG],
    ['seed', seed],
  ];
  
  // Preserve name with priority: name tag > legacy d-tag derived > fallback
  const nameTag = getTagValue(legacyTags, 'name');
  const legacyD = getTagValue(legacyTags, 'd');
  const resolvedName = nameTag ?? (legacyD ? deriveNameFromLegacyD(legacyD) : 'Unnamed Blobbi');
  newTags.push(['name', resolvedName]);
  
  // Preserve core state tags
  const coreStateTags = [
    'stage', 'state', 'visible_to_others', 'generation', 'breeding_ready',
    'experience', 'care_streak', 'hunger', 'happiness', 'health', 'hygiene', 'energy',
    'incubation_time', 'start_incubation',
  ];
  
  for (const tagName of coreStateTags) {
    const value = getTagValue(legacyTags, tagName);
    if (value !== undefined) {
      newTags.push([tagName, value]);
    }
  }
  
  // EXPLICITLY preserve visual trait tags for backwards compatibility
  // These are TRANSITIONAL - seed is the future source of truth
  // Do not overwrite if they exist in the legacy event
  for (const visualTag of VISUAL_TRAIT_TAG_NAMES) {
    const value = getTagValue(legacyTags, visualTag);
    if (value !== undefined) {
      newTags.push([visualTag, value]);
    }
  }
  
  // Update timestamps
  newTags.push(['last_interaction', now]);
  const lastDecay = getTagValue(legacyTags, 'last_decay_at');
  if (lastDecay) {
    newTags.push(['last_decay_at', lastDecay]);
  } else {
    newTags.push(['last_decay_at', now]);
  }
  
  // Preserve truly unknown tags for forward compatibility
  // (tags not in managed set AND not in visual trait set)
  const knownTagNames = new Set([
    ...MANAGED_BLOBBI_STATE_TAG_NAMES,
    ...VISUAL_TRAIT_TAG_NAMES,
  ]);
  const unknownTags = legacyTags.filter(tag => !knownTagNames.has(tag[0]));
  
  return [...newTags, ...unknownTags];
}

/**
 * Check if a Blobbi needs migration to canonical format.
 */
export function needsCanonicalMigration(d: string): boolean {
  return isLegacyBlobbiD(d);
}

/**
 * Add a pet to the profile's 'has' list without duplicates.
 * Returns updated has array.
 */
export function addPetToHas(currentHas: string[], newPetD: string): string[] {
  if (currentHas.includes(newPetD)) {
    return currentHas;
  }
  return [...currentHas, newPetD];
}

/**
 * Remove a legacy pet ID from 'has' and replace with canonical.
 */
export function migratePetInHas(
  currentHas: string[],
  legacyD: string,
  canonicalD: string
): string[] {
  const filtered = currentHas.filter(d => d !== legacyD);
  if (!filtered.includes(canonicalD)) {
    filtered.push(canonicalD);
  }
  return filtered;
}

// ─── LocalStorage Cache Types ─────────────────────────────────────────────────

export interface BlobbiBootCache {
  /** The user's pubkey this cache belongs to */
  pubkey: string;
  profile: BlobbonautProfile | null;
  companion: BlobbiCompanion | null;
  cachedAt: number;
}

export const BLOBBI_CACHE_KEY = 'blobbi:boot-cache';
