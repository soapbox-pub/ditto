import { useContext, useRef, useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageUnderlayContext } from '@/contexts/PageUnderlayContext';
import { impactMedium } from '@/lib/haptics';

/** Visual pull (px, after damping) that arms a refresh. */
const TRIGGER = 44;
/** The pull approaches this distance but never reaches it. */
const MAX_PULL = 140;
/** How much of the finger's travel the pull follows at the start. */
const RESISTANCE = 0.55;
/** Where the indicator rests while the refresh runs. */
const PARKED = 44;

/**
 * Rubber band: follows the finger at RESISTANCE at first, then gives less and
 * less the further it's pulled, easing towards MAX_PULL (the iOS overscroll curve).
 */
function rubberBand(diff: number): number {
  return MAX_PULL * (1 - 1 / ((diff * RESISTANCE) / MAX_PULL + 1));
}

/** Gesture state, on `data-ptr` of the container (CSS keys transitions and the spinner off it). */
type PullState = 'idle' | 'pulling' | 'refreshing';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  /**
   * `row` (default) draws a spinner in a row that opens above the content.
   * `none` draws nothing, for a page that shows the pull itself: the
   * container exposes `--ptr-pull` (px), `--ptr-progress` (0–1, 1 = armed)
   * and `data-ptr` (`idle` | `pulling` | `refreshing`) on a `group/ptr`.
   * Elements with the `ptr-follow` class spring back when the pull is let go.
   */
  indicator?: 'row' | 'none';
}

export function PullToRefresh({ onRefresh, children, className, indicator = 'row' }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const indicatorRef = useRef(indicator);
  indicatorRef.current = indicator;

  // Disable native browser pull-to-refresh only while this component is mounted
  // (on screen: the hidden copy under a pushed page leaves the document alone).
  const inUnderlay = useContext(PageUnderlayContext);
  useEffect(() => {
    if (inUnderlay) return;
    const prev = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'contain';
    return () => {
      document.documentElement.style.overscrollBehaviorY = prev;
    };
  }, [inUnderlay]);

  // The pull is written straight to CSS variables on the container, so
  // following the finger doesn't re-render the page under it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startY = 0;
    let pull = 0;
    let state: PullState = 'idle';
    let armed = false;

    const atTop = () => window.scrollY <= 0;

    function set(next: PullState, distance: number) {
      state = next;
      pull = distance;
      el!.dataset.ptr = next;
      el!.style.setProperty('--ptr-pull', `${distance}px`);
      el!.style.setProperty('--ptr-progress', String(next === 'refreshing' ? 1 : Math.min(distance / TRIGGER, 1)));
    }

    function onStart(e: TouchEvent) {
      if (state === 'refreshing' || !atTop()) return;
      startY = e.touches[0].clientY;
      armed = false;
    }

    function onMove(e: TouchEvent) {
      if (state === 'refreshing') return;
      const diff = e.touches[0].clientY - startY;

      if (diff > 0 && atTop()) {
        e.preventDefault(); // block native browser pull-to-refresh
        const d = rubberBand(diff);
        set('pulling', d);
        // Tick once as the pull arms, like iOS; letting go then refreshes.
        const nowArmed = d >= TRIGGER;
        if (nowArmed && !armed) impactMedium();
        armed = nowArmed;
      } else if (state === 'pulling') {
        armed = false;
        set('idle', 0);
      }
    }

    async function onEnd() {
      if (state !== 'pulling') return;

      if (pull < TRIGGER) {
        armed = false;
        set('idle', 0);
        return;
      }

      armed = false;
      set('refreshing', indicatorRef.current === 'row' ? PARKED : 0);
      try {
        await onRefreshRef.current();
      } finally {
        set('idle', 0);
      }
    }

    function onCancel() {
      if (state !== 'pulling') return;
      armed = false;
      set('idle', 0);
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-ptr="idle"
      className={cn('group/ptr', className)}
      style={{ '--ptr-pull': '0px', '--ptr-progress': '0' } as React.CSSProperties}
    >
      {indicator === 'row' && (
        // Pull indicator — mobile only
        <div
          className="ptr-follow flex items-center justify-center overflow-hidden sidebar:hidden"
          style={{ height: 'var(--ptr-pull)' }}
        >
          <div
            className="ptr-follow flex items-center justify-center size-8 rounded-full bg-secondary/80 border border-border shadow-sm"
            style={{
              opacity: 'var(--ptr-progress)',
              transform: 'scale(calc(0.5 + var(--ptr-progress) * 0.5)) rotate(calc(var(--ptr-progress) * 270deg))',
            }}
          >
            <Loader2 className="size-4 text-primary group-data-[ptr=refreshing]/ptr:animate-spin" />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
