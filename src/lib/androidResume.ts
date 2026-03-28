/**
 * Detects when a web app returns to the foreground after being backgrounded,
 * primarily to work around Android's WebSocket zombie connection problem.
 *
 * Android aggressively throttles backgrounded tabs, causing WebSocket connections
 * to silently miss events without triggering close/error handlers. This utility
 * detects the resume and reports how long the app was in the background, so
 * callers can force reconnection or re-query missed data.
 *
 * Framework-agnostic — no React dependency. Can be used in libraries.
 */

export interface AndroidResumeOptions {
  /** Minimum background duration (ms) before triggering. Default: 0 */
  threshold?: number;
  /** Called when the app returns to foreground after exceeding the threshold. */
  onResume?: (backgroundDurationMs: number) => void;
  /**
   * If true, only activates on Android user agents.
   * Set to false to test on desktop. Default: true
   */
  androidOnly?: boolean;
}

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function androidResume(options: AndroidResumeOptions = {}): { destroy: () => void } {
  const { threshold = 0, onResume, androidOnly = true } = options;
  const noop = { destroy: () => {} };

  // No-op in non-browser environments (e.g. Node.js, Deno without DOM).
  if (typeof document === 'undefined') return noop;

  if (androidOnly && !isAndroid()) return noop;

  let hiddenAt: number | null = null;

  const handler = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (document.visibilityState === 'visible') {
      if (hiddenAt === null) return;
      const duration = Date.now() - hiddenAt;
      hiddenAt = null;
      if (duration >= threshold) {
        onResume?.(duration);
      }
    }
  };

  document.addEventListener('visibilitychange', handler);
  return {
    destroy: () => {
      document.removeEventListener('visibilitychange', handler);
    },
  };
}
