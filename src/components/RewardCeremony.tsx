import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { SealedRewardArt } from '@/components/MissionArt';
import { Button } from '@/components/ui/button';
import { Dialog, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import {
  easeTravel,
  travelDurationFor,
} from '@/hooks/useExplorerArrivalTransition';
import type { RewardCeremonyPhase } from '@/hooks/useRewardCeremony';
import { prefersReducedMotion } from '@/lib/reducedMotion';
import { cn } from '@/lib/utils';

/**
 * How big the sealed reward is on the ceremony stage.
 *
 * A number rather than a class because `SealedRewardArt` derives its blur from
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
 * Today it does exactly one thing: it takes the sealed reward the user clicked,
 * carries it to the middle of a quietened screen, and waits. There is no claim,
 * no reveal, no astronaut, and nothing here writes a single byte of mission
 * state. It is the room, built and validated before anything is staged in it.
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
 * of an animation. What *is* reused is the part that is genuinely shared and
 * genuinely pure: `easeTravel` and `travelDurationFor`. The curve and the
 * distance-derived duration are the reason a short mobile hop and a long desktop
 * diagonal both feel right, and restating either here would let them drift.
 *
 * The travel is driven from `requestAnimationFrame` rather than a CSS
 * transition for the same reason: `easeTravel` is a JavaScript function, and
 * re-expressing its curve as a bezier string in CSS would be a second copy of a
 * number that has already been tuned once.
 */
export function RewardCeremony({
  phase,
  sourceRect,
  sourceElement,
  onSettle,
  onRequestClose,
  onFinishClose,
}: {
  phase: RewardCeremonyPhase;
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
  // The copy is quiet while the reward is still flying: it belongs to the
  // settled composition, not to the journey there.
  const settled = phase === 'sealed';

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
          aria-describedby={undefined}
          // Radix restores focus to the trigger on close by itself, and traps it
          // here meanwhile. Nothing about focus is hand-rolled.
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
              its transform moves, so nothing around it reflows as it arrives. */}
          <div ref={setArtNode} className="shrink-0" style={{ willChange: 'transform' }}>
            <SealedRewardArt size={artSize} ready />
          </div>

          {/* The composition is laid out in full from the start and revealed
              with opacity alone, so the reward does not shift as copy appears. */}
          <div
            className={cn(
              // `w-full` as well as the cap: on a 360px phone a bare `max-w-sm`
            // is wider than the viewport, so the column grew past its parent and
            // took the whole centred composition off-centre with it.
            'flex w-full max-w-sm flex-col items-center gap-2 text-center',
              'transition-opacity duration-500',
              settled ? 'opacity-100' : 'opacity-0',
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Special reward
            </p>
            <DialogTitle className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
              Your reward is waiting.
            </DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You completed your first journey through Ditto.
            </p>
          </div>

          {/* Close is the only action here, and that is deliberate: a button
              offering to reveal the reward would be a promise this build cannot
              keep, and a disabled one would be furniture. The gesture that opens
              the seal arrives with the thing it opens. */}
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'shrink-0 rounded-full px-6 text-muted-foreground hover:text-foreground',
                'transition-opacity duration-500',
                settled ? 'opacity-100' : 'opacity-0',
              )}
            >
              Close
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
