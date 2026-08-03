/**
 * True only in Vite dev mode on a localhost hostname — for UI that must
 * never appear on deployed environments.
 *
 * Kept out of the ./index barrel so importing it doesn't drag the whole
 * dev editor into the production entry chunk.
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
