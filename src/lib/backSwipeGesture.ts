/**
 * A rightward drag that follows the finger and either commits or springs
 * back, for `BackSwipe`. Ported from Armada's `useEdgeSwipe`.
 *
 * It claims the touch after a short rightward travel that isn't mostly
 * vertical, and commits past a quarter of the width or on a flick; a flick
 * back cancels even a long drag. Velocity is measured over a trailing window,
 * since a thumb slows in its last sample, and counts as zero if the finger
 * rested before lifting.
 */

/** Rightward travel (px) before the drag is claimed from the page's scroll. */
const CLAIM_THRESHOLD = 10;
/** Fraction of the width past which a release commits. */
const COMMIT_FRACTION = 0.25;
/** Release velocity (px/ms) that commits regardless of distance; flicking back this fast cancels. */
const COMMIT_VELOCITY = 0.3;
/** Release velocity is measured over this trailing window. */
const VELOCITY_WINDOW_MS = 100;
/** A finger that rested this long before lifting released at zero velocity. */
const VELOCITY_REST_MS = 50;
/** No pointer traffic for this long abandons a drag the WebView cut without an end event. */
const STALL_RESET_MS = 3000;

export interface BackSwipeHandlers {
  /** Whether a press here may start a swipe. */
  canStart: (event: PointerEvent) => boolean;
  /** The drag was claimed; the page is about to move. */
  onClaim: () => void;
  /** Progress in px, 0..width. Called synchronously per pointermove. */
  onMove: (dx: number) => void;
  /** The finger lifted after a claimed drag. `velocity` is px/ms, positive to the right. */
  onRelease: (committed: boolean, velocity: number) => void;
  /** Someone else took the touch (Android's system back gesture, a scroller); never commit. */
  onAbandon: () => void;
}

export function attachBackSwipe(el: HTMLElement, handlers: BackSwipeHandlers): () => void {
  let pointerId: number | null = null;
  let claimed = false;
  let startX = 0;
  let startY = 0;
  let width = 1;
  let dx = 0;
  let lastAt = 0;
  let samples: { t: number; x: number }[] = [];
  let watchdog: ReturnType<typeof setInterval> | undefined;

  // React's touch listeners are passive, so the browser would count the drag
  // as a scroll and swallow the next tap; cancel touchmove while claimed.
  const onTouchMove = (e: TouchEvent) => {
    if (claimed && e.cancelable) e.preventDefault();
  };

  const reset = () => {
    const wasClaimed = claimed;
    pointerId = null;
    claimed = false;
    dx = 0;
    clearInterval(watchdog);
    watchdog = undefined;
    return wasClaimed;
  };

  const abandon = () => {
    if (reset()) handlers.onAbandon();
  };

  const onDown = (e: PointerEvent) => {
    if (pointerId !== null) abandon();
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    if (!handlers.canStart(e)) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    width = window.innerWidth || 1;
    samples = [{ t: e.timeStamp, x: 0 }];
    lastAt = performance.now();
  };

  const onMoveEvent = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const moveX = e.clientX - startX;
    const moveY = e.clientY - startY;
    if (!claimed) {
      // Under `touch-action: pan-y` the first event may already carry some
      // vertical travel from a slight arc, so vertical must clearly dominate.
      if (Math.abs(moveY) > Math.abs(moveX) * 1.5 && Math.abs(moveY) > CLAIM_THRESHOLD) {
        reset();
        return;
      }
      if (moveX < -CLAIM_THRESHOLD) {
        reset();
        return;
      }
      if (moveX <= CLAIM_THRESHOLD) return;
      claimed = true;
      el.setPointerCapture?.(e.pointerId);
      watchdog = setInterval(() => {
        if (performance.now() - lastAt > STALL_RESET_MS) abandon();
      }, 500);
      handlers.onClaim();
    }
    if (e.cancelable) e.preventDefault();
    lastAt = performance.now();
    samples.push({ t: e.timeStamp, x: moveX });
    while (samples.length > 2 && e.timeStamp - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();
    dx = Math.max(0, Math.min(moveX, width));
    handlers.onMove(dx);
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dragged = dx;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity = first && last && last.t > first.t && e.timeStamp - last.t <= VELOCITY_REST_MS
      ? (last.x - first.x) / (last.t - first.t)
      : 0;
    if (!reset()) return;
    const committed = (dragged > width * COMMIT_FRACTION && velocity > -COMMIT_VELOCITY) || velocity > COMMIT_VELOCITY;
    handlers.onRelease(committed, velocity);
  };

  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) abandon();
  };
  const onHide = () => {
    if (document.visibilityState === 'hidden') abandon();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMoveEvent);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  // Safety nets for a stream that ends without an event on the element.
  window.addEventListener('pointercancel', onCancel);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', abandon);

  return () => {
    abandon();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMoveEvent);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', abandon);
  };
}
