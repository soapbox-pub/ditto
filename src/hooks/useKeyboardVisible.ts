import { useEffect, useState } from 'react';

/**
 * Detects whether the virtual keyboard is likely open on mobile devices.
 *
 * Uses the Visual Viewport API to compare the visible viewport height against
 * the full layout viewport. When the keyboard slides up, `visualViewport.height`
 * shrinks while `window.innerHeight` stays the same (or changes minimally).
 *
 * A threshold of 0.75 (75%) is used — if the visible area is less than 75% of
 * the layout viewport, we assume the keyboard is open.
 *
 * Also toggles a `keyboard-visible` class on `<html>` so pure-CSS components
 * (e.g. Dialog, AlertDialog) can react to keyboard state without a hook.
 */
export function useKeyboardVisible(): boolean {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const THRESHOLD = 0.75;

    const check = () => {
      const ratio = vv.height / window.innerHeight;
      const visible = ratio < THRESHOLD;
      setIsKeyboardVisible(visible);
      document.documentElement.classList.toggle('keyboard-visible', visible);
    };

    vv.addEventListener('resize', check);
    check();

    return () => {
      vv.removeEventListener('resize', check);
      document.documentElement.classList.remove('keyboard-visible');
    };
  }, []);

  return isKeyboardVisible;
}
