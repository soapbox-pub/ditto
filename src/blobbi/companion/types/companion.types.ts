/**
 * Blobbi Companion Type Definitions
 * 
 * Core types for the companion system. Keep these generic and
 * decoupled from app-specific concerns.
 */

import type { BlobbiVisualTraits } from '@/lib/blobbi';

// ─── Companion State Machine ──────────────────────────────────────────────────

/** Primary behavioral states for the companion */
export type CompanionState = 'idle' | 'walking' | 'watching';

/** Direction the companion is facing/moving */
export type CompanionDirection = 'left' | 'right';

/** Gaze behavior modes */
export type GazeMode = 
  | 'forward'      // Looking in movement direction
  | 'random'       // Random screen observation
  | 'follow-mouse' // Following cursor
  | 'idle';        // Neutral/resting gaze

// ─── Position & Motion ────────────────────────────────────────────────────────

export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

/** Bounds for companion movement area */
export interface MovementBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Motion state for the companion */
export interface CompanionMotion {
  position: Position;
  velocity: Velocity;
  direction: CompanionDirection;
  isGrounded: boolean;
  isDragging: boolean;
}

// ─── Gaze & Eyes ──────────────────────────────────────────────────────────────

/** Eye offset from center (-1 to 1 for both axes) */
export interface EyeOffset {
  x: number; // -1 = full left, 0 = center, 1 = full right
  y: number; // -1 = full up, 0 = center, 1 = full down
}

export interface GazeState {
  mode: GazeMode;
  offset: EyeOffset;
  target: Position | null;
  lastMouseFollowTime: number;
}

// ─── Companion Data ───────────────────────────────────────────────────────────

/** Minimal data needed to render a companion */
export interface CompanionData {
  /** The d-tag identifier */
  d: string;
  /** Display name */
  name: string;
  /** Current stage */
  stage: 'egg' | 'baby' | 'adult';
  /** Visual traits for rendering */
  visualTraits: BlobbiVisualTraits;
  /** Current energy level (0-100) - affects walking speed */
  energy: number;
}

// ─── Companion Config ─────────────────────────────────────────────────────────

export interface CompanionConfig {
  /** Size of the companion in pixels */
  size: number;
  /** Padding from viewport edges */
  padding: {
    left: number;
    right: number;
    bottom: number;
  };
  /** Walking speed range (pixels per second) */
  walkSpeed: {
    min: number; // At 0 energy
    max: number; // At 100 energy
  };
  /** Gravity acceleration (pixels per second squared) */
  gravity: number;
  /** How long to stay idle before maybe walking (ms) */
  idleTime: {
    min: number;
    max: number;
  };
  /** How long to walk before stopping (ms) */
  walkTime: {
    min: number;
    max: number;
  };
  /** Gaze behavior timing */
  gaze: {
    /** How often to change random gaze target (ms) */
    randomInterval: { min: number; max: number };
    /** Minimum time between mouse-follow events (ms) */
    mouseFollowCooldown: number;
    /** Duration of mouse-follow mode (ms) */
    mouseFollowDuration: number;
    /** Probability of entering mouse-follow mode (0-1) */
    mouseFollowChance: number;
  };
  /** Entry animation duration (ms) */
  entryAnimationDuration: number;
}

// ─── Companion Context ────────────────────────────────────────────────────────

export interface CompanionContextValue {
  /** The current companion data, if any */
  companion: CompanionData | null;
  /** Whether the companion data is loading */
  isLoading: boolean;
  /** Whether the companion is currently visible */
  isVisible: boolean;
  /** Current behavioral state */
  state: CompanionState;
  /** Current motion state */
  motion: CompanionMotion;
  /** Current gaze state */
  gaze: GazeState;
  /** Start dragging the companion */
  startDrag: () => void;
  /** Update drag position */
  updateDrag: (position: Position) => void;
  /** End dragging */
  endDrag: () => void;
}

// ─── Event Types ──────────────────────────────────────────────────────────────

/** Events that can trigger companion behavior changes */
export type CompanionEvent =
  | { type: 'ROUTE_CHANGE' }
  | { type: 'START_DRAG' }
  | { type: 'UPDATE_DRAG'; position: Position }
  | { type: 'END_DRAG' }
  | { type: 'TICK'; deltaTime: number }
  | { type: 'DECIDE_ACTION' }
  | { type: 'REACHED_TARGET' }
  | { type: 'MOUSE_MOVE'; position: Position };
