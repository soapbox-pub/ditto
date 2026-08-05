/**
 * True only in Vite dev mode on a localhost hostname — for development-only
 * behaviour that must never appear on a deployed environment.
 *
 * Mirrors the established precedent in `src/blobbi/dev/isLocalhostDev.ts`. It is
 * duplicated rather than imported so the mission code doesn't reach into the
 * Blobbi module for a two-line utility; both are deliberately tiny.
 *
 * `import.meta.env.DEV` is statically false in a production build, so every
 * branch guarded by this is dropped by the bundler and cannot reach end users.
 * The hostname check is a second line of defence for dev builds served on a
 * real host.
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
