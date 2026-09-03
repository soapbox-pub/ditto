import { useLocation, useNavigationType } from 'react-router-dom';

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
  return navigationType === 'POP' && hasScrollPosition(key);
}
