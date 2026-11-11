import { useContext, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import { PageUnderlayContext } from '@/contexts/PageUnderlayContext';

import { hasScrollPosition } from '@/lib/scrollPositions';

/**
 * True while the current page was reached by going back (or forward) to a
 * history entry whose scroll offset `ScrollToTop` is restoring.
 *
 * Feed queries use this to skip their stale-on-mount refetch: replacing the
 * pages under a restored offset prepends new posts and shifts the card the
 * user was reading out from under them. A fresh visit (initial load, tapping
 * Home, reload) has no saved offset and refetches as usual.
 */
export function useIsScrollRestore(): boolean {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  // The hidden copy of the previous page shows what the user left; a
  // refetch would change it, and the page they go back to, under them.
  const inUnderlay = useContext(PageUnderlayContext);
  return inUnderlay || (navigationType === 'POP' && hasScrollPosition(key));
}

/**
 * {@link useIsScrollRestore} as it was when the page arrived at its history
 * entry. The live value turns true on any entry once the page scrolls, which
 * saves an offset for it.
 */
export function useArrivedByScrollRestore(): boolean {
  const { key } = useLocation();
  const restoring = useIsScrollRestore();
  const [arrival, setArrival] = useState({ key, restoring });
  if (arrival.key !== key) setArrival({ key, restoring });
  return arrival.key === key ? arrival.restoring : restoring;
}
