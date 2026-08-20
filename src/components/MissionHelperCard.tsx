import { useId, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';

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
 * guided mission flow — the Search page for `find-people`, profile and theme
 * settings for `customize`, the feed for `interact`.
 *
 * Deliberately not a tooltip tour or a modal: it states the step, gives one
 * instruction, optionally offers a single CTA, and otherwise stays out of the
 * way. The user can ignore it entirely and use the page normally — the step
 * completes from what they actually do, not from interacting with this card.
 *
 * ### Collapsing
 *
 * Guidance that cannot be put away stops being guidance and becomes furniture,
 * and this sits above the very controls the task is about — the search field,
 * the profile form, the feed. So the card is a disclosure: the header is always
 * there, saying which task is running, and the instruction underneath can be
 * folded away and brought back.
 *
 * The header is the whole affordance rather than a chevron the user has to aim
 * at, built as the standard heading-wrapping-a-button pattern so the title is
 * still a heading in the accessibility tree and the control still reports
 * `aria-expanded` for the region it owns. The body is hidden rather than
 * unmounted, which keeps `aria-controls` pointing at something real and lets
 * the live region announce the instruction when it comes back.
 *
 * It opens expanded: the first thing a user needs is to be told what to do.
 * Collapsed state is per mount and deliberately not persisted — a task that has
 * moved on should not inherit the last one's dismissal, and re-opening is one
 * tap on a header that never left.
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
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();

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
          'flex flex-col gap-3',
          completed ? 'border-primary/40' : 'border-primary/30',
          cueing && 'mission-attention-glow',
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              completed ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
            )}
          >
            {completed ? <Check className="size-5" /> : <Sparkles className="size-5" />}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary">
              {stepLabel}
            </span>
            {/* Heading wrapping the disclosure control: the title keeps its
                place in the document outline, and the whole line — not a small
                chevron — is what the user presses. */}
            <h3 className="text-base font-bold leading-tight">
              <button
                type="button"
                onClick={() => {
                  engage();
                  setExpanded((open) => !open);
                }}
                aria-expanded={expanded}
                aria-controls={bodyId}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm text-left',
                  // Padded out and pulled back in: a bold-16px line is a ~20px
                  // tap target, which is not one. The negative margin means the
                  // card looks exactly as it did while the control is worth
                  // aiming at, and it spans the full width so there is nothing
                  // to aim at horizontally.
                  '-my-2 py-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span className="min-w-0 flex-1">{title}</span>
                <span className="sr-only">
                  {expanded ? '— hide the instruction' : '— show the instruction'}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                    !expanded && '-rotate-90',
                  )}
                />
              </button>
            </h3>
          </div>
        </div>

        {/* Hidden rather than unmounted: `aria-controls` stays valid, and the
            instruction is announced by the live region when it returns. Indented
            on wide screens so it lines up under the title instead of under the
            icon.

            Both the attribute and the class: `[hidden]` is a user-agent rule and
            loses to any `display` utility, so the attribute alone would leave a
            "hidden" card fully visible. The attribute carries the semantics, the
            class carries the pixels. */}
        <div
          id={bodyId}
          hidden={!expanded}
          className={cn(
            expanded
              ? 'flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:pl-14'
              : 'hidden',
          )}
        >
          <div className="min-w-0 flex-1 space-y-1">
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
    </div>
  );
}
