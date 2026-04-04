/**
 * GuidedModal - Reusable tour explanation card.
 *
 * Renders a card with:
 * - Title and body text
 * - Previous / Next navigation buttons
 * - Optional close/skip action
 *
 * Used by the UI tour overlay for each step's explanation.
 * Does not position itself — the parent controls placement.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuidedModalProps {
  /** Title text */
  title: string;
  /** Body / explanation text */
  body: string;
  /** Whether a "Previous" button should be shown */
  showPrev: boolean;
  /** Whether a "Next" button should be shown */
  showNext: boolean;
  /** Label for the next button (defaults to "Next") */
  nextLabel?: string;
  /** Called when user clicks Previous */
  onPrev?: () => void;
  /** Called when user clicks Next */
  onNext?: () => void;
  /** Called when user clicks Skip/Close */
  onSkip?: () => void;
  /** Additional className for the outer container */
  className?: string;
  /** Whether the modal is visible (for enter/exit transitions) */
  visible?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GuidedModal({
  title,
  body,
  showPrev,
  showNext,
  nextLabel = 'Next',
  onPrev,
  onNext,
  onSkip,
  className,
  visible = true,
}: GuidedModalProps) {
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl',
        'transition-all duration-500 ease-out',
        visible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-95 pointer-events-none',
        className,
      )}
    >
      <div className="p-5 space-y-3">
        {title && (
          <h3 className="text-base font-semibold leading-tight">
            {title}
          </h3>
        )}
        {body && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {body}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-5 pb-4">
        {/* Left: Previous or Skip */}
        <div>
          {showPrev ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPrev}
              className="gap-1 text-muted-foreground"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          ) : onSkip ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-muted-foreground"
            >
              Skip
            </Button>
          ) : (
            <div />
          )}
        </div>

        {/* Right: Next */}
        <div>
          {showNext && (
            <Button
              size="sm"
              onClick={onNext}
              className="gap-1"
            >
              {nextLabel}
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
