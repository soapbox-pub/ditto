import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { Award, RotateCcw, Sparkles } from 'lucide-react';

import { ExplorerRewardArt } from '@/components/MissionArt';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { easeTravel, travelDurationFor } from '@/lib/sharedElementTravel';
import type { RewardCeremonyPhase } from '@/hooks/useRewardCeremony';
import { prefersReducedMotion } from '@/lib/reducedMotion';
import { cn } from '@/lib/utils';

/**
 * How big the sealed reward is on the ceremony stage.
 *
 * A number rather than a class because `ExplorerRewardArt` derives its blur from
 * its rendered size, and the whole point of that is that the treatment cannot
 * weaken as the reward grows. Recomputed on resize and orientation change, so a
 * phone turned sideways mid-ceremony re-lays-out rather than overflowing.
 */
function ceremonyArtSize(width: number, height: number): number {
  if (width >= 640) return 320;
  // Short viewports (a landscape phone, or a browser with a lot of chrome) get
  // the smaller reward so the copy and the Close control stay on screen.
  const base = Math.min(width * 0.62, 260);
  return height <= 640 ? Math.min(base, 200) : Math.round(base);
}

function useCeremonyArtSize(): number {
  const [size, setSize] = useState(() =>
    typeof window === 'undefined'
      ? 320
      : ceremonyArtSize(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    const measure = () => setSize(ceremonyArtSize(window.innerWidth, window.innerHeight));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return size;
}

/** The transform that would place an element exactly over a previous box. */
function transformOnto(from: DOMRect, to: DOMRect) {
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: to.width > 0 ? from.width / to.width : 1,
  };
}

/**
 * A rect is only worth flying from if it is real and roughly on screen. A reward
 * that was scrolled out of view, or collapsed to nothing by a layout still
 * settling, would otherwise send the ceremony flying in from somewhere the user
 * never saw it.
 */
function isUsableRect(rect: DOMRect | null): rect is DOMRect {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  if (typeof window === 'undefined') return false;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/**
 * The stage the reward reveal will eventually happen on.
 *
 * It takes the sealed reward the user clicked, carries it to the middle of a
 * quietened screen, waits for them, publishes the badge claim on their gesture,
 * and takes the seal off the reward the moment that claim lands.
 *
 * The claim *policy* is `useBadgeClaim`'s and the phases are
 * `useRewardCeremony`'s; this owns the stage. The one thing worth remembering
 * here: `revealedAt` is persisted before the choreography starts, so every way
 * out of it — Skip, Escape, Back, a reload — lands on the same revealed reward.
 *
 * ### What travels, and what does not
 *
 * Only the sealed reward object. The panel's chrome — its "Special reward"
 * label, its copy, its button — stays on `/missions` and the ceremony's own copy
 * fades in around the arriving reward. Flying the whole card across the screen
 * was the alternative, and it reads as a *panel opening* rather than as *this
 * object I just touched*, which is the one thing the travel exists to say. The
 * source art is hidden (laid out, not painted) for as long as the ceremony owns
 * it, so there are never two of the same object on screen.
 *
 * ### Why this is not the arrival's transition
 *
 * `useExplorerArrivalTransition` is bound to `ExplorerArrivalContext`'s
 * claim/release ownership of a persistent surface and to a once-per-account
 * lifecycle; reusing it would couple two unrelated state machines for the sake
 * of an animation. What *is* shared is the movement itself — `easeTravel` and
 * `travelDurationFor`, in `lib/sharedElementTravel`. The curve and the
 * distance-derived duration are the reason a short mobile hop and a long desktop
 * diagonal both feel right, and restating either here would let them drift.
 *
 * The travel is driven from `requestAnimationFrame` rather than a CSS
 * transition for the same reason: `easeTravel` is a JavaScript function, and
 * re-expressing its curve as a bezier string in CSS would be a second copy of a
 * number that has already been tuned once.
 */
/**
 * The stage's primary action, in every phase that has one.
 *
 * `size="lg"` already clears the pill's radius here, so this is only about the
 * label: `Button`'s base sets `whitespace-nowrap`, which makes any string longer
 * than the English one — "Reveal your reward", "Try again", "Open Badges", and
 * every translation of them — push out through the pill's ends rather than
 * wrap. Letting it wrap into a slightly taller pill keeps the action readable
 * instead of clipped, and keeps the stage's two actions the same shape.
 */
const STAGE_ACTION =
  'h-auto min-h-11 w-full gap-1.5 whitespace-normal rounded-full py-2.5 leading-tight';

export function RewardCeremony({
  phase,
  slow = false,
  failures = 0,
  skipped = false,
  rewardRevealed = false,
  onReveal,
  onSkipReveal,
  onOpenBadges,
  sourceRect,
  sourceElement,
  onSettle,
  onRequestClose,
  onFinishClose,
}: {
  phase: RewardCeremonyPhase;
  /** Whether the claim is slow enough to be worth explaining. Acting only. */
  slow?: boolean;
  /** Consecutive failures this ceremony has seen. Copy only. */
  failures?: number;
  /** Whether the reveal was skipped, so it should land without easing. */
  skipped?: boolean;
  /**
   * Whether the reward is revealed in *persisted* state. Keeps the badge on
   * screen while the stage travels back: `revealing` and `settled` both end when
   * closing begins, and without this the reward re-sealed itself on the way out.
   */
  rewardRevealed?: boolean;
  /** The ceremonial act: submit the claim, then reveal. */
  onReveal: () => void;
  /** Jump to the end of the reveal. Never undoes it. */
  onSkipReveal: () => void;
  /** Leave the ceremony, and the badges destination. */
  onOpenBadges: () => void;
  /** Where the reward was when it was clicked. A ref, read at animation time. */
  sourceRect: { current: DOMRect | null };
  /** The reward element, re-measured on the way back. May have unmounted. */
  sourceElement: { current: HTMLElement | null };
  onSettle: () => void;
  onRequestClose: () => void;
  onFinishClose: () => void;
}) {
  const artSize = useCeremonyArtSize();
  // State, not a ref. The stage lives in a portal that Radix mounts on its own
  // schedule, so a plain ref is not guaranteed to be attached by the time this
  // component's layout effect runs — and a travel that starts against a null
  // node silently degrades to the no-motion fallback. Holding the node in state
  // re-runs the effect the moment it actually exists.
  const [artNode, setArtNode] = useState<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const reduced = prefersReducedMotion();

  const cancelFrame = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  /**
   * Fly the reward between its own resting position and `rect`.
   *
   * `direction: 'in'` animates from the rect to identity, `'out'` the reverse.
   * Both end by clearing the inline transform, so a ceremony interrupted
   * half-way never leaves the art parked at an offset.
   */
  const travel = useCallback(
    (el: HTMLElement, rect: DOMRect | null, direction: 'in' | 'out', onDone: () => void) => {
      if (reduced || !isUsableRect(rect)) {
        // No measurable source, or motion is unwelcome. The overlay's own fade
        // carries the transition instead — never a guess at coordinates.
        el.style.transform = '';
        onDone();
        return;
      }

      const { dx, dy, scale } = transformOnto(rect, el.getBoundingClientRect());
      const duration = travelDurationFor(Math.hypot(dx, dy));
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeTravel(direction === 'in' ? t : 1 - t);
        // eased 1 → resting, eased 0 → exactly over the source rect.
        const k = 1 - eased;
        el.style.transform =
          `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px) ` +
          `scale(${(1 + (scale - 1) * k).toFixed(4)})`;

        if (t < 1) {
          frameRef.current = requestAnimationFrame(tick);
        } else {
          frameRef.current = 0;
          if (direction === 'in') el.style.transform = '';
          onDone();
        }
      };

      // Place it over the source before the first paint, so the entrance never
      // flashes at its destination first.
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      frameRef.current = requestAnimationFrame(tick);
    },
    [reduced],
  );

  // Entrance. `useLayoutEffect` so the starting transform is applied in the
  // same frame the node appears.
  //
  // A missing node means "not mounted yet", which is a *wait*, not a failure:
  // settling here would end the entrance before the thing it animates exists,
  // and the re-run once the node arrived would find the phase already past.
  useLayoutEffect(() => {
    if (phase !== 'opening' || !artNode) return;
    travel(artNode, sourceRect.current, 'in', onSettle);
    return cancelFrame;
  }, [phase, artNode, travel, sourceRect, onSettle, cancelFrame]);

  // Return. The source is re-measured now rather than reusing the opening
  // rect: the page may have scrolled, resized, or dropped the element entirely,
  // and flying to where it used to be is worse than not flying at all.
  //
  // No node here is different: closing must finish regardless, or the ceremony
  // would hang waiting for an element that is on its way out.
  useLayoutEffect(() => {
    if (phase !== 'closing') return;
    if (!artNode) {
      onFinishClose();
      return;
    }
    const live = sourceElement.current?.getBoundingClientRect() ?? null;
    travel(artNode, live, 'out', onFinishClose);
    return cancelFrame;
  }, [phase, artNode, travel, sourceElement, onFinishClose, cancelFrame]);

  useEffect(() => cancelFrame, [cancelFrame]);

  const open = phase !== 'closed';
  // The composition is quiet while the reward is still flying: it belongs to the
  // settled stage, not to the journey there.
  const composed = phase !== 'opening' && phase !== 'closing';
  const acting = phase === 'acting';
  const failed = phase === 'failed';
  const revealing = phase === 'revealing';
  const settled = phase === 'settled';
  const revealed = revealing || settled || rewardRevealed;

  const title = revealed
    ? 'Ditto Explorer'
    : failed
      ? 'That didn\'t go through.'
      : 'Your reward is waiting.';

  const body = revealed
    ? 'Reward revealed. Your badge claim was submitted, and the badge will appear in Badges once it has been issued.'
    : failed
      ? failures > 1
        ? 'Still not going through. Your journey is complete either way, and the reward is here whenever this works.'
        : 'Nothing was lost, so you can try again.'
      : 'You completed your first journey through Ditto.';

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onRequestClose(); }}>
      <DialogPortal>
        <DialogPrimitive.Overlay
          data-reward-ceremony-scrim=""
          className={cn(
            // Tint plus a light blur, the same treatment every other dialog in
            // the app uses. The tint alone left the page's own headings legible
            // enough to compete with the ceremony's copy; the blur turns what is
            // behind into depth rather than into words.
            'fixed inset-0 z-[240] bg-background/90 backdrop-blur-sm',
            !reduced && 'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          data-reward-ceremony=""
          data-phase={phase}
          aria-describedby={undefined}
          // Radix restores focus and traps it here meanwhile. Nothing about
          // focus is hand-rolled.
          className={cn(
            'fixed inset-0 z-[240] flex flex-col items-center justify-center gap-7 outline-none',
            // The stage never scrolls sideways, whatever a child asks for.
            'overflow-hidden',
            'px-6 [padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]',
            // dvh, not vh: iOS Safari's collapsing toolbar otherwise pushes the
            // Close control under the browser chrome.
            'h-[100dvh]',
            'sm:gap-9',
          )}
        >
          {/* The reward. Laid out in its final place from the first frame; only
              its transform moves, so nothing around it reflows as it arrives.
              The press reaction lives on an inner wrapper so it cannot fight the
              travel transform on the outer one. */}
          <div
            ref={setArtNode}
            data-reward-travel=""
            className="shrink-0"
            style={{ willChange: 'transform' }}
          >
            <div
              data-reward-seal=""
              className={cn(
                'rounded-2xl',
                // Under reduced motion the seal answers with a ring rather than
                // a movement. The state is still legible; only the physics go.
                reduced
                  ? acting && 'ring-2 ring-primary/50'
                  : acting && 'reward-seal-press',
              )}
            >
              <ExplorerRewardArt
                size={artSize}
                ready
                revealed={revealed}
                instant={skipped}
              />
            </div>
          </div>

          {/* Laid out in full from the start and revealed with opacity alone, so
              the reward never shifts as the copy changes. */}
          <div
            className={cn(
              // `w-full` as well as the cap: on a 360px phone a bare `max-w-sm`
              // is wider than the viewport, so the column grew past its parent
              // and took the whole centred composition off-centre with it.
              'flex w-full max-w-sm flex-col items-center gap-2 text-center',
              'transition-opacity duration-500',
              composed ? 'opacity-100' : 'opacity-0',
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {revealed ? 'Your reward' : 'Special reward'}
            </p>
            <DialogTitle className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {title}
            </DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>

          {/* Actions. One column so nothing reflows between phases. */}
          <div
            className={cn(
              'flex w-full max-w-sm shrink-0 flex-col items-center gap-1',
              'transition-opacity duration-500',
              composed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {acting ? (
              /* The seal is the thing being watched, so the status is a line of
                 text rather than a spinner competing with it. Polite, and only
                 two possible strings, so it cannot chatter. */
              <p
                role="status"
                aria-live="polite"
                className="py-2 text-sm font-medium text-muted-foreground"
              >
                {slow ? 'Still sending. Your signer may be waiting for you.' : 'Sending your claim…'}
              </p>
            ) : settled ? (
              <div className="flex w-full max-w-64 flex-col items-center gap-2">
                <Button
                  type="button"
                  size="lg"
                  className={cn(STAGE_ACTION, 'font-semibold')}
                  onClick={onOpenBadges}
                >
                  <Award className="size-4" aria-hidden />
                  Open Badges
                </Button>
              </div>
            ) : revealing ? (
              /* The only control while the badge is resolving. Skipping ends the
                 animation, not the reward: the reveal is already persisted. */
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full px-5 text-muted-foreground hover:text-foreground"
                onClick={onSkipReveal}
              >
                Skip
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="lg"
                  className={cn(STAGE_ACTION, 'max-w-64 font-semibold')}
                  onClick={onReveal}
                >
                  {failed ? (
                    <>
                      <RotateCcw className="size-4" aria-hidden />
                      Try again
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden />
                      Reveal your reward
                    </>
                  )}
                </Button>
                {!failed && (
                  <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
                    Revealing publishes a public claim so your badge can be issued.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Always reachable, in every phase, including while a claim is in
              flight: the publish belongs to the hook and carries on without the
              stage being open to watch it. */}
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'shrink-0 rounded-full px-6 text-muted-foreground hover:text-foreground',
                'transition-opacity duration-500',
                composed ? 'opacity-100' : 'opacity-0',
              )}
            >
              {revealed ? 'Done' : 'Close'}
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
