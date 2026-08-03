import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query, re-rendering when it flips.
 *
 * Useful for skipping the *mount* of components that only hide themselves
 * with CSS (e.g. `hidden lg:flex`) — on phones that still costs their chunk
 * download, queries, and render work.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
