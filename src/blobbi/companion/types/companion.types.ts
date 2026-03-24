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
  | 'entry-inspect' // Looking around during entry inspection sequence
  | 'idle';         // Neutral/resting gaze

// ─── Entry Animation ──────────────────────────────────────────────────────────

/**
 * Entry type based on navigation direction in the sidebar.
 * - 'fall': Enter from top (falling down) - navigating DOWN the sidebar
 * - 'rise': Enter from bottom (rising up with inspection) - navigating UP the sidebar
 */
export type EntryType = 'fall' | 'rise';

/** 
 * Entry animation phases for vertical entrance sequences.
 * 
 * FALL entry (from top):
 *   idle -> stuck -> tugging -> pause -> wiggling -> falling -> landing -> complete
 * 
 * RISE entry (from bottom):
 *   idle -> rising -> inspecting -> entering -> complete
 */
export type EntryPhase =
  | 'idle'          // Not entering
  | 'stuck'         // Tiny butt visible at top, stuck (fall entry)
  | 'tugging'       // Tries to drop, gets stuck again - down-up motion (fall entry)
  | 'pause'         // Brief pause after tug - "hmm... still stuck" moment (fall entry)
  | 'wiggling'      // Subtle butt wiggle to get loose (fall entry)
  | 'falling'       // Falling from top of screen (fall entry)
  | 'landing'       // Brief landing squash/settle (fall entry)
  | 'rising'        // Rising from bottom until eyes visible (rise entry)
  | 'inspecting'    // Paused, looking around in 3 directions (rise entry)
  | 'entering'      // Continuing to rise to final position (rise entry)
  | 'complete';     // Entry finished

/** Direction to look during inspection */
export type InspectionDirection = 'up' | 'right' | 'left';

/** State for the entry animation sequence */
export interface EntryState {
  /** Type of entry animation (fall from top or rise from bottom) */
  entryType: EntryType;
  /** Current phase of the entry animation */
  phase: EntryPhase;
  /** Overall progress through the entire entry sequence (0-1) */
  progress: number;
  /** Progress within the current phase (0-1) */
  phaseProgress: number;
  /** Current inspection direction (during 'inspecting' phase) */
  inspectionDirection: InspectionDirection | null;
  /** Index of current inspection look (0, 1, 2) */
  inspectionIndex: number;
  /** Randomized order of inspection directions for this entry */
  inspectionOrder: InspectionDirection[];
  /** Timestamp when current phase started */
  phaseStartTime: number;
}

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
  /** Entry animation duration (ms) - legacy, see entry config */
  entryAnimationDuration: number;
  
  /** Vertical entry animation configuration */
  entry: {
    // ── Fall entry (from top) ──
    /** Duration of the "stuck" phase showing just the tiny butt (ms) */
    stuckDuration: number;
    /** How much of Blobbi is visible when stuck (0-1, 0.15 = tiny butt showing) */
    stuckVisibleAmount: number;
    /** Duration of the "tugging" phase - tries to fall but gets stuck (ms) */
    tuggingDuration: number;
    /** How far down the tug motion goes (0-1, as fraction of companion size) */
    tuggingDropAmount: number;
    /** Duration of pause after tug - "hmm... still stuck" beat (ms) */
    pauseDuration: number;
    /** Duration of the subtle butt wiggle animation (ms) */
    wiggleDuration: number;
    /** Horizontal wiggle intensity in pixels (subtle) */
    wiggleIntensity: number;
    /** Rotation wiggle in degrees (subtle, not full-body) */
    wiggleRotation: number;
    /** Duration of the falling phase (ms) */
    fallDuration: number;
    /** Duration of the landing squash/settle (ms) */
    landingDuration: number;
    /** Squash amount during landing (0-1, how much to compress vertically) */
    landingSquash: number;
    
    // ── Rise entry (from bottom) ──
    /** Duration of the rising phase until eyes visible (ms) */
    riseDuration: number;
    /** How much of Blobbi is visible when stopping to inspect (0-1, 0.6 = 60% visible) */
    riseVisibleAmount: number;
    /** Duration of each inspection look (ms) */
    inspectionLookDuration: number;
    /** Pause between inspection looks (ms) */
    inspectionPauseDuration: number;
    /** Duration of final rise to full position (ms) */
    enterDuration: number;
    
    // ── Shared ──
    /** Delay before restarting entry when route changes during entry (ms) */
    routeChangeRestartDelay: number;
  };
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
