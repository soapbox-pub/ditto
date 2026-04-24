/**
 * OverstimulationBlockOverlay — Visual feedback when Blobbi is overstimulated.
 *
 * When Blobbi hits max overstimulation:
 *   1. A radial shockwave expands from Blobbi's position
 *   2. The UI disintegrates via CSS mask (grid cells shrink to nothing
 *      in a staggered wave from Blobbi) while dark debris particles
 *      burst outward on a canvas overlay
 *   3. A dark red vignette holds during the block period
 *   4. On recovery, mask cells grow back (UI reconstitutes) while
 *      debris converges and fades
 *
 * Zero screen capture — the mask reveals/hides the live DOM directly.
 * Debris is drawn on a lightweight canvas (~350 rects per frame).
 *
 * The overlay is portaled to `document.body` so it stays visible
 * while `#root` is masked away.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

import type { Position } from '../types/companion.types';
import { crumble, type CrumbleHandle } from '../core/crumbleEngine';

// ─── Animation Timing ─────────────────────────────────────────────────────────

const SHOCKWAVE_DURATION_MS = 600;
const VIGNETTE_FADE_IN_MS = 300;
const VIGNETTE_FADE_OUT_MS = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverstimulationBlockOverlayProps {
  isBlocked: boolean;
  companionPosition: Position;
  companionSize: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverstimulationBlockOverlay({
  isBlocked,
  companionPosition,
  companionSize,
}: OverstimulationBlockOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showShockwave, setShowShockwave] = useState(false);
  const wasBlockedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const crumbleRef = useRef<CrumbleHandle | null>(null);

  useEffect(() => {
    if (isBlocked && !wasBlockedRef.current) {
      originRef.current = {
        x: companionPosition.x + companionSize / 2,
        y: companionPosition.y + companionSize / 2,
      };
      setIsVisible(true);
      setShowShockwave(true);

      // Start the crumble
      crumbleRef.current = crumble(originRef.current);
    } else if (!isBlocked && wasBlockedRef.current) {
      setShowShockwave(false);
      const handle = crumbleRef.current;
      if (handle) {
        handle.recover().then(() => {
          handle.destroy();
          crumbleRef.current = null;
          setIsVisible(false);
        });
      } else {
        setIsVisible(false);
      }
    }
    wasBlockedRef.current = isBlocked;
  }, [isBlocked, companionPosition, companionSize]);

  useEffect(() => {
    return () => {
      if (crumbleRef.current) {
        crumbleRef.current.destroy();
        crumbleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showShockwave) return;
    const timer = setTimeout(() => setShowShockwave(false), SHOCKWAVE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showShockwave]);

  const originX = isVisible ? originRef.current.x : 0;
  const originY = isVisible ? originRef.current.y : 0;
  const originStyle = useMemo(() => ({
    '--shock-x': `${originX}px`,
    '--shock-y': `${originY}px`,
  } as React.CSSProperties), [originX, originY]);

  if (!isVisible) return null;

  return createPortal(
    <>
      {/* Vignette — blocks events + red tint */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          pointerEvents: isBlocked ? 'all' : 'none',
          background: `radial-gradient(
            ellipse 60% 60% at var(--shock-x) var(--shock-y),
            transparent 0%,
            rgba(127, 29, 29, 0.06) 40%,
            rgba(127, 29, 29, 0.18) 70%,
            rgba(127, 29, 29, 0.30) 100%
          )`,
          animation: isBlocked
            ? `overstim-vignette-in ${VIGNETTE_FADE_IN_MS}ms ease-out forwards`
            : `overstim-vignette-out ${VIGNETTE_FADE_OUT_MS}ms ease-in forwards`,
          ...originStyle,
        }}
      />

      {/* Shockwave ring */}
      {showShockwave && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: `calc(var(--shock-x) - 50vmax)`,
            top: `calc(var(--shock-y) - 50vmax)`,
            width: '100vmax',
            height: '100vmax',
            zIndex: 100000,
            pointerEvents: 'none',
            borderRadius: '50%',
            background: `radial-gradient(
              circle at center,
              transparent 30%,
              rgba(239, 68, 68, 0.35) 45%,
              rgba(239, 68, 68, 0.20) 55%,
              transparent 70%
            )`,
            animation: `overstim-shockwave ${SHOCKWAVE_DURATION_MS}ms ease-out forwards`,
            ...originStyle,
          }}
        />
      )}
    </>,
    document.body,
  );
}
