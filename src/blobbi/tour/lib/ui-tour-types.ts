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
 *
 * Guide actor positions:
 * - 'modal-top': walking on top of the guided modal
 * - 'anchor':    walking on top of a UI anchor element
 * - 'hidden':    off-screen (during transitions)
 */

// ─── Guide Movement States ────────────────────────────────────────────────────

/**
 * Movement states for the MiniBlobbiGuide actor.
 *
 * These describe what the guide is doing right now, not where it is.
 * The orchestrator sets these based on the current step + transition phase.
 */
export type GuideMovement =
  | 'idle'            // Standing still
  | 'walking'         // Walking left/right
  | 'looking_down'    // Leaning forward to look at something below
  | 'falling'         // Falling downward (modal dismissed)
  | 'rising'          // Rising up from the bottom of the screen
  | 'hidden';         // Off-screen, not rendered

/**
 * Where the guide is positioned relative to.
 */
export type GuideAnchorTarget =
  | { type: 'modal' }                              // On top of the guided modal card
  | { type: 'element'; anchorId: string }           // On top a registered anchor element
  | { type: 'offscreen' };                          // Off-screen

// ─── Step Definitions ─────────────────────────────────────────────────────────

/**
 * A single UI tour step definition.
 *
 * Each step describes:
 * - Where the guide should be (guide position)
 * - What to show the user (modal content)
 * - What element to highlight (optional anchor)
 */
export interface UITourStepDef {
  /** Unique step identifier */
  id: UITourStepId;
  /**
   * Where the mini Blobbi guide should be during this step.
   * The guide walks on top of the specified target.
   */
  guideTarget: GuideAnchorTarget;
  /**
   * Modal placement for this step.
   * - 'center': centered overlay modal (e.g. welcome screen)
   * - 'bottom': anchored near the bottom bar area
   */
  modalPlacement: 'center' | 'bottom';
  /**
   * If set, this anchor element receives a highlight glow.
   * Must match an anchorId registered via TourAnchorContext.
   */
  highlightAnchor?: string;
  /** Title text for the guided modal */
  title: string;
  /** Body text for the guided modal */
  body: string;
}

// ─── Step IDs ─────────────────────────────────────────────────────────────────

/**
 * All possible step IDs for the UI tour.
 *
 * Phase 1 (implemented now):
 * - welcome:   centered welcome modal
 * - bar_item_0: first visible bottom bar item
 *
 * Future phases:
 * - bar_item_1, bar_item_2: more bar items
 * - bar_center: center action button
 * - bar_more: More dropdown
 * - more_menu_item_*: items inside the More dropdown
 * - status_hint: low stat indicators
 * - complete: terminal
 */
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
 * This is a function (not a constant) because bar item descriptions
 * depend on the current bar preferences — which items are visible
 * determines what we explain in each step.
 *
 * @param barItemLabels - Labels for the visible bar items in order (e.g. ['Blobbies'])
 * @param barItemDescriptions - Descriptions for the visible bar items in order
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

  // Add steps for each visible bar item (up to 3)
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
