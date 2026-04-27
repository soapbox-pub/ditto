import { useEffect, useState } from 'react';

/** RGB triple returned by the hook, or null if extraction failed. */
export interface DominantColor {
  r: number;
  g: number;
  b: number;
  /** HSL representation for easy tinting. */
  h: number;
  s: number;
  l: number;
}

/** In-memory cache so repeat renders of the same icon don't re-sample. */
const cache = new Map<string, DominantColor | null>();

/** Downscaled canvas edge for sampling — keeps cost tiny. */
const SAMPLE_SIZE = 32;

/** Pixels with alpha below this are skipped. */
const ALPHA_THRESHOLD = 128;

/** Pixels with very low saturation (near gray/white/black) are skipped. */
const MIN_SATURATION = 0.15;

/** Pixels this close to pure white or black are skipped. */
const L_EDGE = 0.08;

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

/**
 * Extract a dominant hue from an image by sampling pixels in a downscaled
 * canvas and averaging the chromatic ones (skipping transparent, near-gray,
 * near-white, and near-black pixels).
 *
 * Returns `null` if the image can't be loaded (CORS failure) or has no
 * discernible dominant color (e.g. pure-grayscale icon).
 */
export function useDominantColor(url: string | undefined): DominantColor | null {
  const [color, setColor] = useState<DominantColor | null>(() => (url && cache.has(url) ? cache.get(url)! : null));

  useEffect(() => {
    if (!url) { setColor(null); return; }
    if (cache.has(url)) { setColor(cache.get(url)!); return; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { cache.set(url, null); setColor(null); return; }

        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        // Hue histogram (18 buckets × 20°), weighted by saturation × chroma-ish.
        const BUCKETS = 18;
        const weights = new Float32Array(BUCKETS);
        const sSum = new Float32Array(BUCKETS);
        const lSum = new Float32Array(BUCKETS);
        const counts = new Uint32Array(BUCKETS);

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < ALPHA_THRESHOLD) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const { h, s, l } = rgbToHsl(r, g, b);
          if (s < MIN_SATURATION) continue;
          if (l < L_EDGE || l > 1 - L_EDGE) continue;
          const bucket = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
          // Weight by saturation so vivid pixels dominate over muted ones.
          const w = s;
          weights[bucket] += w;
          sSum[bucket] += s * w;
          lSum[bucket] += l * w;
          counts[bucket] += 1;
        }

        // Find the bucket with the highest total weight.
        let best = -1, bestWeight = 0;
        for (let i = 0; i < BUCKETS; i++) {
          if (weights[i] > bestWeight) { bestWeight = weights[i]; best = i; }
        }

        if (best < 0 || counts[best] < 4) {
          cache.set(url, null);
          setColor(null);
          return;
        }

        // Bucket midpoint hue, saturation/lightness averaged within the bucket.
        const h = (best + 0.5) * (360 / BUCKETS);
        const s = sSum[best] / weights[best];
        const l = lSum[best] / weights[best];
        const rgb = hslToRgb(h, s, l);
        const result: DominantColor = { ...rgb, h, s, l };
        cache.set(url, result);
        setColor(result);
      } catch {
        // Canvas taint (CORS) or other failure — fall back to null.
        cache.set(url, null);
        setColor(null);
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      cache.set(url, null);
      setColor(null);
    };

    img.src = url;

    return () => { cancelled = true; };
  }, [url]);

  return color;
}
