import { useEffect } from 'react';

/**
 * Keeps the `--visual-viewport-height` and `--visual-viewport-offset-top` CSS
 * variables on `<html>` in sync with `window.visualViewport` while the calling
 * component is mounted.
 *
 * Unlike `100dvh`, the visual viewport shrinks when the virtual keyboard
 * opens on platforms where the keyboard overlays the page instead of
 * resizing it (mobile Safari, Android Chrome in overlay mode). Elements
 * sized with `--visual-viewport-height` therefore never end up hidden behind
 * the keyboard.
 *
 * `--visual-viewport-offset-top` is `visualViewport.offsetTop`: on iOS, when
 * the keyboard raises and Safari scrolls the *layout* viewport to reveal the
 * focused input, the visual viewport shifts down by this amount. A
 * `position: fixed` element is positioned against the layout viewport, so it
 * would otherwise stay glued to the top of the *un-shifted* page — appearing
 * clipped at the top with a gap above the keyboard. Consuming this offset as
 * the element's `top` keeps it aligned with the visible viewport.
 *
 * `offsetTop` changes are reported via the `scroll` event, not `resize`, so we
 * listen for both.
 *
 * When the Visual Viewport API is unavailable the variables are never set, so
 * consumers must provide fallbacks, e.g.:
 *
 * ```
 * top-[var(--visual-viewport-offset-top,0px)] h-[var(--visual-viewport-height,100dvh)]
 * ```
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    const update = () => {
      root.style.setProperty('--visual-viewport-height', `${Math.round(vv.height)}px`);
      root.style.setProperty('--visual-viewport-offset-top', `${Math.round(vv.offsetTop)}px`);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-offset-top');
    };
  }, []);
}
