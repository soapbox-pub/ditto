import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { missionDevArrivalEntry } from '@/dev/missionHarness';
import { DittoLogo } from '@/components/DittoLogo';
import { ExplorerArrivalCard } from '@/components/ExplorerArrivalCard';
import { Button } from '@/components/ui/button';
import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';
import { useExplorerArrivalTransition } from '@/hooks/useExplorerArrivalTransition';
import { useFirstArrivalExperience } from '@/hooks/useFirstArrivalExperience';
import { cn } from '@/lib/utils';

/**
 * Fixed points of light for the opening beat. Deliberately a hand-picked set
 * rather than randomised: the composition is stable across renders and reloads,
 * and nothing recalculates during the sequence.
 */
/**
 * When the Explorer card takes over the centre, measured from the start of the
 * sequence. The mark and welcome get the first beat to themselves; the card
 * then has a readable moment before the application appears behind it.
 */
const CARD_AT_MS = 1_500;
/** Reduced motion holds a single composed frame, so the card arrives at once. */
const REDUCED_CARD_AT_MS = 0;
/** How long the welcome takes to fade out once the card takes the centre. */
const WELCOME_FADE_MS = 500;

const SIGNALS: ReadonlyArray<{ x: string; y: string; size: number; d: string }> = [
  { x: '18%', y: '24%', size: 3, d: '0ms' },
  { x: '76%', y: '18%', size: 2, d: '120ms' },
  { x: '30%', y: '72%', size: 2, d: '240ms' },
  { x: '84%', y: '64%', size: 3, d: '80ms' },
  { x: '58%', y: '30%', size: 2, d: '300ms' },
  { x: '12%', y: '54%', size: 2, d: '180ms' },
  { x: '66%', y: '80%', size: 3, d: '360ms' },
  { x: '44%', y: '14%', size: 2, d: '420ms' },
];

/**
 * The one-time arrival transition, shown immediately after a user completes
 * signup — and only then.
 *
 * Four beats over roughly four seconds:
 *
 *  1. **Signal** — points of light gather and the Ditto mark forms.
 *  2. **Welcome** — a short line reads.
 *  3. **Explorer** — the full Ditto Explorer presentation rises into the
 *     centre: what it is, and that a locked reward waits at the end. Not the
 *     task list.
 *  4. **Handoff** — the backdrop dissolves so the real application appears
 *     behind the card, then the card *travels* to wherever the persistent
 *     Explorer surface lives and becomes it.
 *
 * That last beat is the point of the whole thing. A fade between two unrelated
 * components teaches nothing; a card that visibly moves and simplifies into the
 * sidebar widget teaches the user where their mission now lives, so they can
 * find it again tomorrow.
 *
 * **It is a transition, not a loader.** No spinner, no percentage, no
 * "Loading…", and it never waits on relay data — the app boots normally
 * underneath and is revealed on a fixed schedule, so a slow network shows
 * through honestly as skeletons rather than hiding behind a cinematic that
 * refuses to end. It also never waits on a click: the card hands itself over.
 *
 * Deliberately not an egg, a hatching, or a birth — this is an arrival into a
 * place that already exists, which is a different feeling from something being
 * born. The astronaut behind the lock stays unrevealed.
 *
 * Accessibility: a real focusable Skip button (auto-focused, so Enter/Space work
 * immediately, with Escape wired to the same action), `role="dialog"` with a
 * label, no flashing, and nothing conveyed by motion alone. Under
 * `prefers-reduced-motion` the card does not travel — it crossfades to the
 * destination in place — and the same lifecycle reaches the same end state.
 */
