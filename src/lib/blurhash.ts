import { decode, isBlurhashValid } from 'blurhash';

/** Returns `true` when `hash` is a structurally valid blurhash string. */
export function isValidBlurhash(hash: string | undefined | null): hash is string {
  if (!hash) return false;
  return isBlurhashValid(hash).result;
}

/** Decode resolution. The result is stretched to fill its box, so 32² is plenty. */
const SIZE = 32;

/** Most recently used decoded placeholders, keyed by hash. */
const cache = new Map<string, string>();
const MAX_CACHED = 500;

/**
 * Decode a blurhash into a PNG data URL, memoized by hash.
 *
 * react-blurhash redrew its canvas on every update — any parent re-render, such
 * as a video's timeupdate — and decoded again on every remount of a windowed
 * feed row. A decoded placeholder is a few hundred bytes, so keep it.
 */
export function decodeBlurhash(hash: string): string | undefined {
  const hit = cache.get(hash);
  if (hit !== undefined) {
    cache.delete(hash);
    cache.set(hash, hit);
    return hit;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const image = ctx.createImageData(SIZE, SIZE);
    image.data.set(decode(hash, SIZE, SIZE, 1));
    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL('image/png');
    cache.set(hash, url);
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return url;
  } catch {
    return undefined;
  }
}
