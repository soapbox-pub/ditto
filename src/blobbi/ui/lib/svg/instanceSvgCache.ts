import { sanitizeBlobbiSvg } from '@/lib/sanitizeBlobbiSvg';

/**
 * Stands in for the instance ID while an SVG is built, so one built and
 * sanitized SVG serves every instance of the same Blobbi. Letters only, so the
 * pipeline's own `[^a-zA-Z0-9_-]` scrubbing leaves it intact.
 */
const TOKEN = 'blobbiinstancetoken';

const cache = new Map<string, string>();
const MAX_CACHED = 64;

/**
 * Build and sanitize a Blobbi SVG, reusing the result across instances.
 *
 * The pipeline (customize, eye animation, recipe, body effects, then a full
 * DOMPurify pass) cost several milliseconds per Blobbi, and each render bakes
 * in a per-instance ID so repeated Blobbis on a page don't share element IDs.
 * That made every mount — including each remount as a windowed feed scrolls —
 * start from scratch. Build once with a placeholder ID, cache the sanitized
 * output under `key`, and substitute the real ID afterwards.
 *
 * The substituted ID is restricted to `[a-zA-Z0-9_-]`, so splicing it into
 * already-sanitized markup cannot introduce anything DOMPurify would strip.
 *
 * @param key Everything the build depends on other than the instance ID.
 */
export function buildInstanceSvg(
  key: string,
  instanceId: string,
  build: (instanceId: string) => string,
): string {
  let safe = cache.get(key);
  if (safe === undefined) {
    safe = sanitizeBlobbiSvg(build(TOKEN));
    cache.set(key, safe);
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  } else {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, safe);
  }
  return safe.split(TOKEN).join(instanceId.replace(/[^a-zA-Z0-9_-]/g, '_'));
}
