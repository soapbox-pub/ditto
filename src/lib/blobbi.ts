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

// Default incubation time in seconds (4 days)
export const DEFAULT_INCUBATION_TIME = 345600;

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlobbiStage = 'egg' | 'baby' | 'adult';
export type BlobbiState = 'active' | 'sleeping' | 'hibernating';

export interface BlobbiStats {
  hunger: number;
  happiness: number;
  health: number;
  hygiene: number;
  energy: number;
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
  /** Incubation time in seconds (egg only) */
  incubationTime: number | undefined;
  /** When incubation began (egg only) */
  startIncubation: number | undefined;
  /** All tags preserved for republishing */
  allTags: string[][];
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
 * Parse a Kind 31124 Blobbi Current State event into a structured object.
 * Returns undefined if the event is invalid.
 */
export function parseBlobbiEvent(event: NostrEvent): BlobbiCompanion | undefined {
  if (!isValidBlobbiEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  
  return {
    event,
    d,
    name: getTagValue(tags, 'name') ?? 'Blobbi',
    stage: getTagValue(tags, 'stage') as BlobbiStage,
    state: getTagValue(tags, 'state') as BlobbiState,
    seed: getTagValue(tags, 'seed'),
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
    allTags: tags,
  };
}

/**
 * Parse a Kind 31125 Blobbonaut Profile event into a structured object.
 * Returns undefined if the event is invalid.
 */
export function parseBlobbonautEvent(event: NostrEvent): BlobbonautProfile | undefined {
  if (!isValidBlobbonautEvent(event)) return undefined;
  
  const tags = event.tags;
  const d = getTagValue(tags, 'd')!;
  
  return {
    event,
    d,
    currentCompanion: getTagValue(tags, 'current_companion'),
    onboardingDone: parseBooleanTag(tags, 'onboarding_done', false),
    name: getTagValue(tags, 'name'),
    has: getTagValues(tags, 'has'),
    allTags: tags,
  };
}

// ─── Tag Building Utilities ───────────────────────────────────────────────────

/**
 * Build tags for a new Blobbonaut Profile (Kind 31125).
 */
export function buildBlobbonautTags(pubkey: string): string[][] {
  return [
    ['d', getCanonicalBlobbonautD(pubkey)],
    ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ['t', BLOBBI_TOPIC_TAG],
    ['client', BLOBBI_CLIENT_TAG],
    ['onboarding_done', 'false'],
  ];
}

/**
 * Build tags for a new Blobbi egg (Kind 31124).
 * Includes required and recommended tags for a new egg.
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
    ['incubation_time', DEFAULT_INCUBATION_TIME.toString()],
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
  'last_interaction', 'last_decay_at', 'incubation_time', 'start_incubation',
]);

/**
 * Tags managed by the client for Kind 31125 (Blobbonaut Profile).
 * These tags are controlled by the application and may be overwritten.
 */
export const MANAGED_BLOBBONAUT_PROFILE_TAG_NAMES = new Set([
  'd', 'b', 't', 'client', 'name', 'current_companion', 'onboarding_done', 'has',
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
  
  // Preserve unknown tags (tags not managed by us)
  const unknownTags = existingTags.filter(tag => !MANAGED_BLOBBI_STATE_TAG_NAMES.has(tag[0]));
  
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
 * Preserves compatible tags from the legacy event and generates seed if missing.
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
  
  // Preserve name (use legacy d-tag suffix as fallback)
  const name = getTagValue(legacyTags, 'name');
  const legacyD = getTagValue(legacyTags, 'd');
  const legacyName = legacyD?.replace('blobbi-', '') ?? 'Blobbi';
  newTags.push(['name', name ?? legacyName]);
  
  // Preserve core state tags
  const preserveTags = [
    'stage', 'state', 'visible_to_others', 'generation', 'breeding_ready',
    'experience', 'care_streak', 'hunger', 'happiness', 'health', 'hygiene', 'energy',
    'incubation_time', 'start_incubation',
  ];
  
  for (const tagName of preserveTags) {
    const value = getTagValue(legacyTags, tagName);
    if (value !== undefined) {
      newTags.push([tagName, value]);
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
  
  // Preserve unknown tags for forward compatibility
  const unknownTags = legacyTags.filter(tag => 
    !MANAGED_BLOBBI_STATE_TAG_NAMES.has(tag[0])
  );
  
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
