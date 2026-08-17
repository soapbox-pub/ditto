import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { onHistoryChange } from '@/lib/historyEvents';

/** Don't show the bar for navigations that commit faster than this — avoids a flash on instant/cached routes. */
const START_DELAY_MS = 120;
/** How often the bar "trickles" toward its ceiling while a navigation is pending. */
const TRICKLE_MS = 200;
/** Hold the completed (100%) bar briefly before fading out. */
const DONE_FADE_MS = 220;
/** The bar creeps toward this ceiling while pending, then jumps to 100% on commit. */
const CEILING = 90;

/**
 * Slim top progress bar that reflects React Router v7 navigation transitions.
 *
 * Because v7 wraps navigations in `startTransition`, the previous page stays on
 * screen until the next route is render-ready (its lazy chunk loaded and its
 * subtree rendered). With no feedback that hold reads as a freeze — most
 * noticeably on the feed, the heaviest and most-navigated route. This bar
 * signals "loading" for the duration of the hold, the way GitHub / Vercel /
 * Linear do, so the wait reads as intentional.
 *
 * It does not make navigation faster — it labels the transition. A genuinely
 * slow route render still takes as long; the bar just stops it looking broken.
 *
 * Must render inside the router (uses `useLocation`).
 */
export function NavigationProgress() {
  const location = useLocation();
  const [progress, setProgress] = useState(0); // 0 = hidden
  const activeRef = useRef(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trickleTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A navigation was requested (history changed) but React Router hasn't
  // committed the new location yet — the transition is in flight. Schedule the
  // bar to appear only if the transition outlasts START_DELAY_MS.
  useEffect(() => {
    return onHistoryChange(() => {
      clearTimeout(doneTimer.current);
      if (activeRef.current) return; // already showing; the commit effect finishes it
      clearTimeout(startTimer.current);
      startTimer.current = setTimeout(() => {
        activeRef.current = true;
        setProgress(8);
        trickleTimer.current = setInterval(() => {
          setProgress((p) => (p < CEILING ? p + (CEILING - p) * 0.1 : p));
        }, TRICKLE_MS);
      }, START_DELAY_MS);
    });
  }, []);

  // React Router settled on the new location — finish (or cancel) the bar.
  useEffect(() => {
    clearTimeout(startTimer.current);
    clearInterval(trickleTimer.current);
    if (!activeRef.current) return; // committed before the bar ever showed
    setProgress(100);
    doneTimer.current = setTimeout(() => {
      activeRef.current = false;
      setProgress(0);
    }, DONE_FADE_MS);
  }, [location.key]);

  // Clean up any pending timers on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(startTimer.current);
      clearInterval(trickleTimer.current);
      clearTimeout(doneTimer.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100]"
    >
      <div
        className="h-0.5 bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress > 0 ? 1 : 0 }}
      />
    </div>
  );
}
