// src/blobbi/core/lib/blobbi-segments.ts
//
// Pure helper that derives UI display state from internal 1–100 stats.
// This does NOT change any gameplay behaviour — it is read-only interpretation.

import type { BlobbiStage, BlobbiStats } from './blobbi';
import { STAT_MIN, STAT_MAX } from './blobbi';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CareState =
  | 'protected'
  | 'good'
  | 'okay'
  | 'attention'
  | 'urgent';

export interface StatDisplayState {
  /** Clamped internal value (STAT_MIN–STAT_MAX). */
  value: number;
  /** Number of filled segments for the current stage. */
  filled: number;
  /** Maximum number of segments for the current stage. */
  max: number;
  /** Derived care state for badge / colour decisions. */
  careState: CareState;
  /** Whether a warning badge should be shown. */
  shouldShowBadge: boolean;
  /** Whether the indicator should pulse (urgent only). */
  shouldPulse: boolean;
  /** True when care state is attention or urgent. */
  isLow: boolean;
  /** True when care state is urgent only. */
  isUrgent: boolean;
}

export interface StatDisplayInput {
  stage: BlobbiStage;
  stat: keyof BlobbiStats;
  value: number;
}

// ─── Segment counts per stage ─────────────────────────────────────────────────

const BABY_SEGMENTS = 4;
const ADULT_SEGMENTS = 10;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map a clamped 1–100 value to 1–maxSegments (never 0).
 *
 * Uses ceiling division so that the minimum clamped value (1) always
 * yields at least 1 filled segment.
 */
function toSegments(value: number, maxSegments: number): number {
  return Math.ceil((value / STAT_MAX) * maxSegments) || 1;
}

// ─── Baby care-state mapping (4 segments) ─────────────────────────────────────

function babyCareState(value: number): CareState {
  if (value <= 25) return 'urgent';
  if (value <= 50) return 'attention';
  if (value <= 75) return 'okay';
  return 'good';
}

// ─── Adult care-state mapping (10 segments) ───────────────────────────────────

function adultCareState(value: number): CareState {
  if (value <= 30) return 'urgent';
  if (value <= 60) return 'attention';
  if (value <= 70) return 'okay';
  return 'good';
}

// ─── Flag derivation ──────────────────────────────────────────────────────────

function deriveFlags(careState: CareState) {
  const shouldShowBadge = careState === 'attention' || careState === 'urgent';
  const shouldPulse = careState === 'urgent';
  const isLow = careState === 'attention' || careState === 'urgent';
  const isUrgent = careState === 'urgent';
  return { shouldShowBadge, shouldPulse, isLow, isUrgent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Derive the UI display state for a single Blobbi stat.
 *
 * Internal stats remain 0–100 (actually 1–100 per STAT_MIN).
 * This function only interprets them for display — it never mutates state.
 */
export function getBlobbiStatDisplayState(input: StatDisplayInput): StatDisplayState {
  const clamped = clamp(input.value, STAT_MIN, STAT_MAX);

  // ── Egg: always protected, always full ──────────────────────────────────
  if (input.stage === 'egg') {
    return {
      value: clamped,
      filled: BABY_SEGMENTS, // show as full (egg uses baby segment count visually)
      max: BABY_SEGMENTS,
      careState: 'protected',
      shouldShowBadge: false,
      shouldPulse: false,
      isLow: false,
      isUrgent: false,
    };
  }

  // ── Baby: 4 segments ────────────────────────────────────────────────────
  if (input.stage === 'baby') {
    const filled = toSegments(clamped, BABY_SEGMENTS);
    const careState = babyCareState(clamped);
    return {
      value: clamped,
      filled,
      max: BABY_SEGMENTS,
      careState,
      ...deriveFlags(careState),
    };
  }

  // ── Adult: 10 segments ──────────────────────────────────────────────────
  const filled = toSegments(clamped, ADULT_SEGMENTS);
  const careState = adultCareState(clamped);
  return {
    value: clamped,
    filled,
    max: ADULT_SEGMENTS,
    careState,
    ...deriveFlags(careState),
  };
}
