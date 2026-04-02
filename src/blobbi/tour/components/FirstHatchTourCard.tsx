/**
 * FirstHatchTourCard - Inline card shown below the egg during the first-hatch tour.
 *
 * Rendered directly in the BlobbiPage layout so the experience feels
 * focused and guided. Adapts its messaging based on the current tour step.
 *
 * When the post mission is completed, the card stays visible with a
 * celebratory completed state for ~2s (the parent auto-advances after
 * that delay). This ensures the user sees the checkmark before the
 * flow progresses to the egg-tap phase.
 */

import { Send, Check, MousePointerClick } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { FirstHatchTourStepId } from '../lib/tour-types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirstHatchTourCardProps {
  /** The Blobbi's display name */
  blobbiName: string;
  /** The exact phrase the user needs to include in their post */
  requiredPhrase: string;
  /** Whether the post mission has been completed */
  postCompleted: boolean;
  /** Open the post composer */
  onCreatePost: () => void;
  /** Advance the tour after post completion (only used during show_hatch_card) */
  onContinue: () => void;
  /** Current tour step id for adaptive messaging */
  currentStep: FirstHatchTourStepId | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FirstHatchTourCard({
  blobbiName,
  requiredPhrase,
  postCompleted,
  onCreatePost,
  onContinue: _onContinue,
  currentStep,
}: FirstHatchTourCardProps) {
  const capitalizedName = blobbiName.charAt(0).toUpperCase() + blobbiName.slice(1);

  // Determine which phase of the card to show
  const isPostStep = currentStep === 'show_hatch_card';
  const isClickStep = currentStep === 'egg_glowing_waiting_click'
    || currentStep === 'egg_crack_stage_1'
    || currentStep === 'egg_crack_stage_2'
    || currentStep === 'egg_crack_stage_3';

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      {/* Title + description */}
      <div className="text-center space-y-1.5">
        <h3 className="text-lg font-semibold">
          {isClickStep
            ? `Tap ${capitalizedName} to hatch!`
            : postCompleted && isPostStep
              ? `${capitalizedName} heard you!`
              : `${capitalizedName} is ready to hatch!`}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {isClickStep
            ? `Tap the egg to help ${capitalizedName} break free.`
            : postCompleted && isPostStep
              ? 'Your post was shared. Get ready to hatch...'
              : `Share a post to the Nostr network and help ${capitalizedName} break free.`}
        </p>
      </div>

      {/* Mission card - only during post step */}
      {isPostStep && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          {postCompleted ? (
            /* ── Completed state — celebratory, stays visible ── */
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="size-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check className="size-5 text-emerald-500" />
              </div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Post shared!
              </p>
              <p className="text-xs text-muted-foreground">
                Continuing in a moment...
              </p>
            </div>
          ) : (
            /* ── Pending state — post mission ── */
            <>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 size-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium">Share a hatch post</p>
                  <p className="text-xs text-muted-foreground">
                    Your post must include:
                  </p>
                  <p className="text-xs font-medium text-primary break-words">
                    {requiredPhrase}
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={onCreatePost}
              >
                <Send className="size-3.5 mr-2" />
                Create Post
              </Button>
            </>
          )}
        </div>
      )}

      {/* Tap hint during click steps */}
      {isClickStep && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MousePointerClick className="size-4" />
          <span>Tap the egg</span>
        </div>
      )}

      {/* Extra hint for post step */}
      {isPostStep && !postCompleted && (
        <p className="text-xs text-center text-muted-foreground">
          You can add extra text before or after the required phrase.
        </p>
      )}
    </div>
  );
}