export function FirstArrivalExperience() {
  const {
    phase,
    visible,
    revealing,
    travelling,
    reducedMotion,
    skip,
    completeTravel,
  } = useFirstArrivalExperience();
  const { claim, release } = useExplorerArrival();
  const intl = useIntl();
  const skipRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Sub-beat inside `playing`: the welcome reads first, then the Explorer card
  // rises. Kept local because it is pure staging — the lifecycle machine has no
  // reason to know about it.
  // The harness can start at a later beat so the handoff — the part worth
  // iterating on — doesn't cost three seconds of waiting each time.
  const [showExplorer, setShowExplorer] = useState(
    () => missionDevArrivalEntry() === 'card' || missionDevArrivalEntry() === 'handoff',
  );
  // The welcome is unmounted once it has finished fading, rather than left
  // behind at zero opacity — a transparent element still stacks, and leaving it
  // in place let the mark show through the card.
  const [welcomeGone, setWelcomeGone] = useState(showExplorer);

  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setTimeout(
      () => setShowExplorer(true),
      reducedMotion ? REDUCED_CARD_AT_MS : CARD_AT_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (!showExplorer || welcomeGone) return;
    const timer = setTimeout(() => setWelcomeGone(true), WELCOME_FADE_MS);
    return () => clearTimeout(timer);
  }, [showExplorer, welcomeGone]);

  // Take ownership of the Explorer surface for as long as the overlay is up, so
  // the destination stays laid out (measurable, no shift at handoff) but
  // unpainted. Released by the transition at handoff, and unconditionally on
  // unmount so an interrupted arrival can never leave it hidden.
  useEffect(() => {
    if (!visible) return;
    claim();
    return () => release();
  }, [visible, claim, release]);

  useExplorerArrivalTransition({
    cardRef,
    active: travelling,
    onComplete: completeTravel,
  });

  // Focus the skip control so keyboard users can dismiss immediately, and wire
  // Escape to the same action. Dropped once the card starts travelling — by
  // then the application behind it is the thing to interact with.
  useEffect(() => {
    if (!visible || travelling) return;
    skipRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, travelling, skip]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal={!revealing}
      aria-label={intl.formatMessage({
        id: 'arrival.label',
        defaultMessage: 'Welcome to Ditto',
      })}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center',
        // Once the backdrop has dissolved the overlay must not swallow clicks:
        // the application behind it is live from that moment on.
        revealing && 'pointer-events-none',
      )}
    >
      {/* Backdrop. Dissolves at the reveal so the real interface shows through,
          while the card stays put and then travels. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-background',
          revealing && (reducedMotion ? 'opacity-0' : 'arrival-backdrop-out'),
        )}
      />

      {/* Signal — points of light settling into place. */}
      {!reducedMotion && !revealing && (
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

      {/* A single-cell grid so the welcome and the card occupy exactly the same
          centred spot and cross over in place, with the card stacked above. */}
      <div className="relative grid place-items-center px-5">
        {/* Mark + welcome — the first beat, which steps aside for the card. */}
        {!welcomeGone && (
        <div
          className={cn(
            'col-start-1 row-start-1 z-0 flex flex-col items-center gap-4 text-center',
            'transition-all duration-500',
            !reducedMotion && 'arrival-mark',
            showExplorer && 'pointer-events-none scale-90 opacity-0',
          )}
        >
          <div className="relative">
            {!reducedMotion && (
              <span aria-hidden className="arrival-halo absolute inset-0 rounded-full" />
            )}
            <DittoLogo size={72} />
          </div>
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
        )}

        {/* The Explorer presentation — and the object that travels. */}
        {showExplorer && (
          <ExplorerArrivalCard
            ref={cardRef}
            simplified={travelling}
            travelling={travelling}
            className={cn(
              'col-start-1 row-start-1 z-10 pointer-events-auto',
              !reducedMotion && !travelling && 'arrival-card-in',
              // Reduced motion: no travel, just a crossfade in place while the
              // real destination fades up underneath.
              reducedMotion && revealing && 'opacity-0 transition-opacity duration-200',
            )}
          />
        )}
      </div>

      <Button
        ref={skipRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={skip}
        className={cn(
          'pointer-events-auto absolute bottom-10 rounded-full px-5 text-muted-foreground hover:text-foreground',
          revealing && 'pointer-events-none opacity-0 transition-opacity duration-300',
        )}
      >
        <FormattedMessage id="arrival.skip" defaultMessage="Skip" />
      </Button>
    </div>
  );
}
