import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { DittoLogo } from '@/components/DittoLogo';
import { Button } from '@/components/ui/button';
import { useFirstArrivalExperience } from '@/hooks/useFirstArrivalExperience';
import { cn } from '@/lib/utils';

/**
 * Fixed points of light for Act 1. Deliberately a small, hand-picked set rather
 * than randomised: the composition is stable across renders and reloads, and
 * nothing recalculates during the sequence.
 *
 * Positions are viewport percentages; `d` is the animation delay.
 */
const SIGNALS: ReadonlyArray<{ x: string; y: string; size: number; d: string }> = [
  { x: '18%', y: '24%', size: 3, d: '0ms' },
  { x: '76%', y: '18%', size: 2, d: '120ms' },
  { x: '30%', y: '72%', size: 2, d: '240ms' },
  { x: '84%', y: '64%', size: 3, d: '80ms' },
  { x: '58%', y: '34%', size: 2, d: '300ms' },
  { x: '12%', y: '54%', size: 2, d: '180ms' },
  { x: '66%', y: '80%', size: 3, d: '360ms' },
  { x: '44%', y: '14%', size: 2, d: '420ms' },
];

/**
 * The one-time arrival transition, shown immediately after a user completes
 * signup — and only then.
 *
 * Three short acts over ~3 seconds: points of light gather (Act 1), a brief
 * welcome reads (Act 2), and the overlay dissolves to hand over to the real
 * interface (Act 3). It is a *transition*, not a loading screen: there is no
 * spinner, no percentage, no "Loading…", and it never waits on relay data. The
 * app boots normally underneath and is revealed on a fixed schedule, so a slow
 * network shows through honestly as skeletons rather than being hidden behind a
 * cinematic that refuses to end.
 *
 * Deliberately *not* an egg, a hatching, or a birth — this is an arrival into
 * a place that already exists, which is a different feeling from something
 * being born.
 *
 * Accessibility: a real focusable Skip button (auto-focused, so Enter/Space
 * work immediately and Escape also dismisses), `role="dialog"` with a label,
 * no flashing, and nothing conveyed by motion alone. Under
 * `prefers-reduced-motion` the same state machine runs with a static welcome
 * and a near-instant hand-off, so the outcome is identical.
 */
export function FirstArrivalExperience() {
  const { visible, revealing, reducedMotion, skip } = useFirstArrivalExperience();
  const intl = useIntl();
  const skipRef = useRef<HTMLButtonElement>(null);

  // Focus the skip control so keyboard users can dismiss immediately, and wire
  // Escape to the same action.
  useEffect(() => {
    if (!visible || revealing) return;
    skipRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, revealing, skip]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage({
        id: 'arrival.label',
        defaultMessage: 'Welcome to Ditto',
      })}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center',
        'bg-background',
        // Act 3 — the overlay itself fades; the app underneath is already
        // rendered and laid out, so nothing shifts when this unmounts.
        revealing && (reducedMotion ? 'opacity-0' : 'arrival-overlay-out'),
      )}
    >
      {/* Act 1 — signal. Points of light settle into place around the mark. */}
      {!reducedMotion && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {SIGNALS.map((s, i) => (
            <span
              key={i}
              className="arrival-signal absolute rounded-full bg-primary"
              style={{
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                animationDelay: s.d,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative flex flex-col items-center gap-6 px-8 text-center">
        <div className={cn('relative', !reducedMotion && 'arrival-mark')}>
          {!reducedMotion && (
            <span aria-hidden className="arrival-halo absolute inset-0 rounded-full" />
          )}
          <DittoLogo size={76} />
        </div>

        {/* Act 2 — welcome. */}
        <div className={cn('space-y-2', !reducedMotion && 'arrival-welcome')}>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            <FormattedMessage id="arrival.title" defaultMessage="Welcome to Ditto" />
          </h1>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            <FormattedMessage
              id="arrival.subtitle"
              defaultMessage="Your corner of the network is ready."
            />
          </p>
        </div>
      </div>

      <Button
        ref={skipRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={skip}
        className={cn(
          'absolute bottom-10 rounded-full px-5 text-muted-foreground hover:text-foreground',
          revealing && 'pointer-events-none opacity-0',
        )}
      >
        <FormattedMessage id="arrival.skip" defaultMessage="Skip" />
      </Button>
    </div>
  );
}
