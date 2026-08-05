import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { missionDevArrivalEntry } from '@/dev/missionHarness';
import { DittoLogo } from '@/components/DittoLogo';
import { ExplorerArrivalCard } from '@/components/ExplorerArrivalCard';
import { ExplorerArrivalIntro } from '@/components/ExplorerArrivalIntro';
import { ExplorerArrivalReassurance } from '@/components/ExplorerArrivalReassurance';
import { Button } from '@/components/ui/button';
import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';
import {
  isCompactCardContentVisible,
  isFullCardContentVisible,
  isIntroCopyVisible,
  isPresentationStage,
  isReadingBeat,
  isReassuranceVisible,
  isWelcomeStage,
  useArrivalStage,
} from '@/hooks/useArrivalStage';
import { useExplorerArrivalTransition } from '@/hooks/useExplorerArrivalTransition';
import { useFirstArrivalExperience } from '@/hooks/useFirstArrivalExperience';
import { cn } from '@/lib/utils';

/**
 * Fixed points of light for the opening beat. Deliberately a hand-picked set
 * rather than randomised: the composition is stable across renders and reloads,
 * and nothing recalculates during the sequence.
 */
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
 * A sequence of acts (see `useArrivalStage`), each with exactly **one text
 * owner**: points of light gather; "Welcome to Ditto" reads alone; the welcome
 * leaves; the Ditto Explorer introduction assembles around its card and holds
 * still long enough to be read; the framing copy and the reassurance leave; the
 * backdrop dissolves so the real application appears behind the card; the card's
 * body changes to its destination form; and the card travels to wherever the
 * persistent Explorer surface lives and becomes it.
 *
 * That last act is the point. A fade between two unrelated components teaches
 * nothing; a card that visibly moves and simplifies into the sidebar widget
 * teaches the user where their mission now lives.
 *
 * ### Layering
 *
 * Explicit stacking, one concern per layer, rather than one container whose
 * children crossfade against each other:
 *
 * | z  | layer                                  |
 * |----|----------------------------------------|
 * | 0  | backdrop (dissolves to reveal the app) |
 * | 10 | signal points                          |
 * | 20 | welcome                                |
 * | 30 | Explorer presentation (copy + card + reassurance) |
 * | 40 | Skip (its own pointer-active island)   |
 *
 * The welcome and the presentation are never mounted at the same time — the
 * acts guarantee it — so no two pieces of copy can be readable at once.
 *
 * **It is a transition, not a loader.** No spinner, no percentage, no
 * "Loading…", and it never waits on relay data. It also never waits on a click:
 * the card hands itself over, and the user makes their choice afterwards on the
 * destination.
 *
 * Deliberately not an egg, a hatching, or a birth — this is an arrival into a
 * place that already exists. The astronaut behind the lock stays unrevealed.
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

  const stage = useArrivalStage({
    phase,
    reducedMotion,
    entry: missionDevArrivalEntry(),
  });

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
    if (!visible) return;
    if (!travelling) skipRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, travelling, skip]);

  if (!visible) return null;

  const showWelcome = isWelcomeStage(stage);
  const showPresentation = isPresentationStage(stage);
  const introVisible = isIntroCopyVisible(stage);
  const reassuranceVisible = isReassuranceVisible(stage);
  const fullContent = isFullCardContentVisible(stage);
  const compactContent = isCompactCardContentVisible(stage);
  const ambient = isReadingBeat(stage) && !reducedMotion;

  return (
    <div
      role="dialog"
      aria-modal={!revealing}
      aria-label={intl.formatMessage({
        id: 'arrival.label',
        defaultMessage: 'Welcome to Ditto',
      })}
      className={cn(
        'fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 px-5 py-8',
        // Once the backdrop is dissolving the overlay must not swallow clicks:
        // the application behind it is live from that moment on.
        revealing && 'pointer-events-none',
      )}
    >
      {/* Layer 0 — backdrop. Fades through clearly perceptible intermediate
          steps, with the blur easing off at the same time, so the application
          is revealed gradually rather than appearing all at once. */}
      <div
        aria-hidden
        data-arrival-backdrop=""
        className={cn(
          'absolute inset-0 z-0 bg-background',
          revealing &&
            (reducedMotion
              ? 'opacity-0 transition-opacity duration-200'
              : 'arrival-backdrop-out'),
        )}
      />

      {/* Layer 10 — signal. */}
      {!reducedMotion && !revealing && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
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

      {/* Layer 20 — welcome. Unmounted before the presentation mounts, so the
          two can never be readable at the same time. */}
      {showWelcome && (
        <div
          data-arrival-welcome=""
          className={cn(
            'relative z-20',
            // The exit lives on this wrapper and *only* this wrapper. It used to
            // share an element with the `arrival-mark` entrance, and because that
            // animation fills forwards, removing it in the same frame as
            // `opacity-0` made Chrome skip the transition entirely: the welcome
            // snapped from 1 to 0 in a single frame. Measured, not theorised.
            // Separating the animated element from the transitioned one is what
            // makes the exit an act rather than a cut.
            'transition-all duration-500 ease-out',
            stage === 'welcome-out' && 'pointer-events-none -translate-y-2 opacity-0',
          )}
        >
          <div
            className={cn(
              'flex flex-col items-center gap-4 text-center',
              !reducedMotion && 'arrival-mark',
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
        </div>
      )}

      {/* Layer 30 — the Explorer presentation. The heading is a sibling of the
          card, never a child: only the card travels, and the framing copy is
          gone before it does. It stays in flow while faded so the card beneath
          it never shifts. */}
      {showPresentation && (
        <div className="relative z-30 flex flex-col items-center gap-5 [@media(max-height:720px)]:gap-3">
          <ExplorerArrivalIntro visible={introVisible} reducedMotion={reducedMotion} />
          <ExplorerArrivalCard
            ref={cardRef}
            showFullContent={fullContent}
            showCompactContent={compactContent}
            travelling={travelling}
            ambient={ambient}
            reducedMotion={reducedMotion}
            className={cn(
              'pointer-events-auto',
              !reducedMotion && fullContent && 'arrival-card-in',
              // Reduced motion: no travel. The card crossfades out in place
              // once its contents have finished changing mode, while the real
              // destination fades up underneath.
              reducedMotion && compactContent && 'opacity-0 transition-opacity duration-300',
            )}
          />
          {/* Below the card, and a sibling of it — see the component. */}
          <ExplorerArrivalReassurance
            visible={reassuranceVisible}
            reducedMotion={reducedMotion}
            className="-mt-1 [@media(max-height:720px)]:-mt-0.5"
          />
        </div>
      )}

      {/* Layer 40 — Skip. Its own pointer-active island: the overlay root stops
          taking events once the application is live behind it, but this control
          keeps taking them for as long as it is on screen. It used to be
          switched off at the same moment it began fading, which left roughly a
          third of a second of a visible button that ignored clicks — and on
          mobile there is no Escape to fall back on. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center pb-8 [@media(max-height:759px)]:static [@media(max-height:759px)]:pb-0">
        <Button
          ref={skipRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={skip}
          className="pointer-events-auto shrink-0 rounded-full px-5 text-muted-foreground hover:text-foreground"
        >
          <FormattedMessage id="arrival.skip" defaultMessage="Skip" />
        </Button>
      </div>
    </div>
  );
}
