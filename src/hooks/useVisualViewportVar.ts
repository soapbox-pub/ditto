import { useEffect } from 'react';

/**
 * Keeps the `--visual-viewport-height` CSS variable on `<html>` in sync with
 * `window.visualViewport.height` while the calling component is mounted.
 *
 * Unlike `100dvh`, the visual viewport shrinks when the virtual keyboard
 * opens on platforms where the keyboard overlays the page instead of
 * resizing it (mobile Safari, Android Chrome in overlay mode). Elements
 * sized with this variable therefore never end up hidden behind the
 * keyboard.
 *
 * When the Visual Viewport API is unavailable the variable is never set, so
 * consumers must provide a fallback, e.g.:
 *
 * ```
 * h-[var(--visual-viewport-height,100dvh)]
 * ```
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    const update = () => {
      root.style.setProperty('--visual-viewport-height', `${Math.round(vv.height)}px`);
    };

    vv.addEventListener('resize', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      root.style.removeProperty('--visual-viewport-height');
    };
  }, []);
}
