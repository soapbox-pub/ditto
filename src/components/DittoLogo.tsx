import { useEffect, useRef, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface DittoLogoProps {
  className?: string;
  size?: number;
}

/** Whether the pixelated logo variant is shown this session. Decided once at module load. */
const isPixelated = crypto.getRandomValues(new Uint8Array(1))[0] < 13; // ~1 in 20 chance

/** Resolution of the pixel art grid. */
const GRID = 16;

/**
 * Rasterize the logo SVG at a tiny resolution, then run ridge detection
 * to extract thin 1px strokes that look like hand-drawn pixel art.
 *
 * Ridge detection finds pixels that are local alpha maxima along at least
 * one axis — this traces the center of strokes rather than their outlines,
 * producing cleaner, thinner lines than edge detection.
 *
 * Returns a data URL suitable for use as a CSS mask.
 */
function generatePixelArtMask(): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Step 1: Rasterize the SVG onto a small canvas.
      const src = document.createElement('canvas');
      src.width = GRID;
      src.height = GRID;
      const srcCtx = src.getContext('2d');
      if (!srcCtx) return reject(new Error('Canvas not supported'));
      srcCtx.drawImage(img, 0, 0, GRID, GRID);

      const srcData = srcCtx.getImageData(0, 0, GRID, GRID);
      const alpha: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(0));
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          alpha[y][x] = srcData.data[(y * GRID + x) * 4 + 3];
        }
      }

      const getAlpha = (y: number, x: number) =>
        y < 0 || y >= GRID || x < 0 || x >= GRID ? 0 : alpha[y][x];

      // Step 2: Ridge detection — find pixels that are local maxima along
      // at least one of the 4 axes (horizontal, vertical, 2 diagonals),
      // where at least one side falls below the threshold (near a stroke edge).
      const MIN_ALPHA = 25;
      const out = document.createElement('canvas');
      out.width = GRID;
      out.height = GRID;
      const outCtx = out.getContext('2d');
      if (!outCtx) return reject(new Error('Canvas not supported'));

      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const a = alpha[y][x];
          if (a <= MIN_ALPHA) continue;

          // Check all 4 axes for ridge condition.
          const axes: [number, number][] = [
            [getAlpha(y, x - 1), getAlpha(y, x + 1)],
            [getAlpha(y - 1, x), getAlpha(y + 1, x)],
            [getAlpha(y - 1, x - 1), getAlpha(y + 1, x + 1)],
            [getAlpha(y - 1, x + 1), getAlpha(y + 1, x - 1)],
          ];

          let isRidge = false;
          for (const [n1, n2] of axes) {
            if (a >= n1 && a >= n2 && (n1 <= MIN_ALPHA || n2 <= MIN_ALPHA)) {
              isRidge = true;
              break;
            }
          }

          if (isRidge) {
            outCtx.fillStyle = '#000';
            outCtx.fillRect(x, y, 1, 1);
          }
        }
      }

      resolve(out.toDataURL());
    };
    img.onerror = () => reject(new Error('Failed to load logo'));
    img.src = '/logo.svg';
  });
}

/** Cache the mask data URL so it's only generated once. */
let maskCache: string | null = null;
let maskPromise: Promise<string> | null = null;

function getPixelArtMask(): Promise<string> {
  if (maskCache) return Promise.resolve(maskCache);
  if (!maskPromise) {
    maskPromise = generatePixelArtMask().then((url) => {
      maskCache = url;
      return url;
    });
  }
  return maskPromise;
}

/** The Ditto logo rendered from the custom SVG asset. Occasionally appears pixelated for logged-in users. */
export function DittoLogo({ className, size = 40 }: DittoLogoProps) {
  const { user } = useCurrentUser();

  if (isPixelated && user) {
    return <PixelatedLogo className={className} size={size} />;
  }

  return (
    <div
      role="img"
      aria-label="Ditto"
      style={{
        width: size,
        height: size,
        backgroundColor: 'hsl(var(--primary))',
        maskImage: 'url(/logo.svg)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: 'url(/logo.svg)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
      className={cn(className)}
    />
  );
}

/** Dynamically generates a pixel-art edge-detected mask from the logo SVG. */
function PixelatedLogo({ className, size = 40 }: DittoLogoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(!!maskCache);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    getPixelArtMask().then((dataUrl) => {
      el.style.maskImage = `url(${dataUrl})`;
      el.style.webkitMaskImage = `url(${dataUrl})`;
      el.style.maskSize = 'contain';
      el.style.webkitMaskSize = 'contain';
      el.style.maskRepeat = 'no-repeat';
      el.style.webkitMaskRepeat = 'no-repeat';
      el.style.maskPosition = 'center';
      el.style.webkitMaskPosition = 'center';
      el.style.imageRendering = 'pixelated';
      setReady(true);
    });
  }, []);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Ditto"
      style={{
        width: size,
        height: size,
        backgroundColor: 'hsl(var(--primary))',
        imageRendering: 'pixelated',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.1s',
      }}
      className={cn(className)}
    />
  );
}
