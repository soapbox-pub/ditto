/**
 * useInteractionReaction — Temporary visual reward reactions for care actions.
 *
 * Manages a short-lived reaction that overrides the Blobbi's facial expression
 * and triggers particle overlays (sparkles, bubbles, hearts) for a fixed
 * duration after a care action succeeds.
 *
 * This layer sits *above* the persistent status-reaction system:
 *   1. When active, the reaction's recipe override and body animation are used
 *   2. When the reaction expires, control returns to useStatusReaction
 *
 * Reactions are purely ephemeral — nothing is persisted, published, or encoded
 * into kind 31124. The hook manages its own lifecycle via setTimeout.
 *
 * @module useInteractionReaction
 */

import { useState, useCallback, useRef } from 'react';
import type { BlobbiEmotion } from '../lib/emotion-types';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Interaction types that produce unique visual reactions.
 * `clean_complete` is a special variant detected when cleaning removes
 * the visibly dirty state entirely.
 */
export type InteractionReactionType =
  | 'feed'
  | 'medicate'
  | 'play'
  | 'clean'
  | 'clean_complete'
  | 'social_hearts';

/** Phase of a multi-phase reaction (e.g. clean_complete: bubbles → sparkles). */
type ReactionPhase = 'primary' | 'secondary';

/** Active reaction state. */
interface ActiveReaction {
  type: InteractionReactionType;
  phase: ReactionPhase;
  /** Emotion override for the status reaction system. */
  emotion: BlobbiEmotion | null;
  /** CSS class to add to the Blobbi animation container. */
  bodyAnimation: string | null;
  /** Whether to show sparkle particles. */
  sparkles: boolean;
  /** Whether to show bubble wash overlay. */
  bubbles: boolean;
  /** Whether to show floating hearts. */
  hearts: boolean;
}

/** Public state returned by the hook. */
export interface InteractionReactionState {
  /** Current emotion override (null = no override, status system drives). */
  emotionOverride: BlobbiEmotion | null;
  /** CSS animation class for the body container. */
  bodyAnimation: string | null;
  /** Show sparkle overlay. */
  sparkles: boolean;
  /** Show bubble wash overlay. */
  bubbles: boolean;
  /** Show floating hearts. */
  hearts: boolean;
  /** Whether any reaction is currently active. */
  isActive: boolean;
}

export interface UseInteractionReactionReturn {
  /** Current reaction visual state. */
  state: InteractionReactionState;
  /** Trigger a new interaction reaction. Replaces any in-progress reaction. */
  trigger: (type: InteractionReactionType) => void;
}

/**
 * Maps InventoryAction names (used by the care/item system) to
 * InteractionReactionType names (used by the visual reaction layer).
 *
 * Shared by NoteCard, PostDetailPage, and any surface that triggers
 * interaction reactions on behalf of a social action.
 */
export const INVENTORY_TO_REACTION: Record<string, InteractionReactionType> = {
  feed: 'feed',
  play: 'play',
  clean: 'clean',
  medicine: 'medicate',
  // Intentionally reuses 'feed' animation — no dedicated boost visual exists yet.
  boost: 'feed',
};

// ─── Reaction Definitions ────────────────────────────────────────────────────

/**
 * Durations in milliseconds for each reaction type / phase.
 */
const REACTION_DURATIONS: Record<InteractionReactionType, { primary: number; secondary?: number }> = {
  feed:           { primary: 1800 },
  medicate:       { primary: 1800 },
  play:           { primary: 2000 },
  clean:          { primary: 1500 },
  clean_complete: { primary: 1200, secondary: 1500 },
  social_hearts:  { primary: 2500 },
};

/**
 * Build the ActiveReaction for a given type and phase.
 */
function buildReaction(type: InteractionReactionType, phase: ReactionPhase): ActiveReaction {
  switch (type) {
    case 'feed':
      // Closed happy eyes (^_^ squint), big smile, gentle wiggle
      return {
        type, phase,
        emotion: 'blissful',
        bodyAnimation: 'animate-reaction-wiggle',
        sparkles: false, bubbles: false, hearts: false,
      };

    case 'medicate':
      // Adoring eyes (white dots), reluctant mouth → 'adoring' maps to
      // watery eyes (glistening white circles) + small round mouth
      return {
        type, phase,
        emotion: 'adoring',
        bodyAnimation: null,
        sparkles: false, bubbles: false, hearts: false,
      };

    case 'play':
      // Star eyes, joyful bouncing
      return {
        type, phase,
        emotion: 'excited',
        bodyAnimation: 'animate-reaction-bounce',
        sparkles: false, bubbles: false, hearts: false,
      };

    case 'clean':
      // Sparkles around Blobbi
      return {
        type, phase,
        emotion: null,
        bodyAnimation: null,
        sparkles: true, bubbles: false, hearts: false,
      };

    case 'clean_complete':
      if (phase === 'primary') {
        // Phase 1: bubbles cover Blobbi
        return {
          type, phase,
          emotion: null,
          bodyAnimation: null,
          sparkles: false, bubbles: true, hearts: false,
        };
      }
      // Phase 2: bubbles gone, sparkles appear, blissful face
      return {
        type, phase,
        emotion: 'blissful',
        bodyAnimation: null,
        sparkles: true, bubbles: false, hearts: false,
      };

    case 'social_hearts':
      // Subtle floating hearts
      return {
        type, phase,
        emotion: null,
        bodyAnimation: null,
        sparkles: false, bubbles: false, hearts: true,
      };
  }
}

// ─── Idle state constant ─────────────────────────────────────────────────────

const IDLE_STATE: InteractionReactionState = {
  emotionOverride: null,
  bodyAnimation: null,
  sparkles: false,
  bubbles: false,
  hearts: false,
  isActive: false,
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useInteractionReaction(): UseInteractionReactionReturn {
  const [reaction, setReaction] = useState<ActiveReaction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedulePhase = useCallback((
    type: InteractionReactionType,
    phase: ReactionPhase,
    delay: number,
  ) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      const durations = REACTION_DURATIONS[type];

      if (phase === 'primary' && durations.secondary !== undefined) {
        // Transition to secondary phase
        setReaction(buildReaction(type, 'secondary'));
        timerRef.current = setTimeout(() => {
          setReaction(null);
          timerRef.current = null;
        }, durations.secondary);
      } else {
        // End reaction
        setReaction(null);
        timerRef.current = null;
      }
    }, delay);
  }, [clearTimer]);

  const trigger = useCallback((type: InteractionReactionType) => {
    clearTimer();

    const initial = buildReaction(type, 'primary');
    setReaction(initial);

    const durations = REACTION_DURATIONS[type];
    schedulePhase(type, 'primary', durations.primary);
  }, [clearTimer, schedulePhase]);

  const state: InteractionReactionState = reaction
    ? {
        emotionOverride: reaction.emotion,
        bodyAnimation: reaction.bodyAnimation,
        sparkles: reaction.sparkles,
        bubbles: reaction.bubbles,
        hearts: reaction.hearts,
        isActive: true,
      }
    : IDLE_STATE;

  return { state, trigger };
}
