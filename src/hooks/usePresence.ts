import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '@/lib/motion';

/**
 * Keeps something mounted for `exitMs` after `show` turns false, so it can
 * animate out instead of vanishing. `leaving` is true for that stretch.
 * Under reduced motion it unmounts at once.
 */
export function usePresence(show: boolean, exitMs: number): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show || !mounted) return;
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [show, mounted, exitMs]);

  return { mounted: mounted || show, leaving: mounted && !show };
}
