/**
 * Blobbi Companion Type Definitions
 * 
 * Core types for the companion system. Keep these generic and
 * decoupled from app-specific concerns.
 */

import type { BlobbiVisualTraits } from '@/lib/blobbi';

// ─── Companion State Machine ──────────────────────────────────────────────────

/** Primary behavioral states for the companion */
export type CompanionState = 
  | 'idle'      // Standing still, looking around
  | 'walking'   // Moving to a destination
  | 'watching'  // Observing a specific target (after walking to it)
  | 'attending'; // Temporarily focused on UI change (highest priority)

/** Direction the companion is facing/moving */
export type CompanionDirection = 'left' | 'right';

/** Gaze behavior modes */
export type GazeMode = 
  | 'forward'       // Looking in movement direction
  | 'random'        // Random screen observation
  | 'follow-mouse'  // Following cursor
  | 'observe-target'// Looking at a specific observation target
  | 'attend-ui'     // Looking at a UI element that appeared
  | 'idle';         // Neutral/resting gaze

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

// ─── Attention System ─────────────────────────────────────────────────────────

/** 
 * Priority levels for attention events.
 * Higher priority interrupts lower priority behaviors.
 */
export type AttentionPriority = 'low' | 'normal' | 'high';

/**
 * An attention target that the companion should focus on.
 * Used for reacting to UI changes like modals, dialogs, etc.
 */
export interface AttentionTarget {
  /** Unique identifier for this attention event */
  id: string;
  /** Screen position to look at */
  position: Position;
  /** How long to attend to this target (ms) */
  duration: number;
  /** Priority level - higher priority overrides current behavior */
  priority: AttentionPriority;
  /** Optional: source element selector for debugging */
  source?: string;
  /** Timestamp when this attention was triggered */
  triggeredAt: number;
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
  /** Adult evolution form type (e.g., 'catti', 'pupp', 'buni') - only for adults */
  adultType?: string;
  /** Deterministic seed for deriving traits */
  seed?: string;
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
  /** Layout reference points */
  layout: {
    /** Width of the left sidebar */
    sidebarWidth: number;
    /** Max width of the main layout container */
    maxContentWidth: number;
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
  /** Observation target behavior - Blobbi notices something and walks toward it */
  observation: {
    /** Probability of starting observation when deciding next action (0-1) */
    chance: number;
    /** Minimum time between observation behaviors (ms) */
    cooldown: number;
    /** How long to look at target after arriving (ms) */
    lookDuration: { min: number; max: number };
    /** How close to get to the target X position (pixels) */
    targetPadding: number;
  };
  /** UI attention behavior - reacting to new UI elements appearing */
  attention: {
    /** Default duration to attend to UI changes (ms) */
    defaultDuration: number;
    /** Minimum time between attention events (ms) to avoid spamming */
    cooldown: number;
    /** Duration for brief glances (tabs, minor UI changes) (ms) */
    glanceDuration: number;
    /** Shorter cooldown for glances (ms) */
    glanceCooldown: number;
    /** Duration to look at main content after route entry (ms) */
    postRouteDuration: number;
    /** Delay before post-route attention starts (ms) */
    postRouteDelay: number;
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
