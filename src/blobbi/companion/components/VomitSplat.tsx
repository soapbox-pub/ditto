/**
 * VomitSplat — Renders a vomit drop that falls from a spawn point to
 * near Blobbi, then becomes a persistent puddle until the user clicks it.
 *
 * Lifecycle:
 *   1. "falling" — CSS-animated drop from (spawnX, spawnY) to (landX, landY)
 *   2. "landed"  — Static puddle at (landX, landY), removed on click/tap
 *
 * The component is absolutely positioned inside the companion overlay layer
 * (fixed inset-0). Coordinates are in viewport px.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const FALL_DURATION_MS = 500;

interface VomitSplatProps {
  id: number;
  spawnX: number;
  spawnY: number;
  landX: number;
  landY: number;
  onRemove: (id: number) => void;
}

export function VomitSplat({ id, spawnX, spawnY, landX, landY, onRemove }: VomitSplatProps) {
  const [landed, setLanded] = useState(false);
  const fallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fallTimer.current = setTimeout(() => {
      fallTimer.current = null;
      setLanded(true);
    }, FALL_DURATION_MS);

    return () => {
      if (fallTimer.current !== null) {
        clearTimeout(fallTimer.current);
      }
    };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(id);
  }, [id, onRemove]);

  const fallDeltaX = landX - spawnX;
  const fallDeltaY = landY - spawnY;

  if (!landed) {
    // Falling drop — animated from spawn to land position
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: spawnX,
          top: spawnY,
          transform: 'translate(-50%, -50%)',
          animation: `vomit-fall ${FALL_DURATION_MS}ms ease-in forwards`,
          '--vomit-dx': `${fallDeltaX}px`,
          '--vomit-dy': `${fallDeltaY}px`,
        } as React.CSSProperties}
      >
        <VomitDrop />
      </div>
    );
  }

  // Landed puddle — interactive, click/tap to remove.
  // translate(-50%, -100%) places the puddle's bottom edge at landY,
  // so it sits like a splat on the ground rather than centering on the point.
  return (
    <button
      type="button"
      className="absolute cursor-pointer pointer-events-auto border-0 bg-transparent p-0"
      style={{
        left: landX,
        top: landY,
        transform: 'translate(-50%, -100%)',
        zIndex: 9998, // Below companion (10000+)
      }}
      onClick={handleClick}
      aria-label="Clean up puddle"
    >
      <VomitPuddle />
    </button>
  );
}

/** Small falling drop — green/yellow teardrop shape via SVG. */
function VomitDrop() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
      <path
        d="M6 0C6 0 1 7 1 10.5C1 13.5 3.2 15.5 6 15.5C8.8 15.5 11 13.5 11 10.5C11 7 6 0 6 0Z"
        fill="#6b9e3a"
        opacity="0.9"
      />
      <path
        d="M6 2C6 2 3 7.5 3 10C3 12 4.3 13.5 6 13.5C7.7 13.5 9 12 9 10C9 7.5 6 2 6 2Z"
        fill="#8fbf4a"
        opacity="0.5"
      />
    </svg>
  );
}

/** Landed puddle — small green/yellow splat shape via SVG. */
function VomitPuddle() {
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" fill="none" aria-hidden="true">
      <ellipse cx="14" cy="9" rx="13" ry="5" fill="#5a8a30" opacity="0.7" />
      <ellipse cx="14" cy="8" rx="11" ry="4" fill="#6b9e3a" opacity="0.85" />
      <ellipse cx="12" cy="7" rx="6" ry="2.5" fill="#8fbf4a" opacity="0.5" />
      <ellipse cx="17" cy="8.5" rx="4" ry="2" fill="#8fbf4a" opacity="0.4" />
    </svg>
  );
}
