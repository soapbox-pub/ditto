import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useBoundedAttention } from '@/hooks/useBoundedAttention';
import { cn } from '@/lib/utils';

export interface MissionHelperCardProps {
  /** e.g. "Step 1 of 2 — Customize your profile". */
  stepLabel: string;
  /** Card title, e.g. "Make it feel like me". */
  title: string;
  /** One short line of body copy. */
  body: string;
  /** Short helper hint under the body, e.g. "Save your profile to continue.". */
  hint?: string;
  /** When set, renders a CTA button with this label. */
  ctaLabel?: string;
  /** Fired when the CTA is clicked. */
  onCta?: () => void;
  /** Whether this step is completed (calm completed state, no attention). */
  completed?: boolean;
  className?: string;
}

/**
 * A lightweight, non-blocking helper banner shown at the top of a page during a
 * guided mission flow (currently the two-step `customize` task).
 *
 * Deliberately not a tooltip tour or a modal: it states the step, gives one
 * instruction, optionally offers a single CTA, and otherwise stays out of the
 * way. The user can ignore it entirely and use the page normally — the step
 * completes from what they actually do, not from interacting with this card.
 *
 * Attention comes from the shared `useBoundedAttention`, so it obeys the same
 * ceiling as every other mission surface: at most two cues, never off-screen,
 * never in a hidden tab, never under `prefers-reduced-motion`, and silenced for
 * good once the user touches the card.
 */
export function MissionHelperCard({
  stepLabel,
  title,
  body,
  hint,
  ctaLabel,
  onCta,
  completed = false,
  className,
}: MissionHelperCardProps) {
  const [touched, setTouched] = useState(false);

  const { ref: attentionRef, cueing, stop } = useBoundedAttention({
    enabled: !completed && !touched,
    firstDelayMs: 5_000,
  });

  const engage = () => {
    setTouched(true);
    stop();
  };

  return (
    <div ref={attentionRef} className={cn(cueing && 'mission-attention-nudge', className)}>
      <div
        onMouseEnter={engage}
        onFocusCapture={engage}
        onPointerDown={engage}
        className={cn(
          'rounded-xl border bg-card/80 backdrop-blur-sm p-4 sm:p-5',
          'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4',
          completed ? 'border-primary/40' : 'border-primary/30',
          cueing && 'mission-attention-glow',
        )}
        role="status"
        aria-live="polite"
      >
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            completed ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          {completed ? <Check className="size-5" /> : <Sparkles className="size-5" />}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
            {stepLabel}
          </span>
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          {hint && <p className="text-xs font-medium text-primary/90">{hint}</p>}
        </div>

        {ctaLabel && (
          <div className="shrink-0 self-stretch sm:self-center">
            <Button
              type="button"
              onClick={() => {
                engage();
                onCta?.();
              }}
              size="sm"
              className="w-full rounded-full px-5 font-bold sm:w-auto"
            >
              {ctaLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
