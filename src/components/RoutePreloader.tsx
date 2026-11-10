import { useEffect } from 'react';

/** Wait this long after startup, so preloading never competes with the first feed. */
const PRELOAD_DELAY_MS = 2000;

/** Gap between pages, so each one's parse cost lands in its own idle stretch. */
const PRELOAD_GAP_MS = 500;

/** Loads the code for the likeliest next pages, one at a time, once the app has settled. */
export function RoutePreloader({ preloads }: { preloads: (() => Promise<unknown>)[] }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const next = (index: number) => {
      if (cancelled || index >= preloads.length) return;
      preloads[index]()
        .catch(() => {
          // A failed preload just means the page loads when it's opened.
        })
        .finally(() => {
          timer = setTimeout(() => next(index + 1), PRELOAD_GAP_MS);
        });
    };

    timer = setTimeout(() => next(0), PRELOAD_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preloads]);

  return null;
}
