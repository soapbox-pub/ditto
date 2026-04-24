/**
 * OverstimulationBlockOverlay — Full-screen visual feedback when Blobbi is
 * overstimulated. Zooms the UI toward Blobbi (#root transform), fires a
 * radial shockwave, and holds a red vignette. Portaled to document.body
 * so the overlay stays at viewport scale while #root is zoomed.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOCKWAVE_MS = 600;
const VIGNETTE_IN_MS = 300;
const VIGNETTE_OUT_MS = 600;
const ZOOM = 5;
const ZOOM_IN_MS = 280;
const ZOOM_OUT_MS = 700;

interface Props {
  isBlocked: boolean;
}

export function OverstimulationBlockOverlay({ isBlocked }: Props) {
  const [visible, setVisible] = useState(false);
  const [shockwave, setShockwave] = useState(false);
  const wasBlocked = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    if (isBlocked && !wasBlocked.current) {
      // Find Blobbi's true visual center via DOM query
      const el = document.querySelector<HTMLElement>('[data-blobbi-companion]');
      const cx = el ? el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 : window.innerWidth / 2;
      const cy = el ? el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 : window.innerHeight / 2;
      origin.current = { x: cx, y: cy };

      root.style.transformOrigin = `${cx}px ${cy}px`;
      root.style.transition = `transform ${ZOOM_IN_MS}ms cubic-bezier(0.22,1,0.36,1)`;
      root.style.transform = `scale(${ZOOM})`;
      document.body.style.overflow = 'hidden';

      if (fadeTimer.current) { clearTimeout(fadeTimer.current); fadeTimer.current = null; }
      setVisible(true);
      setShockwave(true);
    } else if (!isBlocked && wasBlocked.current) {
      root.style.transition = `transform ${ZOOM_OUT_MS}ms cubic-bezier(0.16,1,0.3,1)`;
      root.style.transform = 'scale(1)';
      setShockwave(false);
      fadeTimer.current = setTimeout(() => {
        root.style.transform = root.style.transformOrigin = root.style.transition = '';
        document.body.style.overflow = '';
        setVisible(false);
        fadeTimer.current = null;
      }, Math.max(VIGNETTE_OUT_MS, ZOOM_OUT_MS));
    }
    wasBlocked.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => () => {
    const root = document.getElementById('root');
    if (root) root.style.transform = root.style.transformOrigin = root.style.transition = '';
    document.body.style.overflow = '';
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
  }, []);

  useEffect(() => {
    if (!shockwave) return;
    const t = setTimeout(() => setShockwave(false), SHOCKWAVE_MS);
    return () => clearTimeout(t);
  }, [shockwave]);

  if (!visible) return null;

  const { x, y } = origin.current;
  const css = { '--sx': `${x}px`, '--sy': `${y}px` } as React.CSSProperties;

  return createPortal(
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          pointerEvents: isBlocked ? 'all' : 'none',
          background: `radial-gradient(ellipse 60% 60% at var(--sx) var(--sy),
            transparent 0%, rgba(127,29,29,0.06) 40%, rgba(127,29,29,0.18) 70%, rgba(127,29,29,0.30) 100%)`,
          animation: isBlocked
            ? `overstim-vignette-in ${VIGNETTE_IN_MS}ms ease-out forwards`
            : `overstim-vignette-out ${VIGNETTE_OUT_MS}ms ease-in forwards`,
          ...css,
        }}
      />
      {shockwave && (
        <div
          aria-hidden
          style={{
            position: 'fixed', zIndex: 100000, pointerEvents: 'none', borderRadius: '50%',
            left: `calc(var(--sx) - 50vmax)`, top: `calc(var(--sy) - 50vmax)`,
            width: '100vmax', height: '100vmax',
            background: `radial-gradient(circle at center,
              transparent 30%, rgba(239,68,68,0.35) 45%, rgba(239,68,68,0.20) 55%, transparent 70%)`,
            animation: `overstim-shockwave ${SHOCKWAVE_MS}ms ease-out forwards`,
            ...css,
          }}
        />
      )}
    </>,
    document.body,
  );
}
