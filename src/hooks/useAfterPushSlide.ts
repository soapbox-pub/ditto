import { startTransition, useEffect, useState } from 'react';

import { getPendingPushSlide } from '@/lib/pushTransition';

/**
 * False while this component is rendering as part of a push slide that
 * hasn't started moving yet, then true.
 *
 * A push slide (see pushTransition) waits for the new page's first render
 * before anything moves, so every millisecond that render takes is time the
 * tap appears ignored. Heavy, below-the-fold parts of a page (a thread's
 * replies) render their placeholder until this flips, which happens once the
 * slide is under way; the slide shows the page live, so they fill in as it
 * moves. Outside a push slide this is true from the first render.
 */
export function useAfterPushSlide(): boolean {
  const [slide] = useState(getPendingPushSlide);
  const [ready, setReady] = useState(slide === null);

  useEffect(() => {
    if (!slide) return;
    let cancelled = false;
    slide.then(() => {
      if (!cancelled) startTransition(() => setReady(true));
    });
    return () => {
      cancelled = true;
    };
  }, [slide]);

  return ready;
}
