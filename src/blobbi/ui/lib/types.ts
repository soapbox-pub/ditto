/**
 * Shared Types for Blobbi Visual System
 *
 * Centralized type definitions used across:
 * - Visual components (Baby, Adult, Companion)
 * - Eye animation system
 * - Emotion overlays
 * - Runtime behavior hooks
 *
 * This file provides a single source of truth for visual-related types,
 * eliminating duplicate definitions across the codebase.
 */

// ─── Render Mode ──────────────────────────────────────────────────────────────

/**
 * Controls how the Blobbi visual is rendered.
 *
 * - 'page': Default. Runs eye tracking hooks internally, applies reaction
 *   CSS classes on the SVG container. Used by BlobbiStageVisual / BlobbiPage.
 *
 * - 'companion': Optimized for the floating companion runtime. Disables
 *   internal mouse tracking (gaze driven by ref), suppresses reaction CSS
 *   classes on the SVG container (applied by outer wrapper instead) to
 *   keep the dangerouslySetInnerHTML node stable.
 */
export type BlobbiRenderMode = 'page' | 'companion';

// ─── Eye Tracking Types ───────────────────────────────────────────────────────

/**
 * Controls how the Blobbi's eyes behave.
 * - 'follow-pointer': Eyes track the mouse cursor (default)
 * - 'forward': Eyes look straight ahead (for photos/export)
 */
export type BlobbiLookMode = 'follow-pointer' | 'forward';

/**
 * External eye offset for companion control.
 * Values range from -1 to 1, converted to pixel movement internally.
 *
 * - x: -1 = looking left, +1 = looking right
 * - y: -1 = looking up, +1 = looking down
 */
export interface ExternalEyeOffset {
  x: number;
  y: number;
}

/**
 * Eye position coordinates (used internally by animation system)
 */
export interface EyePosition {
  x: number;
  y: number;
}

// ─── Reaction Types ───────────────────────────────────────────────────────────

/**
 * Reaction states for Blobbi CSS animations.
 * Controls music/sing/dance animations applied to the container.
 */
export type BlobbiReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

// ─── Blobbi Variant Types ─────────────────────────────────────────────────────

/**
 * Blobbi variant for variant-specific adjustments.
 * Used by emotion system for different eyebrow positions, etc.
 */
export type BlobbiVariant = 'baby' | 'adult';
