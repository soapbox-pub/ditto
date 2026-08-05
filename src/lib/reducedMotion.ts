/**
 * Whether the user has asked the system to reduce motion.
 *
 * Shared by every mission/arrival surface so "respects reduced motion" means
 * the same thing everywhere, and so a single place can be fixed if the check
 * ever needs to become reactive rather than read-at-render.
 *
 * Safe to call during render and in non-browser environments.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
