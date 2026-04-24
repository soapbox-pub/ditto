/**
 * OverstimulationBlockOverlay — Visual feedback when Blobbi is overstimulated.
 *
 * Renders a full-viewport overlay that:
 *   1. Blocks all pointer events (functional: prevents further clicks)
 *   2. Zooms the entire UI toward Blobbi's face (transform on #root)
 *   3. Fires a one-shot radial shockwave from Blobbi's center position
 *   4. Holds a red-tinted vignette for the duration of the block
 *   5. Smoothly reverses zoom + fades vignette when the block ends
 *
 * The zoom origin is derived from `getBoundingClientRect()` on the
 * companion's DOM element, so it targets the true visual center of
 * Blobbi regardless of float offsets, transforms, or bounding box quirks.
 *
 * The zoom is applied imperatively to `#root` so the entire page content
 * pulls toward Blobbi. The overlay elements (vignette, shockwave) sit
 * outside the zoom via a React portal on `document.body`.
 *
 * All animations use CSS transitions/keyframes for GPU compositing.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

// ─── Animation Timing ─────────────────────────────────────────────────────────

/** How long the shockwave ring takes to expand and fade (ms). */
const SHOCKWAVE_DURATION_MS = 600;

/** How long the vignette takes to fade in (ms). */
const VIGNETTE_FADE_IN_MS = 300;

/** How long the vignette takes to fade out after unblock (ms). */
const VIGNETTE_FADE_OUT_MS = 600;

/** Zoom scale factor when blocked. */
const ZOOM_SCALE = 5;

/** Zoom-in duration (ms) — fast snap toward Blobbi. */
const ZOOM_IN_MS = 280;

/** Zoom-out duration (ms) — slower ease back to normal. */
const ZOOM_OUT_MS = 700;

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverstimulationBlockOverlayProps {
  /** Whether the blocked phase is currently active. */
  isBlocked: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverstimulationBlockOverlay({
  isBlocked,
}: OverstimulationBlockOverlayProps) {
  // Track whether we should render overlay elements (stays true during fade-out)
  const [isVisible, setIsVisible] = useState(false);
  // Track whether the shockwave should play (one-shot per block)
  const [showShockwave, setShowShockwave] = useState(false);
  // Track previous blocked state to detect rising edge
  const wasBlockedRef = useRef(false);
  // Capture the position at the moment the block starts (shockwave + zoom origin)
  const originRef = useRef({ x: 0, y: 0 });
  // Fade-out timer
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── #root zoom ────────────────────────────────────────────────────────────
  // Imperatively apply transform to #root so the entire UI zooms toward
  // Blobbi. The overlay sits in a portal on document.body, outside #root,
  // so it stays at viewport scale.

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    if (isBlocked && !wasBlockedRef.current) {
      // Rising edge — snap zoom in
      // Query the companion DOM element directly for its true visual center
      const el = document.querySelector<HTMLElement>('[data-blobbi-companion]');
      let cx = window.innerWidth / 2;
      let cy = window.innerHeight / 2;
      if (el) {
        const rect = el.getBoundingClientRect();
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      }
      originRef.current = { x: cx, y: cy };

      root.style.transformOrigin = `${cx}px ${cy}px`;
      root.style.transition = `transform ${ZOOM_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      root.style.transform = `scale(${ZOOM_SCALE})`;
      document.body.style.overflow = 'hidden';

      // Clear any pending fade-out
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }

      setIsVisible(true);
      setShowShockwave(true);
    } else if (!isBlocked && wasBlockedRef.current) {
      // Falling edge — ease zoom out
      root.style.transition = `transform ${ZOOM_OUT_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      root.style.transform = 'scale(1)';

      setShowShockwave(false);
      fadeTimerRef.current = setTimeout(() => {
        // Clean up inline styles completely after zoom-out finishes
        root.style.transform = '';
        root.style.transformOrigin = '';
        root.style.transition = '';
        document.body.style.overflow = '';
        setIsVisible(false);
        fadeTimerRef.current = null;
      }, Math.max(VIGNETTE_FADE_OUT_MS, ZOOM_OUT_MS));
    }

    wasBlockedRef.current = isBlocked;
  }, [isBlocked]);

  // Clean up #root styles on unmount
  useEffect(() => {
    return () => {
      const root = document.getElementById('root');
      if (root) {
        root.style.transform = '';
        root.style.transformOrigin = '';
        root.style.transition = '';
      }
      document.body.style.overflow = '';
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  // Clear shockwave flag after its animation completes
  useEffect(() => {
    if (!showShockwave) return;
    const timer = setTimeout(() => setShowShockwave(false), SHOCKWAVE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showShockwave]);

  // Origin state for CSS custom properties (synced from ref on rising edge)
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);

  useEffect(() => {
    if (isVisible) {
      setOriginX(originRef.current.x);
      setOriginY(originRef.current.y);
    }
  }, [isVisible]);

  const originStyle = useMemo(() => ({
    '--shock-x': `${originX}px`,
    '--shock-y': `${originY}px`,
  } as React.CSSProperties), [originX, originY]);

  if (!isVisible) return null;

  // Portal onto document.body so the overlay sits outside #root's zoom transform
  return createPortal(
    <>
      {/* Vignette overlay — blocks events + provides visual dimming */}
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

      {/* Shockwave ring — one-shot expand + fade */}
      {showShockwave && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            // Center the shockwave element on the origin
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
