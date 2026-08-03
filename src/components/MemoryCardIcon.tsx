import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface MemoryCardIconProps {
  /** Decoded 16×16 icon frames, or null to show an empty placeholder. */
  frames: ImageData[] | null;
  /** Rendered size in CSS pixels (the backing store is always 16×16). */
  size?: number;
  className?: string;
  /** Milliseconds per animation frame. */
  frameMs?: number;
}

/**
 * Paints a PS1 save icon (16×16, 1–3 frames) onto a pixel-scaled canvas and
 * animates multi-frame icons. Frames are `ImageData` from
 * {@link import('@/lib/memorycard').decodeBlockVisual}.
 */
export function MemoryCardIcon({ frames, size = 60, className, frameMs = 280 }: MemoryCardIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !frames || frames.length === 0) return;

    let i = 0;
    const draw = () => ctx.putImageData(frames[i % frames.length], 0, 0);
    draw();

    if (frames.length > 1) {
      const timer = setInterval(() => {
        i++;
        draw();
      }, frameMs);
      return () => clearInterval(timer);
    }
  }, [frames, frameMs]);

  return (
    <canvas
      ref={canvasRef}
      width={16}
      height={16}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className={cn(
        'shrink-0 rounded-md border border-border bg-muted',
        !frames && 'opacity-40',
        className,
      )}
      aria-hidden="true"
    />
  );
}
