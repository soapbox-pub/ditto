/**
 * True only in Vite dev mode on a localhost hostname — for development-only
 * behaviour that must never appear on a deployed environment.
 *
 * Mirrors the established precedent in `src/blobbi/dev/isLocalhostDev.ts`. It is
 * duplicated rather than imported so the mission code doesn't reach into the
 * Blobbi module for a two-line utility; both are deliberately tiny.
 *
 * `import.meta.env.DEV` is statically false in a production build, so this
 * returns `false` there unconditionally — no query parameter, hostname, or
 * console call can turn it on. The hostname check is a second line of defence
 * for dev builds served on a real host.
 *
 * It is a **runtime** gate, not a bundling one. Rollup folds the constant
 * inside this function but does not inline the function into its callers, so
 * modules reached through it are still emitted; a production build has been
 * checked and does contain them. They are unreachable, not absent.
 */
export function isLocalhostDev(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  }

  return false;
}
