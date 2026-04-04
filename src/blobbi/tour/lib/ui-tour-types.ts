/**
 * UI Tour - Types and Step Definitions
 *
 * The UI tour teaches new users the Blobbi interface after their first
 * hatch. It is separate from the first-hatch tour and uses its own
 * completion tag: `blobbi_ui_tour_done`.
 *
 * Architecture:
 * - Steps are identified by string IDs and ordered in an array.
 * - Each step declares what UI anchor it targets, what modal to show,
 *   and where the mini Blobbi guide should be.
 * - The orchestrator reads the current step and positions everything.
 * - Future phases add new steps to the array without changing the
 *   state machine or rendering infrastructure.
 */

// ─── Guide Choreography ───────────────────────────────────────────────────────

/**
 * High-level choreography intents for the MiniBlobbiGuide.
 *
 * These are NOT low-level animation states. They describe the guide's
 * role in the current moment of the walkthrough. The guide component
 * internally sequences sub-phases (peek, climb, walk, edge-look, etc.)
 * based on the active intent.
 */
export type GuideIntent =
  | 'hidden'                  // Not rendered
  | 'emerge_onto_modal'       // Rise from behind modal top edge → peek → climb up
  | 'pace_on_modal'           // Walk back and forth on modal top with edge-look behavior
  | 'fall_from_surface'       // Fall off current surface downward
  | 'emerge_onto_bar'         // Rise from behind bar top edge → peek → climb up
  | 'walk_to_target'          // Walk along bar to a specific targetX, then stop
  | 'inspect_target';         // Stopped centered above target, looking down

/**
 * Where the guide is positioned relative to.
 */
export type GuideAnchorTarget =
  | { type: 'modal' }
  | { type: 'element'; anchorId: string }
  | { type: 'offscreen' };

// ─── Step Definitions ─────────────────────────────────────────────────────────

/**
 * A single UI tour step definition.
 */
export interface UITourStepDef {
  /** Unique step identifier */
  id: UITourStepId;
  /** Where the mini Blobbi guide should be during this step */
  guideTarget: GuideAnchorTarget;
  /**
   * Modal placement:
   * - 'center': centered overlay modal (e.g. welcome screen)
   * - 'bottom': anchored near the bottom bar area
   */
  modalPlacement: 'center' | 'bottom';
  /** If set, this anchor element receives a highlight glow */
  highlightAnchor?: string;
  /** Title text for the guided modal */
  title: string;
  /** Body text for the guided modal */
  body: string;
}

// ─── Step IDs ─────────────────────────────────────────────────────────────────

export type UITourStepId =
  | 'welcome'
  | 'bar_item_0'
  | 'bar_item_1'
  | 'bar_item_2'
  | 'bar_center'
  | 'bar_more'
  | 'complete';

/**
 * Build the step definitions for the UI tour.
 *
 * Dynamic because bar item descriptions depend on which items are
 * visible in the current bar preferences.
 */
export function buildUITourSteps(
  barItemLabels: string[],
  barItemDescriptions: string[],
): UITourStepDef[] {
  const steps: UITourStepDef[] = [
    {
      id: 'welcome',
      guideTarget: { type: 'modal' },
      modalPlacement: 'center',
      title: 'Welcome to the world of Blobbi!',
      body: 'Congratulations on hatching your first Blobbi! These little creatures are here to keep you company while you explore this social world. Let me show you around.',
    },
  ];

  for (let i = 0; i < Math.min(barItemLabels.length, 3); i++) {
    const stepId = `bar_item_${i}` as UITourStepId;
    steps.push({
      id: stepId,
      guideTarget: { type: 'element', anchorId: `bar-item-${i}` },
      modalPlacement: 'bottom',
      highlightAnchor: `bar-item-${i}`,
      title: barItemLabels[i],
      body: barItemDescriptions[i],
    });
  }

  steps.push({
    id: 'complete',
    guideTarget: { type: 'offscreen' },
    modalPlacement: 'center',
    title: '',
    body: '',
  });

  return steps;
}

/** Descriptions for each BarItemId used in the tour steps */
export const BAR_ITEM_TOUR_DESCRIPTIONS: Record<string, string> = {
  blobbies: 'Check on all your Blobbies here. You can see their health, switch between them, or adopt new ones later.',
  missions: 'Complete missions to help your Blobbi grow. Missions refresh regularly and keep things interesting.',
  items: 'Browse the shop for food, toys, and other goodies. Use items to keep your Blobbi happy and healthy.',
  take_photo: 'Snap a photo of your Blobbi to share with friends. Capture their best moments!',
  set_companion: 'Set this Blobbi as your floating companion. They\'ll follow you around while you browse.',
};
